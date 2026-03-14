import "server-only";
import { TRPCError } from "@trpc/server";
import { authenticatedProcedure, publicProcedure, router } from "../trpc";
import { API_VERSION_V1 } from "@/src/lib/constants";
import {
  communityListOutput,
  communityOutput,
  communityFeedOutput,
  createCommunityInput,
  updateCommunityInput,
  getCommunityInput,
  listCommunitiesInput,
  getCommunityFeedInput,
} from "@/src/lib/validations/community";

const DEFAULT_COMMUNITY_LIMIT = 20;
const DEFAULT_COMMUNITY_FEED_LIMIT = 20;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const encodeCursor = (offset: number): string =>
  Buffer.from(String(Math.max(0, Math.floor(offset))), "utf8").toString("base64url");

const decodeCursor = (cursor?: string | null): number => {
  if (!cursor) return 0;
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = Number(decoded);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
  } catch {
    return 0;
  }
};

type CommunityRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  accent_color: string;
  visibility: string;
  creator_user_id: string;
  member_count: number;
  created_at: string;
  updated_at: string;
};

const toCommunityOutput = (row: CommunityRow, tags: string[]) => ({
  id: String(row.id),
  slug: String(row.slug),
  name: String(row.name),
  description: row.description ?? null,
  avatarUrl: row.avatar_url ?? null,
  accentColor: String(row.accent_color ?? "#6366f1"),
  visibility: "public" as const,
  creatorUserId: String(row.creator_user_id),
  tags,
  memberCount: Number(row.member_count ?? 0),
  createdAt: new Date(row.created_at).toISOString(),
  updatedAt: new Date(row.updated_at).toISOString(),
});

export const communityRouter = router({
  create: authenticatedProcedure
    .input(createCommunityInput)
    .output(communityOutput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.authUser.id;

      // Insert community
      const { data: community, error: communityError } = await (ctx.supabaseService as any)
        .from("communities")
        .insert({
          name: input.name,
          slug: input.slug,
          description: input.description ?? null,
          avatar_url: input.avatarUrl ?? null,
          accent_color: input.accentColor ?? "#6366f1",
          visibility: "public",
          creator_user_id: userId,
          member_count: 1,
        })
        .select("*")
        .single();

      if (communityError || !community) {
        const msg = communityError?.message ?? "Failed to create community";
        if (String(communityError?.code) === "23505") {
          throw new TRPCError({ code: "CONFLICT", message: "Community slug already taken" });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
      }

      // Insert tag filters
      const tagRows = input.tags.map((tag) => ({
        community_id: community.id,
        tag,
      }));

      const { error: tagError } = await (ctx.supabaseService as any)
        .from("community_tag_filters")
        .insert(tagRows);

      if (tagError) {
        // Best-effort cleanup: delete the community if tag insert fails
        await (ctx.supabaseService as any)
          .from("communities")
          .delete()
          .eq("id", community.id);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: tagError.message ?? "Failed to create tag filters",
        });
      }

      // Insert owner membership
      await (ctx.supabaseService as any)
        .from("community_members")
        .insert({
          community_id: community.id,
          user_id: userId,
          role: "owner",
        });

      return toCommunityOutput(community as CommunityRow, input.tags);
    }),

  update: authenticatedProcedure
    .input(updateCommunityInput)
    .output(communityOutput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.authUser.id;

      // Verify ownership
      const { data: existing, error: fetchError } = await (ctx.supabaseService as any)
        .from("communities")
        .select("*")
        .eq("id", input.communityId)
        .single();

      if (fetchError || !existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });
      }

      if (String(existing.creator_user_id) !== String(userId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the community owner can update it" });
      }

      // Build update payload
      const updatePayload: Record<string, unknown> = {};
      if (input.name !== undefined) updatePayload.name = input.name;
      if (input.description !== undefined) updatePayload.description = input.description;
      if (input.avatarUrl !== undefined) updatePayload.avatar_url = input.avatarUrl;
      if (input.accentColor !== undefined) updatePayload.accent_color = input.accentColor;

      // Update community row if there are fields to update
      let updatedRow = existing;
      if (Object.keys(updatePayload).length > 0) {
        const { data: updated, error: updateError } = await (ctx.supabaseService as any)
          .from("communities")
          .update(updatePayload)
          .eq("id", input.communityId)
          .select("*")
          .single();

        if (updateError || !updated) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: updateError?.message ?? "Failed to update community",
          });
        }
        updatedRow = updated;
      }

      // Update tags if provided
      let tags: string[];
      if (input.tags !== undefined) {
        // Delete existing tags and re-insert
        await (ctx.supabaseService as any)
          .from("community_tag_filters")
          .delete()
          .eq("community_id", input.communityId);

        const tagRows = input.tags.map((tag) => ({
          community_id: input.communityId,
          tag,
        }));
        await (ctx.supabaseService as any)
          .from("community_tag_filters")
          .insert(tagRows);

        tags = input.tags;
      } else {
        // Fetch existing tags
        const { data: tagData } = await (ctx.supabaseService as any)
          .from("community_tag_filters")
          .select("tag")
          .eq("community_id", input.communityId);
        tags = ((tagData ?? []) as Array<{ tag: string }>).map((r) => r.tag);
      }

      return toCommunityOutput(updatedRow as CommunityRow, tags);
    }),

  get: publicProcedure
    .input(getCommunityInput)
    .output(communityOutput)
    .query(async ({ ctx, input }) => {
      const { data: community, error } = await (ctx.supabaseService as any)
        .from("communities")
        .select("*")
        .eq("slug", input.slug)
        .eq("visibility", "public")
        .single();

      if (error || !community) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });
      }

      // Fetch tags
      const { data: tagData } = await (ctx.supabaseService as any)
        .from("community_tag_filters")
        .select("tag")
        .eq("community_id", community.id);
      const tags = ((tagData ?? []) as Array<{ tag: string }>).map((r) => r.tag);

      return toCommunityOutput(community as CommunityRow, tags);
    }),

  list: publicProcedure
    .input(listCommunitiesInput)
    .output(communityListOutput)
    .query(async ({ ctx, input }) => {
      const limit = Math.max(1, Math.min(50, Number(input?.limit ?? DEFAULT_COMMUNITY_LIMIT)));
      const offset = decodeCursor(input?.cursor);

      const { data: communities, error } = await (ctx.supabaseService as any)
        .from("communities")
        .select("*")
        .eq("visibility", "public")
        .order("member_count", { ascending: false })
        .range(offset, offset + limit);

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      const rows = Array.isArray(communities) ? (communities as CommunityRow[]) : [];

      // Batch-fetch tags for all communities
      const communityIds = rows.map((r) => r.id);
      const tagsByCommId = new Map<string, string[]>();
      if (communityIds.length > 0) {
        const { data: tagData } = await (ctx.supabaseService as any)
          .from("community_tag_filters")
          .select("community_id, tag")
          .in("community_id", communityIds);
        for (const row of ((tagData ?? []) as Array<{ community_id: string; tag: string }>)) {
          const existing = tagsByCommId.get(row.community_id) ?? [];
          existing.push(row.tag);
          tagsByCommId.set(row.community_id, existing);
        }
      }

      const items = rows.map((row) => toCommunityOutput(row, tagsByCommId.get(row.id) ?? []));
      const nextOffset = offset + items.length;
      const nextCursor = items.length === limit + 1 ? encodeCursor(nextOffset) : null;

      // Trim to exact limit (we fetched limit+1 to detect next page)
      return {
        apiVersion: API_VERSION_V1,
        items: items.slice(0, limit),
        nextCursor,
      };
    }),

  getFeed: publicProcedure
    .input(getCommunityFeedInput)
    .output(communityFeedOutput)
    .query(async ({ ctx, input }) => {
      const limit = Math.max(1, Math.min(50, Number(input.limit ?? DEFAULT_COMMUNITY_FEED_LIMIT)));
      const offset = decodeCursor(input.cursor);

      // 1. Load the community's tag filters
      const { data: tagData, error: tagError } = await (ctx.supabaseService as any)
        .from("community_tag_filters")
        .select("tag")
        .eq("community_id", input.communityId);

      if (tagError) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: tagError.message });
      }

      const tags = ((tagData ?? []) as Array<{ tag: string }>).map((r) => r.tag);
      if (tags.length === 0) {
        return { apiVersion: API_VERSION_V1, items: [], nextCursor: null };
      }

      // 2. Query market_ai_tags for markets matching those tags
      const { data: aiTagRows, error: aiTagError } = await (ctx.supabaseService as any)
        .from("market_ai_tags")
        .select("market_id, tag")
        .in("tag", tags);

      if (aiTagError) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: aiTagError.message });
      }

      const matchingMarketIds = [
        ...new Set(
          ((aiTagRows ?? []) as Array<{ market_id: string; tag: string }>).map((r) =>
            String(r.market_id).trim()
          )
        ),
      ].filter(Boolean);

      if (matchingMarketIds.length === 0) {
        return { apiVersion: API_VERSION_V1, items: [], nextCursor: null };
      }

      // Count how many community tags each market matches (for scoring)
      const tagMatchCount = new Map<string, number>();
      for (const row of (aiTagRows ?? []) as Array<{ market_id: string; tag: string }>) {
        const mid = String(row.market_id).trim();
        tagMatchCount.set(mid, (tagMatchCount.get(mid) ?? 0) + 1);
      }

      // 3. Query market_catalog for those market IDs (open markets only)
      const CATALOG_CHUNK_SIZE = 500;
      type CatalogRow = {
        id: string;
        total_volume_usd: number | null;
        source_updated_at: string | null;
      };
      const catalogRows: CatalogRow[] = [];

      for (let i = 0; i < matchingMarketIds.length; i += CATALOG_CHUNK_SIZE) {
        const chunk = matchingMarketIds.slice(i, i + CATALOG_CHUNK_SIZE);
        const { data: rows } = await (ctx.supabaseService as any)
          .from("market_catalog")
          .select("id, total_volume_usd, source_updated_at")
          .in("id", chunk)
          .eq("state", "open");

        if (Array.isArray(rows)) {
          catalogRows.push(...(rows as CatalogRow[]));
        }
      }

      if (catalogRows.length === 0) {
        return { apiVersion: API_VERSION_V1, items: [], nextCursor: null };
      }

      // 4. Score markets by volume, freshness, and tag relevance
      const now = Date.now();
      const maxTags = tags.length;

      const scored = catalogRows
        .map((row) => {
          const marketId = String(row.id);
          const volume = Number(row.total_volume_usd ?? 0);
          const volumeScore = clamp01(Math.log10(Math.max(0, volume) + 1) / 6);

          const sourceTs = Date.parse(String(row.source_updated_at ?? ""));
          const ageHours = Number.isFinite(sourceTs)
            ? Math.max(0, (now - sourceTs) / 3_600_000)
            : 72;
          const freshnessScore = clamp01(Math.exp(-ageHours / 72));

          const relevance = clamp01((tagMatchCount.get(marketId) ?? 0) / maxTags);

          const score = clamp01(relevance * 0.4 + volumeScore * 0.35 + freshnessScore * 0.25);

          const reason =
            relevance > 0.6
              ? "Strong tag match"
              : volumeScore > 0.5
                ? "High market activity"
                : "Fresh market updates";

          return { marketId, score, reason };
        })
        .sort((a, b) => b.score - a.score);

      const items = scored.slice(offset, offset + limit);
      const nextOffset = offset + items.length;
      const nextCursor = nextOffset < scored.length ? encodeCursor(nextOffset) : null;

      return {
        apiVersion: API_VERSION_V1,
        items,
        nextCursor,
      };
    }),
});
