import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import {
  calculateBoundedPrices,
  calculateBuyCost,
  calculateSellProceeds,
  toMajorUnits,
  toMinorUnits,
} from "../helpers/pricing";
import { generateMarketContext } from "../../ai/marketContextAgent";
import type { Database } from "../../../types/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { getPredictionMarketVaultProgramId, getSolanaCluster, getSolanaRpcUrl, getUsdcMint } from "../../../../lib/solana/config";
import { readFileSync } from "fs";
import { createHash } from "crypto";
import bs58 from "bs58";

type SupabaseDbClient = SupabaseClient<Database, "public">;

// Default asset for the platform
const DEFAULT_ASSET = "VCOIN";
const VCOIN_DECIMALS = 6;

type MarketRow = Database["public"]["Tables"]["markets"]["Row"];
type DbUserRow = Database["public"]["Tables"]["users"]["Row"];
type AmmStateRow = Database["public"]["Tables"]["market_amm_state"]["Row"];
type PositionRow = Database["public"]["Tables"]["positions"]["Row"];
type TradeRow = Database["public"]["Tables"]["trades"]["Row"];

// We intentionally do NOT rely on markets.category_label_ru/en being present in the DB schema
// (some deployments may not have these columns). Make them optional in the type used for reads.
type MarketRowForRead = Omit<MarketRow, "category_label_ru" | "category_label_en" | "onchain_market_id"> & {
  category_label_ru?: string | null;
  category_label_en?: string | null;
  onchain_market_id?: string | null;
};

type MarketWithAmm = MarketRowForRead & {
  market_amm_state: AmmStateRow | null;
};

type WalletBalanceRowBase = Database["public"]["Tables"]["wallet_balances"]["Row"];
type WalletBalanceRow = Pick<WalletBalanceRowBase, "balance_minor">;
type CreatorMeta = { name: string | null; avatarUrl: string | null };

type SolanaCluster = "devnet" | "testnet" | "mainnet-beta";

const SOLANA_CLUSTER_VALUES: SolanaCluster[] = ["devnet", "testnet", "mainnet-beta"];
const SOLANA_DECIMALS = 6;

const MARKET_SEED = Buffer.from("market");
const CONFIG_SEED = Buffer.from("config");
const POSITION_SEED = Buffer.from("position");

const PLACE_BET_DISCRIMINATOR = (() => {
  const hash = createHash("sha256").update("global:place_bet").digest();
  return hash.subarray(0, 8);
})();

const SELL_POSITION_DISCRIMINATOR = (() => {
  const hash = createHash("sha256").update("global:sell_position").digest();
  return hash.subarray(0, 8);
})();

const CLAIM_WINNINGS_DISCRIMINATOR = (() => {
  const hash = createHash("sha256").update("global:claim_winnings").digest();
  return hash.subarray(0, 8);
})();

const CREATE_MARKET_DISCRIMINATOR = (() => {
  const hash = createHash("sha256").update("global:create_market").digest();
  return hash.subarray(0, 8);
})();

const toBytesUuid = (uuid: string): Buffer => {
  const compact = uuid.replace(/-/g, "");
  if (compact.length !== 32) {
    throw new Error("INVALID_UUID");
  }
  return Buffer.from(compact, "hex");
};

const readKeypairFromJson = (raw: string): Keypair => {
  const parsed = JSON.parse(raw) as number[];
  if (!Array.isArray(parsed) || parsed.some((v) => typeof v !== "number")) {
    throw new Error("INVALID_KEYPAIR_JSON");
  }
  return Keypair.fromSecretKey(Uint8Array.from(parsed));
};

const loadQuoteAuthorityKeypair = (): Keypair => {
  const inline = (process.env.SOLANA_QUOTE_AUTHORITY_KEYPAIR || "").trim();
  if (inline) return readKeypairFromJson(inline);

  const fromPath = (process.env.SOLANA_QUOTE_AUTHORITY_KEYPAIR_PATH || "anchor/quote-authority.json").trim();
  const raw = readFileSync(fromPath, "utf8");
  return readKeypairFromJson(raw);
};

const encodePlaceBetIxData = (
  outcome: number,
  collateralMinor: bigint,
  sharesMinor: bigint,
  maxCostMinor: bigint
): Buffer => {
  const data = Buffer.alloc(8 + 1 + 8 + 8 + 8);
  PLACE_BET_DISCRIMINATOR.copy(data, 0);
  data.writeUInt8(outcome, 8);
  data.writeBigUInt64LE(collateralMinor, 9);
  data.writeBigUInt64LE(sharesMinor, 17);
  data.writeBigUInt64LE(maxCostMinor, 25);
  return data;
};

const encodeSellPositionIxData = (
  outcome: number,
  sharesMinor: bigint,
  payoutMinor: bigint,
  minPayoutMinor: bigint
): Buffer => {
  const data = Buffer.alloc(8 + 1 + 8 + 8 + 8);
  SELL_POSITION_DISCRIMINATOR.copy(data, 0);
  data.writeUInt8(outcome, 8);
  data.writeBigUInt64LE(sharesMinor, 9);
  data.writeBigUInt64LE(payoutMinor, 17);
  data.writeBigUInt64LE(minPayoutMinor, 25);
  return data;
};

const encodeClaimWinningsIxData = (minPayoutMinor: bigint): Buffer => {
  const data = Buffer.alloc(8 + 8);
  CLAIM_WINNINGS_DISCRIMINATOR.copy(data, 0);
  data.writeBigUInt64LE(minPayoutMinor, 8);
  return data;
};

const encodeCreateMarketIxData = (marketUuidBytes: Buffer): Buffer => {
  const data = Buffer.alloc(8 + 16);
  CREATE_MARKET_DISCRIMINATOR.copy(data, 0);
  marketUuidBytes.copy(data, 8);
  return data;
};

const normalizeSolanaCluster = (): SolanaCluster => {
  const raw = getSolanaCluster();
  return SOLANA_CLUSTER_VALUES.includes(raw) ? raw : "devnet";
};

const readU64 = (buffer: Buffer, offset: number): bigint => buffer.readBigUInt64LE(offset);

const getAccountKeysFromMessage = (message: unknown): PublicKey[] => {
  const msg = message as {
    accountKeys?: PublicKey[];
    getAccountKeys?: () => { staticAccountKeys: PublicKey[] };
  };
  if (typeof msg.getAccountKeys === "function") {
    return msg.getAccountKeys().staticAccountKeys;
  }
  return msg.accountKeys ?? [];
};

const findProgramInstruction = (
  tx: { transaction: { message: unknown } },
  programId: PublicKey,
  discriminator: Buffer
): { data: Buffer; accountKeys: PublicKey[]; accounts: PublicKey[] } | null => {
  const message = tx.transaction.message as {
    instructions: { programIdIndex: number; accounts: number[]; data: string }[];
    accountKeys?: PublicKey[];
    getAccountKeys?: () => { staticAccountKeys: PublicKey[] };
  };
  const accountKeys = getAccountKeysFromMessage(message);
  for (const ix of message.instructions) {
    const ixProgramId = accountKeys[ix.programIdIndex];
    if (!ixProgramId || !ixProgramId.equals(programId)) continue;
    const data = Buffer.from(bs58.decode(ix.data));
    if (data.length < 8 || !data.subarray(0, 8).equals(discriminator)) continue;
    const accounts = ix.accounts.map((idx) => accountKeys[idx]).filter(Boolean);
    return { data, accountKeys, accounts };
  }
  return null;
};

const resolveAssetDecimals = async (supabase: SupabaseDbClient, assetCode: string): Promise<number> => {
  const { data, error } = await supabase.from("assets").select("decimals").eq("code", assetCode).maybeSingle();
  if (error) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  }
  const decimals = data?.decimals ?? SOLANA_DECIMALS;
  return Number.isFinite(decimals) ? decimals : SOLANA_DECIMALS;
};

type PositionWithMarket = PositionRow & {
  markets: Pick<MarketRow, "title_rus" | "title_eng" | "state" | "resolve_outcome" | "closes_at" | "expires_at"> | null;
};

type TradeWithMarket = TradeRow & {
  markets: Pick<MarketRow, "title_rus" | "title_eng" | "state" | "resolve_outcome"> | null;
};

// RPC return types
type PlaceBetResult = Database["public"]["Functions"]["place_bet_tx"]["Returns"];
type SellPositionResult = Database["public"]["Functions"]["sell_position_tx"]["Returns"];
type ResolveMarketResult = Database["public"]["Functions"]["resolve_market_service_tx"]["Returns"];
type MarketCommentPublicRow = Database["public"]["Views"]["market_comments_public"]["Row"];
type MarketCommentInsert = Database["public"]["Tables"]["market_comments"]["Insert"];
type MarketCommentLikeRow = Database["public"]["Tables"]["market_comment_likes"]["Row"];
type MarketBookmarkRow = Database["public"]["Tables"]["market_bookmarks"]["Row"];
type MarketCategoryRow = Database["public"]["Tables"]["market_categories"]["Row"];
type MarketContextRow = Database["public"]["Tables"]["market_context"]["Row"];

const ensureCreatorAndNoBets = async (
  supabaseService: SupabaseDbClient,
  marketId: string,
  authUserId: string
) => {
  const { data: marketRow, error: marketError } = await supabaseService
    .from("markets")
    .select("id, created_by, state")
    .eq("id", marketId)
    .maybeSingle();

  if (marketError || !marketRow) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Market not found" });
  }
  if (!marketRow.created_by || marketRow.created_by !== authUserId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the creator can manage this market" });
  }

  const { data: tradeCheck, error: tradeError } = await supabaseService
    .from("trades")
    .select("id")
    .eq("market_id", marketId)
    .limit(1);

  if (tradeError) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: tradeError.message });
  }

  const hasBets = (tradeCheck ?? []).length > 0;
  return { marketRow, hasBets };
};

const deriveVolumeMajor = (amm: AmmStateRow | null, feeBps?: number | null) => {
  if (!amm) return 0;
  const feeMinor = Number(amm.fee_accumulated_minor ?? 0);
  const bps = Number(feeBps ?? 0);
  if (!Number.isFinite(feeMinor) || feeMinor <= 0 || !Number.isFinite(bps) || bps <= 0) {
    return 0;
  }
  const volumeMinor = (feeMinor * 10000) / bps;
  return toMajorUnits(volumeMinor, VCOIN_DECIMALS);
};

const mapMarketRow = (
  row: MarketWithAmm,
  categoryLabelsById?: Map<string, Pick<MarketCategoryRow, "label_ru" | "label_en">>,
  creatorById?: Map<string, CreatorMeta>,
  volumeMajorOverride?: number
) => {
  const amm = row.market_amm_state;
  const { priceYes, priceNo } = amm
    ? calculateBoundedPrices(Number(amm.q_yes), Number(amm.q_no), Number(amm.b))
    : { priceYes: 0.5, priceNo: 0.5 };

  const categoryId = row.category_id ?? null;
  const categoryLabels = categoryId ? categoryLabelsById?.get(categoryId) : undefined;
  const creatorId = row.created_by ?? null;
  const creatorMeta = creatorId ? creatorById?.get(creatorId) : undefined;

  return {
    id: row.id,
    titleRu: row.title_rus ?? row.title_eng,
    titleEn: row.title_eng,
    description: row.description,
    source: row.source ?? null,
    imageUrl: row.image_url ?? "",
    state: row.state,
    createdAt: new Date(row.created_at).toISOString(),
    closesAt: new Date(row.closes_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
    outcome: row.resolve_outcome,
    createdBy: row.created_by ?? null,
    creatorName: creatorMeta?.name ?? null,
    creatorAvatarUrl: creatorMeta?.avatarUrl ?? null,
    categoryId,
    // Some DBs may not have category_label_* columns (they were referenced in code but not migrated).
    // Prefer current labels from market_categories; fall back to existing columns if present.
    categoryLabelRu: categoryLabels?.label_ru ?? row.category_label_ru ?? null,
    categoryLabelEn: categoryLabels?.label_en ?? row.category_label_en ?? null,
    settlementAsset: row.settlement_asset_code,
    feeBps: row.fee_bps,
    liquidityB: Number(row.liquidity_b),
    priceYes,
    priceNo,
    chance: Math.round(priceYes * 100),
    volume: typeof volumeMajorOverride === "number" && Number.isFinite(volumeMajorOverride)
      ? volumeMajorOverride
      : deriveVolumeMajor(amm, row.fee_bps),
  };
};

const mapPositionRow = (row: PositionWithMarket, decimals: number) => {
  return {
    marketId: row.market_id,
    outcome: row.outcome,
    shares: Number(row.shares),
    avgEntryPrice: row.avg_entry_price ? Number(row.avg_entry_price) : null,
    marketTitleRu: row.markets?.title_rus ?? row.markets?.title_eng ?? "",
    marketTitleEn: row.markets?.title_eng ?? "",
    marketState: row.markets?.state ?? "open",
    marketOutcome: row.markets?.resolve_outcome ?? null,
    closesAt: row.markets?.closes_at ? new Date(row.markets.closes_at).toISOString() : null,
    expiresAt: row.markets?.expires_at ? new Date(row.markets.expires_at).toISOString() : null,
  };
};

const mapTradeRow = (row: TradeWithMarket, decimals: number) => {
  return {
    id: row.id,
    marketId: row.market_id,
    action: row.action,
    outcome: row.outcome,
    collateralGross: toMajorUnits(Number(row.collateral_gross_minor), decimals),
    fee: toMajorUnits(Number(row.fee_minor), decimals),
    collateralNet: toMajorUnits(Number(row.collateral_net_minor), decimals),
    sharesDelta: Number(row.shares_delta),
    priceBefore: Number(row.price_before),
    priceAfter: Number(row.price_after),
    createdAt: new Date(row.created_at).toISOString(),
    marketTitleRu: row.markets?.title_rus ?? row.markets?.title_eng ?? "",
    marketTitleEn: row.markets?.title_eng ?? "",
    marketState: row.markets?.state ?? "open",
    marketOutcome: row.markets?.resolve_outcome ?? null,
  };
};

// Zod schemas for output
const positionSummary = z.object({
  marketId: z.string(),
  outcome: z.enum(["YES", "NO"]),
  shares: z.number(),
  avgEntryPrice: z.number().nullable(),
  marketTitleRu: z.string(),
  marketTitleEn: z.string(),
  marketState: z.string(),
  marketOutcome: z.enum(["YES", "NO"]).nullable(),
  closesAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
});

const tradeSummary = z.object({
  id: z.string(),
  marketId: z.string(),
  action: z.enum(["buy", "sell"]),
  outcome: z.enum(["YES", "NO"]),
  collateralGross: z.number(),
  fee: z.number(),
  collateralNet: z.number(),
  sharesDelta: z.number(),
  priceBefore: z.number(),
  priceAfter: z.number(),
  createdAt: z.string(),
  marketTitleRu: z.string(),
  marketTitleEn: z.string(),
  marketState: z.string(),
  marketOutcome: z.enum(["YES", "NO"]).nullable(),
});

const marketCommentOutput = z.object({
  id: z.string(),
  marketId: z.string(),
  userId: z.string(),
  parentId: z.string().nullable(),
  body: z.string(),
  createdAt: z.string(),
  authorName: z.string(),
  authorUsername: z.string().nullable(),
  authorAvatarUrl: z.string().nullable(),
  likesCount: z.number(),
  likedByMe: z.boolean(),
});

const marketOutput = z.object({
  id: z.string(),
  titleRu: z.string(),
  titleEn: z.string(),
  description: z.string().nullable(),
  source: z.string().nullable(),
  imageUrl: z.string(),
  state: z.string(),
  createdAt: z.string(),
  closesAt: z.string(),
  expiresAt: z.string(),
  outcome: z.enum(["YES", "NO"]).nullable(),
  createdBy: z.string().nullable(),
  creatorName: z.string().nullable(),
  creatorAvatarUrl: z.string().nullable(),
  categoryId: z.string().nullable(),
  categoryLabelRu: z.string().nullable(),
  categoryLabelEn: z.string().nullable(),
  settlementAsset: z.string(),
  feeBps: z.number(),
  liquidityB: z.number(),
  priceYes: z.number(),
  priceNo: z.number(),
  chance: z.number(),
  volume: z.number(),
});

const marketCategoryOutput = z.object({
  id: z.string(),
  labelRu: z.string(),
  labelEn: z.string(),
});

const marketBookmarkOutput = z.object({
  marketId: z.string(),
  createdAt: z.string(),
});

const marketContextOutput = z.object({
  marketId: z.string(),
  context: z.string(),
  sources: z.array(z.string()),
  updatedAt: z.string(),
  generated: z.boolean(),
});

export const marketRouter = router({
  listCategories: publicProcedure
    .output(z.array(marketCategoryOutput))
    .query(async ({ ctx }) => {
      const { supabaseService } = ctx;
      const { data, error } = await supabaseService
        .from("market_categories")
        .select("id, label_ru, label_en, is_enabled, sort_order")
        .eq("is_enabled", true)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const rows = (data ?? []) as Pick<MarketCategoryRow, "id" | "label_ru" | "label_en">[];
      return rows.map((r) => ({ id: r.id, labelRu: r.label_ru, labelEn: r.label_en }));
    }),

  listMarkets: publicProcedure
    .input(z.object({ onlyOpen: z.boolean().optional() }).optional())
    .output(z.array(marketOutput))
    .query(async ({ ctx, input }) => {
      const { supabase, supabaseService } = ctx;
      const onlyOpen = input?.onlyOpen ?? false;

      let query = supabase
        .from("markets")
        .select(`
          id, title_rus, title_eng, description, source, image_url, state, closes_at, expires_at, created_by,
          resolve_outcome, settlement_asset_code, fee_bps, liquidity_b, amm_type, created_at,
          category_id,
          market_amm_state (market_id, b, q_yes, q_no, last_price_yes, fee_accumulated_minor, updated_at)
        `)
        .order("created_at", { ascending: false });

      if (onlyOpen) {
        query = query.eq("state", "open");
      }

      const { data, error } = await query;
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const rows: MarketWithAmm[] = data ?? [];

      // Compute market volume from candle aggregates (always use market_price_candles).
      const volumeByMarketId = new Map<string, number>();
      if (rows.length > 0) {
        const marketIds = rows.map((r) => r.id);
        const { data: candles, error: candlesError } = await supabase
          .from("market_price_candles")
          .select("market_id, volume_minor")
          .in("market_id", marketIds)
          .limit(20000);

        if (!candlesError && candles) {
          type CandleRow = Pick<
            Database["public"]["Tables"]["market_price_candles"]["Row"],
            "market_id" | "volume_minor"
          >;
          (candles as CandleRow[]).forEach((c) => {
            const key = String(c.market_id);
            const prev = volumeByMarketId.get(key) ?? 0;
            const minor = Number(c.volume_minor ?? 0);
            if (!Number.isFinite(minor) || minor <= 0) return;
            volumeByMarketId.set(key, prev + toMajorUnits(minor, VCOIN_DECIMALS));
          });
        }
      }

      // Derive category labels from market_categories to avoid relying on category_label_* columns.
      const categoryIds = Array.from(
        new Set(rows.map((r) => r.category_id).filter((v): v is string => typeof v === "string" && v.length > 0))
      );

      const labelsById = new Map<string, Pick<MarketCategoryRow, "label_ru" | "label_en">>();
      if (categoryIds.length > 0) {
        const { data: cats, error: catsError } = await supabaseService
          .from("market_categories")
          .select("id, label_ru, label_en")
          .in("id", categoryIds);
        if (!catsError) {
          const typed = (cats ?? []) as Array<Pick<MarketCategoryRow, "id" | "label_ru" | "label_en">>;
          typed.forEach((c) => labelsById.set(c.id, { label_ru: c.label_ru, label_en: c.label_en }));
        }
      }

      const creatorIds = Array.from(
        new Set(rows.map((r) => r.created_by).filter((v): v is string => typeof v === "string" && v.length > 0))
      );
      const creatorsById = new Map<string, CreatorMeta>();
      if (creatorIds.length > 0) {
        const { data: creators, error: creatorsError } = await supabaseService
          .from("users")
          .select("id, display_name, username, avatar_url, telegram_photo_url")
          .in("id", creatorIds);
        if (!creatorsError && creators) {
          (creators as Array<Pick<DbUserRow, "id" | "display_name" | "username" | "avatar_url" | "telegram_photo_url">>).forEach(
            (u) => {
              const name = u.display_name ?? u.username ?? null;
              const avatarUrl = u.avatar_url ?? u.telegram_photo_url ?? null;
              creatorsById.set(String(u.id), { name, avatarUrl });
            }
          );
        }
      }

      return rows.map((r) => mapMarketRow(r, labelsById, creatorsById, volumeByMarketId.get(r.id)));
    }),

  getMarket: publicProcedure
    .input(z.object({ marketId: z.string().uuid() }))
    .output(marketOutput)
    .query(async ({ ctx, input }) => {
      const { supabase, supabaseService } = ctx;

      const { data, error } = await supabase
        .from("markets")
        .select(`
          id, title_rus, title_eng, description, source, image_url, state, closes_at, expires_at, created_by,
          resolve_outcome, settlement_asset_code, fee_bps, liquidity_b, amm_type, created_at,
          category_id,
          market_amm_state (market_id, b, q_yes, q_no, last_price_yes, fee_accumulated_minor, updated_at)
        `)
        .eq("id", input.marketId)
        .single();

      if (error || !data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Market not found" });
      }

      const row: MarketWithAmm = data;

      // Compute total volume from candle aggregates (always use market_price_candles).
      let volumeMajor: number | undefined = undefined;
      const { data: candles, error: candlesError } = await supabase
        .from("market_price_candles")
        .select("volume_minor")
        .eq("market_id", input.marketId)
        .limit(20000);
      if (!candlesError && candles) {
        type CandleRow = Pick<Database["public"]["Tables"]["market_price_candles"]["Row"], "volume_minor">;
        const totalMinor = (candles as CandleRow[]).reduce((acc, c) => {
          const n = Number(c.volume_minor ?? 0);
          return Number.isFinite(n) && n > 0 ? acc + n : acc;
        }, 0);
        if (totalMinor > 0) {
          volumeMajor = toMajorUnits(totalMinor, VCOIN_DECIMALS);
        }
      }
      const labelsById = new Map<string, Pick<MarketCategoryRow, "label_ru" | "label_en">>();
      const categoryId = row.category_id;
      if (typeof categoryId === "string" && categoryId.length > 0) {
        const { data: cat, error: catError } = await supabaseService
          .from("market_categories")
          .select("label_ru, label_en")
          .eq("id", categoryId)
          .maybeSingle();
        if (!catError && cat) {
          const typed = cat as Pick<MarketCategoryRow, "label_ru" | "label_en">;
          labelsById.set(categoryId, typed);
        }
      }

      const creatorById = new Map<string, CreatorMeta>();
      const creatorId = row.created_by;
      if (creatorId) {
        const { data: creator, error: creatorError } = await supabaseService
          .from("users")
          .select("id, display_name, username, avatar_url, telegram_photo_url")
          .eq("id", creatorId)
          .maybeSingle();
        if (!creatorError && creator) {
          const typed = creator as Pick<DbUserRow, "id" | "display_name" | "username" | "avatar_url" | "telegram_photo_url">;
          const name = typed.display_name ?? typed.username ?? null;
          const avatarUrl = typed.avatar_url ?? typed.telegram_photo_url ?? null;
          creatorById.set(String(typed.id), { name, avatarUrl });
        }
      }

      return mapMarketRow(row, labelsById, creatorById, volumeMajor);
    }),

  generateMarketContext: publicProcedure
    .input(z.object({ marketId: z.string().uuid() }))
    .output(marketContextOutput)
    .mutation(async ({ ctx, input }) => {
      const { supabaseService } = ctx;
      const normalizeSources = (value: MarketContextRow["sources"] | null | undefined) =>
        Array.isArray(value)
          ? value.map((item) => String(item)).filter((item) => item.length > 0)
          : [];

      const { data: existing, error: existingError } = await supabaseService
        .from("market_context")
        .select("market_id, context, sources, updated_at")
        .eq("market_id", input.marketId)
        .maybeSingle();

      if (existingError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: existingError.message,
        });
      }

      if (existing?.context) {
        return {
          marketId: existing.market_id,
          context: existing.context,
          sources: normalizeSources(existing.sources),
          updatedAt: existing.updated_at,
          generated: false,
        };
      }

      const { data: market, error: marketError } = await supabaseService
        .from("markets")
        .select("title_rus, title_eng, description, source")
        .eq("id", input.marketId)
        .maybeSingle();

      if (marketError || !market) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Market not found",
        });
      }

      const title = market.title_rus ?? market.title_eng ?? "";
      const result = await generateMarketContext({
        marketId: input.marketId,
        title,
        description: market.description,
        source: market.source,
      });

      const updatedAt = new Date().toISOString();
      const { error: upsertError } = await supabaseService
        .from("market_context")
        .upsert(
          {
            market_id: input.marketId,
            context: result.context,
            sources: result.sources,
            updated_at: updatedAt,
          },
          { onConflict: "market_id" }
        );

      if (upsertError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: upsertError.message,
        });
      }

      return {
        marketId: input.marketId,
        context: result.context,
        sources: result.sources,
        updatedAt,
        generated: true,
      };
    }),

  creatorMarketMeta: publicProcedure
    .input(z.object({ marketId: z.string().uuid() }))
    .output(z.object({ hasBets: z.boolean() }))
    .query(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      const { hasBets } = await ensureCreatorAndNoBets(
        supabaseService as SupabaseDbClient,
        input.marketId,
        authUser.id
      );

      return { hasBets };
    }),

  /**
   * Place a bet (buy shares) - calls RPC that uses auth.uid()
   */
  placeBet: publicProcedure
    .input(
      z.object({
        marketId: z.string().uuid(),
        side: z.enum(["YES", "NO"]),
        amount: z.number().positive(),
      })
    )
    .output(
      z.object({
        tradeId: z.string(),
        newBalanceMinor: z.number(),
        sharesBought: z.number(),
        priceBefore: z.number(),
        priceAfter: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabase, supabaseService, authUser, cookies } = ctx;
      const { marketId, side, amount } = input;

      if (!authUser) {
        // Log for debugging
        const hasAuthToken = Boolean(cookies?.auth_token);
        const hasSbAccessToken = Boolean(cookies?.sb_access_token);
        console.warn("[placeBet] authUser is null", { hasAuthToken, hasSbAccessToken, cookiesKeys: cookies ? Object.keys(cookies) : [] });
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      // Ensure we have a Supabase session for the RPC call (it uses auth.uid() internally).
      // If the user client doesn't have a session, try to refresh it or use service client with user_id override.
      // For now, try the user client first. If it fails with NOT_AUTHENTICATED, we'll handle it below.
      let client = supabase as SupabaseDbClient;
      const hasSbSession = Boolean(cookies?.sb_access_token);
      
      if (!hasSbSession) {
        // No Supabase session cookie - the RPC will fail with NOT_AUTHENTICATED.
        // This shouldn't happen if login worked correctly, but log it for debugging.
        console.warn("[placeBet] No Supabase session cookie found", { userId: authUser.id });
      }

      // Call the RPC - it uses auth.uid() internally, no user_id passed
      const { data, error } = await client.rpc("place_bet_tx", {
        p_market_id: marketId,
        p_side: side,
        p_amount: amount,
      });

      if (error) {
        // Map common DB errors to user-friendly messages
        const msg = (error.message || "").toUpperCase();
        if (msg.includes("NOT_AUTHENTICATED") || msg.includes("UNAUTHORIZED")) {
          console.error("[placeBet] Supabase RPC auth error", { error: error.message, userId: authUser.id, hasSbSession });
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated - please log in again" });
        }
        if (msg.includes("INSUFFICIENT_BALANCE")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "INSUFFICIENT_BALANCE" });
        }
        if (msg.includes("MARKET_CLOSED") || msg.includes("MARKET_NOT_OPEN")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "MARKET_CLOSED" });
        }
        if (msg.includes("MARKET_RESOLVED")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "MARKET_RESOLVED" });
        }
        if (msg.includes("MARKET_NOT_FOUND")) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Market not found" });
        }
        if (msg.includes("AMOUNT_TOO_SMALL") || msg.includes("INVALID_AMOUNT")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "AMOUNT_TOO_SMALL" });
        }
        if (msg.includes("AMOUNT_TOO_LARGE") || msg.includes("VALUE OUT OF RANGE")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "AMOUNT_TOO_LARGE" });
        }
        if (msg.includes("BET_TOO_LARGE")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "BET_TOO_LARGE" });
        }
        if (msg.includes("INVALID_LIQUIDITY")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "INVALID_LIQUIDITY" });
        }
        if (msg.includes("ASSET_DISABLED")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "ASSET_DISABLED" });
        }
        if (msg.includes("AMM_STATE_MISSING")) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AMM_STATE_MISSING" });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const result = (Array.isArray(data) ? data[0] : data) as PlaceBetResult | null;

      if (!result) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to place bet",
        });
      }

      return {
        tradeId: String(result.trade_id),
        newBalanceMinor: Number(result.new_balance_minor),
        sharesBought: Number(result.shares_bought),
        priceBefore: Number(result.price_before),
        priceAfter: Number(result.price_after),
      };
    }),

  // ============================================================================
  // On-chain transaction preparation endpoints
  // Temporarily disabled during Solana migration - will return Solana tx payloads when enabled.
  // ============================================================================

  prepareBet: publicProcedure
    .input(
      z.object({
        marketId: z.string().uuid(),
        side: z.enum(["YES", "NO"]),
        amount: z.number().positive(),
        assetCode: z.enum(["USDC"]),
        userPubkey: z.string().min(32),
      })
    )
    .output(z.object({ solanaCluster: z.enum(["devnet", "testnet", "mainnet-beta"]), txBase64: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      const { marketId, side, amount, assetCode, userPubkey } = input;

      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }
      if (!authUser.isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "ADMIN_ONLY_ONCHAIN" });
      }

      const client = supabaseService as SupabaseDbClient;
      const { data: userRow, error: userError } = await client
        .from("users")
        .select("solana_wallet_address")
        .eq("id", authUser.id)
        .maybeSingle();
      if (userError) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: userError.message });
      }
      const storedPubkey = userRow?.solana_wallet_address ? String(userRow.solana_wallet_address) : null;
      if (!storedPubkey || storedPubkey !== userPubkey) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "SOLANA_WALLET_MISMATCH" });
      }

      const { data: marketRow, error: marketError } = await client
        .from("markets")
        .select("id, state, settlement_asset_code, liquidity_b, fee_bps")
        .eq("id", marketId)
        .maybeSingle();
      if (marketError || !marketRow) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Market not found" });
      }
      if (String(marketRow.settlement_asset_code || "").toUpperCase() !== assetCode) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ASSET_MISMATCH" });
      }
      if (marketRow.state !== "open") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "MARKET_NOT_OPEN" });
      }

      const { data: ammRow, error: ammError } = await client
        .from("market_amm_state")
        .select("q_yes, q_no")
        .eq("market_id", marketId)
        .maybeSingle();
      if (ammError || !ammRow) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AMM_STATE_MISSING" });
      }

      const decimals = await resolveAssetDecimals(client, assetCode);
      const amountMinor = toMinorUnits(amount, decimals);
      const feeBps = Number(marketRow.fee_bps ?? 0);
      const feeMinor = Math.floor((amountMinor * feeBps) / 10000);
      const netMinor = Math.max(0, amountMinor - feeMinor);
      if (netMinor <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "AMOUNT_TOO_SMALL" });
      }

      const netMajor = toMajorUnits(netMinor, decimals);
      const qYes = Number(ammRow.q_yes ?? 0);
      const qNo = Number(ammRow.q_no ?? 0);
      const b = Number(marketRow.liquidity_b ?? 0);
      if (!Number.isFinite(b) || b <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "INVALID_LIQUIDITY" });
      }

      let low = 0;
      let high = Math.max(0.000001, netMajor);
      const maxIterations = 64;

      for (let i = 0; i < 32; i += 1) {
        const cost = calculateBuyCost(qYes, qNo, b, side, high);
        if (cost >= netMajor) break;
        high *= 2;
      }

      for (let i = 0; i < maxIterations; i += 1) {
        const mid = (low + high) / 2;
        const cost = calculateBuyCost(qYes, qNo, b, side, mid);
        if (cost > netMajor) {
          high = mid;
        } else {
          low = mid;
        }
      }

      const sharesMajor = low;
      if (!Number.isFinite(sharesMajor) || sharesMajor <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "AMOUNT_TOO_SMALL" });
      }

      const sharesMinor = BigInt(Math.floor(sharesMajor * 1_000_000));
      const collateralMinor = BigInt(netMinor);
      const maxCostMinor = BigInt(netMinor);

      const programId = getPredictionMarketVaultProgramId();
      const userKey = new PublicKey(userPubkey);
      const marketUuidBytes = toBytesUuid(marketId);
      const [configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED], programId);
      const [marketPda] = PublicKey.findProgramAddressSync([MARKET_SEED, marketUuidBytes], programId);
      const [positionPda] = PublicKey.findProgramAddressSync(
        [POSITION_SEED, marketPda.toBuffer(), userKey.toBuffer()],
        programId
      );
      const usdcMint = getUsdcMint();
      const userUsdcAta = getAssociatedTokenAddressSync(usdcMint, userKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
      const marketVaultAta = getAssociatedTokenAddressSync(
        usdcMint,
        marketPda,
        true,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const outcome = side === "YES" ? 1 : 2;
      const quoteAuthority = loadQuoteAuthorityKeypair();

      const connection = new Connection(getSolanaRpcUrl(), "confirmed");
      const marketAccount = await connection.getAccountInfo(marketPda);
      const instructions: TransactionInstruction[] = [];
      if (!marketAccount) {
        instructions.push(
          new TransactionInstruction({
            programId,
            keys: [
              { pubkey: userKey, isSigner: true, isWritable: true },
              { pubkey: marketPda, isSigner: false, isWritable: true },
              { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            data: encodeCreateMarketIxData(marketUuidBytes),
          })
        );
      }

      const betIx = new TransactionInstruction({
        programId,
        keys: [
          { pubkey: userKey, isSigner: true, isWritable: true },
          { pubkey: quoteAuthority.publicKey, isSigner: true, isWritable: false },
          { pubkey: configPda, isSigner: false, isWritable: false },
          { pubkey: marketPda, isSigner: false, isWritable: true },
          { pubkey: positionPda, isSigner: false, isWritable: true },
          { pubkey: usdcMint, isSigner: false, isWritable: false },
          { pubkey: userUsdcAta, isSigner: false, isWritable: true },
          { pubkey: marketVaultAta, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: encodePlaceBetIxData(outcome, collateralMinor, sharesMinor, maxCostMinor),
      });

      instructions.push(betIx);

      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({ feePayer: userKey, recentBlockhash: blockhash }).add(...instructions);
      tx.partialSign(quoteAuthority);

      const txBase64 = tx.serialize({ requireAllSignatures: false }).toString("base64");
      return { solanaCluster: normalizeSolanaCluster(), txBase64 };
    }),

  prepareSell: publicProcedure
    .input(
      z.object({
        marketId: z.string().uuid(),
        side: z.enum(["YES", "NO"]),
        shares: z.number().positive(),
        assetCode: z.enum(["USDC"]),
        userPubkey: z.string().min(32),
      })
    )
    .output(z.object({ solanaCluster: z.enum(["devnet", "testnet", "mainnet-beta"]), txBase64: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      const { marketId, side, shares, assetCode, userPubkey } = input;

      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }
      if (!authUser.isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "ADMIN_ONLY_ONCHAIN" });
      }

      const client = supabaseService as SupabaseDbClient;
      const { data: userRow, error: userError } = await client
        .from("users")
        .select("solana_wallet_address")
        .eq("id", authUser.id)
        .maybeSingle();
      if (userError) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: userError.message });
      }
      const storedPubkey = userRow?.solana_wallet_address ? String(userRow.solana_wallet_address) : null;
      if (!storedPubkey || storedPubkey !== userPubkey) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "SOLANA_WALLET_MISMATCH" });
      }

      const { data: marketRow, error: marketError } = await client
        .from("markets")
        .select("id, state, settlement_asset_code, liquidity_b, fee_bps")
        .eq("id", marketId)
        .maybeSingle();
      if (marketError || !marketRow) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Market not found" });
      }
      if (String(marketRow.settlement_asset_code || "").toUpperCase() !== assetCode) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ASSET_MISMATCH" });
      }
      if (marketRow.state !== "open") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "MARKET_NOT_OPEN" });
      }

      const { data: ammRow, error: ammError } = await client
        .from("market_amm_state")
        .select("q_yes, q_no")
        .eq("market_id", marketId)
        .maybeSingle();
      if (ammError || !ammRow) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AMM_STATE_MISSING" });
      }

      const decimals = await resolveAssetDecimals(client, assetCode);
      const sharesMinor = BigInt(Math.floor(shares * 1_000_000));
      const qYes = Number(ammRow.q_yes ?? 0);
      const qNo = Number(ammRow.q_no ?? 0);
      const b = Number(marketRow.liquidity_b ?? 0);
      if (!Number.isFinite(b) || b <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "INVALID_LIQUIDITY" });
      }

      const payoutMajor = calculateSellProceeds(qYes, qNo, b, side, shares);
      const payoutMinor = BigInt(toMinorUnits(payoutMajor, decimals));
      const minPayoutMinor = payoutMinor;

      const programId = getPredictionMarketVaultProgramId();
      const userKey = new PublicKey(userPubkey);
      const marketUuidBytes = toBytesUuid(marketId);
      const [configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED], programId);
      const [marketPda] = PublicKey.findProgramAddressSync([MARKET_SEED, marketUuidBytes], programId);
      const [positionPda] = PublicKey.findProgramAddressSync(
        [POSITION_SEED, marketPda.toBuffer(), userKey.toBuffer()],
        programId
      );
      const usdcMint = getUsdcMint();
      const userUsdcAta = getAssociatedTokenAddressSync(usdcMint, userKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
      const marketVaultAta = getAssociatedTokenAddressSync(
        usdcMint,
        marketPda,
        true,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const outcome = side === "YES" ? 1 : 2;
      const quoteAuthority = loadQuoteAuthorityKeypair();
      const ix = new TransactionInstruction({
        programId,
        keys: [
          { pubkey: userKey, isSigner: true, isWritable: true },
          { pubkey: quoteAuthority.publicKey, isSigner: true, isWritable: false },
          { pubkey: configPda, isSigner: false, isWritable: false },
          { pubkey: marketPda, isSigner: false, isWritable: true },
          { pubkey: positionPda, isSigner: false, isWritable: true },
          { pubkey: usdcMint, isSigner: false, isWritable: false },
          { pubkey: userUsdcAta, isSigner: false, isWritable: true },
          { pubkey: marketVaultAta, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data: encodeSellPositionIxData(outcome, sharesMinor, payoutMinor, minPayoutMinor),
      });

      const connection = new Connection(getSolanaRpcUrl(), "confirmed");
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({ feePayer: userKey, recentBlockhash: blockhash }).add(ix);
      tx.partialSign(quoteAuthority);

      const txBase64 = tx.serialize({ requireAllSignatures: false }).toString("base64");
      return { solanaCluster: normalizeSolanaCluster(), txBase64 };
    }),

  prepareClaim: publicProcedure
    .input(
      z.object({
        marketId: z.string().uuid(),
        assetCode: z.enum(["USDC"]),
        userPubkey: z.string().min(32),
      })
    )
    .output(z.object({ solanaCluster: z.enum(["devnet", "testnet", "mainnet-beta"]), txBase64: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      const { marketId, assetCode, userPubkey } = input;

      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }
      if (!authUser.isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "ADMIN_ONLY_ONCHAIN" });
      }

      const client = supabaseService as SupabaseDbClient;
      const { data: userRow, error: userError } = await client
        .from("users")
        .select("solana_wallet_address")
        .eq("id", authUser.id)
        .maybeSingle();
      if (userError) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: userError.message });
      }
      const storedPubkey = userRow?.solana_wallet_address ? String(userRow.solana_wallet_address) : null;
      if (!storedPubkey || storedPubkey !== userPubkey) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "SOLANA_WALLET_MISMATCH" });
      }

      const { data: marketRow, error: marketError } = await client
        .from("markets")
        .select("id, state, settlement_asset_code, resolve_outcome")
        .eq("id", marketId)
        .maybeSingle();
      if (marketError || !marketRow) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Market not found" });
      }
      if (String(marketRow.settlement_asset_code || "").toUpperCase() !== assetCode) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ASSET_MISMATCH" });
      }
      if (!marketRow.resolve_outcome || marketRow.state !== "resolved") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "MARKET_NOT_RESOLVED" });
      }

      const { data: positionRow, error: positionError } = await client
        .from("positions")
        .select("shares, outcome")
        .eq("market_id", marketId)
        .eq("user_id", authUser.id)
        .maybeSingle();
      if (positionError) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: positionError.message });
      }
      const shares = Number(positionRow?.shares ?? 0);
      if (!Number.isFinite(shares) || shares <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "NO_POSITION" });
      }

      const decimals = await resolveAssetDecimals(client, assetCode);
      const payoutMinor = BigInt(toMinorUnits(shares, decimals));
      const minPayoutMinor = payoutMinor;

      const programId = getPredictionMarketVaultProgramId();
      const userKey = new PublicKey(userPubkey);
      const marketUuidBytes = toBytesUuid(marketId);
      const [configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED], programId);
      const [marketPda] = PublicKey.findProgramAddressSync([MARKET_SEED, marketUuidBytes], programId);
      const [positionPda] = PublicKey.findProgramAddressSync(
        [POSITION_SEED, marketPda.toBuffer(), userKey.toBuffer()],
        programId
      );
      const usdcMint = getUsdcMint();
      const userUsdcAta = getAssociatedTokenAddressSync(usdcMint, userKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
      const marketVaultAta = getAssociatedTokenAddressSync(
        usdcMint,
        marketPda,
        true,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const ix = new TransactionInstruction({
        programId,
        keys: [
          { pubkey: userKey, isSigner: true, isWritable: true },
          { pubkey: configPda, isSigner: false, isWritable: false },
          { pubkey: marketPda, isSigner: false, isWritable: true },
          { pubkey: positionPda, isSigner: false, isWritable: true },
          { pubkey: usdcMint, isSigner: false, isWritable: false },
          { pubkey: userUsdcAta, isSigner: false, isWritable: true },
          { pubkey: marketVaultAta, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data: encodeClaimWinningsIxData(minPayoutMinor),
      });

      const connection = new Connection(getSolanaRpcUrl(), "confirmed");
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({ feePayer: userKey, recentBlockhash: blockhash }).add(ix);

      const txBase64 = tx.serialize({ requireAllSignatures: false }).toString("base64");
      return { solanaCluster: normalizeSolanaCluster(), txBase64 };
    }),

  finalizeBet: publicProcedure
    .input(
      z.object({
        marketId: z.string().uuid(),
        signature: z.string().min(10),
      })
    )
    .output(
      z.object({
        tradeId: z.string(),
        newBalanceMinor: z.number(),
        sharesBought: z.number(),
        priceBefore: z.number(),
        priceAfter: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      const { marketId, signature } = input;
      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }
      if (!authUser.isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "ADMIN_ONLY_ONCHAIN" });
      }

      const client = supabaseService as SupabaseDbClient;
      const { data: userRow, error: userError } = await client
        .from("users")
        .select("solana_wallet_address")
        .eq("id", authUser.id)
        .maybeSingle();
      if (userError) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: userError.message });
      }
      const storedPubkey = userRow?.solana_wallet_address ? String(userRow.solana_wallet_address) : null;
      if (!storedPubkey) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "SOLANA_WALLET_MISSING" });
      }

      const connection = new Connection(getSolanaRpcUrl(), "confirmed");
      const tx = await connection.getTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      if (!tx) {
        throw new TRPCError({ code: "NOT_FOUND", message: "TX_NOT_FOUND" });
      }

      const programId = getPredictionMarketVaultProgramId();
      const decoded = findProgramInstruction(tx, programId, PLACE_BET_DISCRIMINATOR);
      if (!decoded) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "TX_MISSING_INSTRUCTION" });
      }

      const data = decoded.data;
      const outcome = data.readUInt8(8);
      const collateralMinor = readU64(data, 9);
      const sharesMinor = readU64(data, 17);

      const userKey = new PublicKey(storedPubkey);
      const marketUuidBytes = toBytesUuid(marketId);
      const [marketPda] = PublicKey.findProgramAddressSync([MARKET_SEED, marketUuidBytes], programId);
      if (!decoded.accounts[0]?.equals(userKey) || !decoded.accounts[3]?.equals(marketPda)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "TX_ACCOUNT_MISMATCH" });
      }

      const { data: marketRow, error: marketError } = await client
        .from("markets")
        .select("liquidity_b, fee_bps")
        .eq("id", marketId)
        .maybeSingle();
      if (marketError || !marketRow) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Market not found" });
      }

      const { data: ammRow, error: ammError } = await client
        .from("market_amm_state")
        .select("q_yes, q_no")
        .eq("market_id", marketId)
        .maybeSingle();
      if (ammError || !ammRow) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AMM_STATE_MISSING" });
      }

      const qYes = Number(ammRow.q_yes ?? 0);
      const qNo = Number(ammRow.q_no ?? 0);
      const b = Number(marketRow.liquidity_b ?? 0);
      if (!Number.isFinite(b) || b <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "INVALID_LIQUIDITY" });
      }

      const { priceYes: priceBeforeYes } = calculateBoundedPrices(qYes, qNo, b);
      const sharesMajor = Number(sharesMinor) / 1_000_000;
      const nextQYes = outcome === 1 ? qYes + sharesMajor : qYes;
      const nextQNo = outcome === 2 ? qNo + sharesMajor : qNo;
      const { priceYes: priceAfterYes } = calculateBoundedPrices(nextQYes, nextQNo, b);

      const { data: rpcData, error } = await client.rpc("place_bet_onchain_tx", {
        p_market_id: marketId,
        p_side: outcome === 1 ? "YES" : "NO",
        p_collateral_minor: Number(collateralMinor),
        p_shares: sharesMajor,
        p_price_before: priceBeforeYes,
        p_price_after: priceAfterYes,
      });
      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      const result = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as PlaceBetResult | null;
      if (!result) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to finalize bet" });
      }

      return {
        tradeId: String(result.trade_id),
        newBalanceMinor: Number(result.new_balance_minor),
        sharesBought: Number(result.shares_bought),
        priceBefore: Number(result.price_before),
        priceAfter: Number(result.price_after),
      };
    }),

  finalizeSell: publicProcedure
    .input(
      z.object({
        marketId: z.string().uuid(),
        signature: z.string().min(10),
      })
    )
    .output(
      z.object({
        tradeId: z.string(),
        payoutMinor: z.number(),
        newBalanceMinor: z.number(),
        sharesSold: z.number(),
        priceBefore: z.number(),
        priceAfter: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      const { marketId, signature } = input;
      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }
      if (!authUser.isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "ADMIN_ONLY_ONCHAIN" });
      }

      const client = supabaseService as SupabaseDbClient;
      const { data: userRow, error: userError } = await client
        .from("users")
        .select("solana_wallet_address")
        .eq("id", authUser.id)
        .maybeSingle();
      if (userError) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: userError.message });
      }
      const storedPubkey = userRow?.solana_wallet_address ? String(userRow.solana_wallet_address) : null;
      if (!storedPubkey) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "SOLANA_WALLET_MISSING" });
      }

      const connection = new Connection(getSolanaRpcUrl(), "confirmed");
      const tx = await connection.getTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      if (!tx) {
        throw new TRPCError({ code: "NOT_FOUND", message: "TX_NOT_FOUND" });
      }

      const programId = getPredictionMarketVaultProgramId();
      const decoded = findProgramInstruction(tx, programId, SELL_POSITION_DISCRIMINATOR);
      if (!decoded) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "TX_MISSING_INSTRUCTION" });
      }

      const data = decoded.data;
      const outcome = data.readUInt8(8);
      const sharesMinor = readU64(data, 9);
      const payoutMinor = readU64(data, 17);

      const userKey = new PublicKey(storedPubkey);
      const marketUuidBytes = toBytesUuid(marketId);
      const [marketPda] = PublicKey.findProgramAddressSync([MARKET_SEED, marketUuidBytes], programId);
      if (!decoded.accounts[0]?.equals(userKey) || !decoded.accounts[3]?.equals(marketPda)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "TX_ACCOUNT_MISMATCH" });
      }

      const { data: marketRow, error: marketError } = await client
        .from("markets")
        .select("liquidity_b")
        .eq("id", marketId)
        .maybeSingle();
      if (marketError || !marketRow) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Market not found" });
      }

      const { data: ammRow, error: ammError } = await client
        .from("market_amm_state")
        .select("q_yes, q_no")
        .eq("market_id", marketId)
        .maybeSingle();
      if (ammError || !ammRow) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AMM_STATE_MISSING" });
      }

      const qYes = Number(ammRow.q_yes ?? 0);
      const qNo = Number(ammRow.q_no ?? 0);
      const b = Number(marketRow.liquidity_b ?? 0);
      if (!Number.isFinite(b) || b <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "INVALID_LIQUIDITY" });
      }

      const { priceYes: priceBeforeYes } = calculateBoundedPrices(qYes, qNo, b);
      const sharesMajor = Number(sharesMinor) / 1_000_000;
      const nextQYes = outcome === 1 ? qYes - sharesMajor : qYes;
      const nextQNo = outcome === 2 ? qNo - sharesMajor : qNo;
      const { priceYes: priceAfterYes } = calculateBoundedPrices(nextQYes, nextQNo, b);

      const { data: rpcData, error } = await client.rpc("sell_position_onchain_tx", {
        p_market_id: marketId,
        p_side: outcome === 1 ? "YES" : "NO",
        p_shares: sharesMajor,
        p_payout_minor: Number(payoutMinor),
        p_price_before: priceBeforeYes,
        p_price_after: priceAfterYes,
      });
      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      const result = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as SellPositionResult | null;
      if (!result) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to finalize sell" });
      }
      return {
        tradeId: String(result.trade_id),
        payoutMinor: Number(result.payout_net_minor),
        newBalanceMinor: Number(result.new_balance_minor),
        sharesSold: Number(result.shares_sold ?? sharesMajor),
        priceBefore: Number(result.price_before),
        priceAfter: Number(result.price_after),
      };
    }),

  finalizeClaim: publicProcedure
    .input(
      z.object({
        marketId: z.string().uuid(),
        signature: z.string().min(10),
      })
    )
    .output(
      z.object({
        marketId: z.string(),
        payoutMinor: z.number(),
        newBalanceMinor: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      const { marketId, signature } = input;
      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }
      if (!authUser.isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "ADMIN_ONLY_ONCHAIN" });
      }

      const client = supabaseService as SupabaseDbClient;
      const { data: userRow, error: userError } = await client
        .from("users")
        .select("solana_wallet_address")
        .eq("id", authUser.id)
        .maybeSingle();
      if (userError) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: userError.message });
      }
      const storedPubkey = userRow?.solana_wallet_address ? String(userRow.solana_wallet_address) : null;
      if (!storedPubkey) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "SOLANA_WALLET_MISSING" });
      }

      const connection = new Connection(getSolanaRpcUrl(), "confirmed");
      const tx = await connection.getTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      if (!tx) {
        throw new TRPCError({ code: "NOT_FOUND", message: "TX_NOT_FOUND" });
      }

      const programId = getPredictionMarketVaultProgramId();
      const decoded = findProgramInstruction(tx, programId, CLAIM_WINNINGS_DISCRIMINATOR);
      if (!decoded) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "TX_MISSING_INSTRUCTION" });
      }

      const data = decoded.data;
      const minPayoutMinor = readU64(data, 8);

      const userKey = new PublicKey(storedPubkey);
      const marketUuidBytes = toBytesUuid(marketId);
      const [marketPda] = PublicKey.findProgramAddressSync([MARKET_SEED, marketUuidBytes], programId);
      if (!decoded.accounts[0]?.equals(userKey) || !decoded.accounts[2]?.equals(marketPda)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "TX_ACCOUNT_MISMATCH" });
      }

      const { data: rpcData, error } = await client.rpc("claim_winnings_onchain_tx", {
        p_market_id: marketId,
        p_user_id: authUser.id,
        p_payout_minor: Number(minPayoutMinor),
      });
      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as { new_balance_minor: number } | null;
      if (!row) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to finalize claim" });
      }

      return {
        marketId,
        payoutMinor: Number(minPayoutMinor),
        newBalanceMinor: Number(row.new_balance_minor),
      };
    }),

  /**
   * Sell position (cash out shares) - calls RPC that uses auth.uid()
   */
  sellPosition: publicProcedure
    .input(
      z.object({
        marketId: z.string().uuid(),
        side: z.enum(["YES", "NO"]),
        shares: z.number().positive(),
      })
    )
    .output(
      z.object({
        tradeId: z.string(),
        payoutMinor: z.number(),
        newBalanceMinor: z.number(),
        sharesSold: z.number(),
        priceBefore: z.number(),
        priceAfter: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabase, supabaseService, authUser } = ctx;
      const { marketId, side, shares } = input;

      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      const useService = supabaseService !== supabase;
      const client = useService ? (supabaseService as SupabaseDbClient) : (supabase as SupabaseDbClient);
      const { data, error } = useService
        ? await client.rpc("sell_position_service_tx", {
            p_user_id: authUser.id,
            p_market_id: marketId,
            p_side: side,
            p_shares: shares,
          })
        : await client.rpc("sell_position_tx", {
            p_market_id: marketId,
            p_side: side,
            p_shares: shares,
          });

      if (error) {
        const msg = error.message || "";
        if (msg.includes("NO_POSITION")) throw new TRPCError({ code: "BAD_REQUEST", message: "NO_POSITION" });
        if (msg.includes("INSUFFICIENT_SHARES")) throw new TRPCError({ code: "BAD_REQUEST", message: "INSUFFICIENT_SHARES" });
        if (msg.includes("INVALID_SHARES")) throw new TRPCError({ code: "BAD_REQUEST", message: "INVALID_SHARES" });
        if (msg.includes("SHARES_TOO_LARGE")) throw new TRPCError({ code: "BAD_REQUEST", message: "SHARES_TOO_LARGE" });
        if (msg.includes("MARKET_CLOSED") || msg.includes("MARKET_NOT_OPEN")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "MARKET_CLOSED" });
        }
        if (msg.includes("AMOUNT_TOO_SMALL") || msg.includes("PAYOUT_TOO_SMALL")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "AMOUNT_TOO_SMALL" });
        }
        if (msg.includes("AMM_STATE_MISSING") || msg.includes("AMM_INCONSISTENT") || msg.includes("INVALID_LIQUIDITY")) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AMM_STATE_INVALID" });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const result = (Array.isArray(data) ? data[0] : data) as SellPositionResult | null;

      if (!result) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to sell position",
        });
      }

      const normalizeNumber = (value: string | number | bigint | null | undefined): number | null => {
        if (typeof value === "number" && Number.isFinite(value)) return value;
        if (typeof value === "string" && value.length > 0) {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : null;
        }
        if (typeof value === "bigint") {
          return Number(value);
        }
        return null;
      };

      type SellPositionResultLoose = SellPositionResult & {
        payout_net_minor?: string | number | bigint | null;
        received_minor?: string | number | bigint | null;
        shares_sold?: string | number | bigint | null;
      };
      const loose = result as SellPositionResultLoose;

      const payoutRaw =
        normalizeNumber(loose.payout_net_minor) ??
        normalizeNumber(loose.received_minor);
      const balanceRaw = normalizeNumber(result.new_balance_minor);
      const sharesRaw =
        normalizeNumber(loose.shares_sold) ?? normalizeNumber(shares) ?? 0;
      const priceBeforeRaw = normalizeNumber(result.price_before);
      const priceAfterRaw = normalizeNumber(result.price_after);

      if (payoutRaw === null || balanceRaw === null || priceBeforeRaw === null || priceAfterRaw === null) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "SELL_OUTPUT_INVALID",
        });
      }

      return {
        tradeId: String(result.trade_id),
        payoutMinor: payoutRaw,
        newBalanceMinor: balanceRaw,
        sharesSold: Number.isFinite(sharesRaw) ? sharesRaw : shares,
        priceBefore: priceBeforeRaw,
        priceAfter: priceAfterRaw,
      };
    }),

  /**
   * Resolve market (creator only) - calls service RPC
   */
  resolveMarket: publicProcedure
    .input(
      z.object({
        marketId: z.string().uuid(),
        outcome: z.enum(["YES", "NO"]),
      })
    )
    .output(
      z.object({
        marketId: z.string(),
        outcome: z.enum(["YES", "NO"]),
        totalPayoutMinor: z.number(),
        winnersCount: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }
      const { marketId, outcome } = input;

      // Enforce creator-only resolution at the API layer (we call the RPC using service_role).
      const { data: marketRow, error: marketLoadError } = await supabaseService
        .from("markets")
        .select("id, created_by, expires_at, resolve_outcome, state")
        .eq("id", marketId)
        .single();

      if (marketLoadError || !marketRow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: marketLoadError?.message ?? "Market not found",
        });
      }

      const creatorId = (marketRow as Pick<MarketRow, "created_by">).created_by;
      if (!creatorId || creatorId !== authUser.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Creator only" });
      }

      const endMs = Date.parse(String((marketRow as Pick<MarketRow, "expires_at">).expires_at));
      if (Number.isFinite(endMs) && Date.now() < endMs) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Event has not ended yet" });
      }

      if ((marketRow as Pick<MarketRow, "resolve_outcome" | "state">).resolve_outcome || (marketRow as Pick<MarketRow, "state">).state === "resolved") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Market already resolved" });
      }

      // Call the settlement RPC with service_role.
      const { data, error } = await (supabaseService as SupabaseDbClient).rpc("resolve_market_service_tx", {
        p_market_id: marketId,
        p_outcome: outcome,
      });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const result = (Array.isArray(data) ? data[0] : data) as ResolveMarketResult | null;

      if (!result) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to resolve market",
        });
      }

      return {
        marketId: String(result.market_id),
        outcome: result.outcome as "YES" | "NO",
        totalPayoutMinor: Number(result.total_payout_minor),
        winnersCount: Number(result.winners_count),
      };
    }),

  /**
   * Get user's positions (open holdings)
   */
  myPositions: publicProcedure
    .output(z.array(positionSummary))
    .query(async ({ ctx }) => {
      const { supabaseService, authUser, cookies } = ctx;
      if (!authUser) {
        // Log for debugging: check if cookie is present but JWT verification failed
        const hasAuthToken = Boolean(cookies?.auth_token);
        console.warn("[myPositions] authUser is null", { hasAuthToken, cookiesKeys: cookies ? Object.keys(cookies) : [] });
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      // Use service client for reads to avoid depending on presence/validity of sb_access_token cookie.
      const { data, error } = await supabaseService
        .from("positions")
        .select(`
          user_id, market_id, outcome, shares, avg_entry_price, updated_at,
          markets:market_id (title_rus, title_eng, state, resolve_outcome, closes_at, expires_at)
        `)
        .eq("user_id", authUser.id)
        .gt("shares", 0)
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("[myPositions] Supabase query error", { error: error.message, userId: authUser.id });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const rows = (data ?? []) as PositionWithMarket[];
      return rows.map((r) => mapPositionRow(r, VCOIN_DECIMALS));
    }),

  /**
   * Get user's trade history
   */
  myTrades: publicProcedure
    .output(z.array(tradeSummary))
    .query(async ({ ctx }) => {
      const { supabaseService, authUser, cookies } = ctx;
      if (!authUser) {
        // Log for debugging: check if cookie is present but JWT verification failed
        const hasAuthToken = Boolean(cookies?.auth_token);
        console.warn("[myTrades] authUser is null", { hasAuthToken, cookiesKeys: cookies ? Object.keys(cookies) : [] });
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      // Use service client for reads to avoid depending on presence/validity of sb_access_token cookie.
      const { data, error } = await supabaseService
        .from("trades")
        .select(`
          id, market_id, user_id, action, outcome, asset_code,
          collateral_gross_minor, fee_minor, collateral_net_minor,
          shares_delta, price_before, price_after, created_at,
          markets:market_id (title_rus, title_eng, state, resolve_outcome)
        `)
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        console.error("[myTrades] Supabase query error", { error: error.message, userId: authUser.id });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const rows: TradeWithMarket[] = data ?? [];
      return rows.map((r) => mapTradeRow(r, VCOIN_DECIMALS));
    }),

  /**
   * Get markets created by current user (with bet flag)
   */
  myMarkets: publicProcedure
    .output(z.array(marketOutput.extend({ hasBets: z.boolean() })))
    .query(async ({ ctx }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      const { data, error } = await supabaseService
        .from("markets")
        .select(`
          id, title_rus, title_eng, description, source, image_url, state, closes_at, expires_at, created_by,
          resolve_outcome, settlement_asset_code, fee_bps, liquidity_b, amm_type, created_at,
          category_id,
          market_amm_state (market_id, b, q_yes, q_no, last_price_yes, fee_accumulated_minor, updated_at)
        `)
        .eq("created_by", authUser.id)
        .order("created_at", { ascending: false });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const rows: MarketWithAmm[] = data ?? [];
      const marketIds = rows.map((r) => r.id);

      const labelsById = new Map<string, Pick<MarketCategoryRow, "label_ru" | "label_en">>();
      const categoryIds = Array.from(
        new Set(rows.map((r) => r.category_id).filter((v): v is string => typeof v === "string" && v.length > 0))
      );
      if (categoryIds.length > 0) {
        const { data: cats, error: catsError } = await supabaseService
          .from("market_categories")
          .select("id, label_ru, label_en")
          .in("id", categoryIds);
        if (!catsError) {
          const typed = (cats ?? []) as Array<Pick<MarketCategoryRow, "id" | "label_ru" | "label_en">>;
          typed.forEach((c) => labelsById.set(c.id, { label_ru: c.label_ru, label_en: c.label_en }));
        }
      }

      const creatorById = new Map<string, CreatorMeta>();
      const creatorIds = Array.from(
        new Set(rows.map((r) => r.created_by).filter((v): v is string => typeof v === "string" && v.length > 0))
      );
      if (creatorIds.length > 0) {
        const { data: creators, error: creatorsError } = await supabaseService
          .from("users")
          .select("id, display_name, username, avatar_url, telegram_photo_url")
          .in("id", creatorIds);
        if (!creatorsError && creators) {
          (creators as Array<Pick<DbUserRow, "id" | "display_name" | "username" | "avatar_url" | "telegram_photo_url">>).forEach(
            (u) => {
              const name = u.display_name ?? u.username ?? null;
              const avatarUrl = u.avatar_url ?? u.telegram_photo_url ?? null;
              creatorById.set(String(u.id), { name, avatarUrl });
            }
          );
        }
      }

      let betMarketIds = new Set<string>();
      if (marketIds.length > 0) {
        const { data: trades, error: tradesError } = await supabaseService
          .from("trades")
          .select("market_id")
          .in("market_id", marketIds);
        if (tradesError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: tradesError.message,
          });
        }
        betMarketIds = new Set((trades ?? []).map((t) => String((t as { market_id: string }).market_id)));
      }

      return rows.map((r) => {
        const mapped = mapMarketRow(r, labelsById, creatorById);
        return {
          ...mapped,
          hasBets: betMarketIds.has(r.id),
        };
      });
    }),

  /**
   * Get user's bookmarked markets (IDs)
   */
  myBookmarks: publicProcedure
    .output(z.array(marketBookmarkOutput))
    .query(async ({ ctx }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      // Use service client for reads to avoid depending on presence/validity of sb_access_token cookie.
      const { data, error } = await supabaseService
        .from("market_bookmarks")
        .select("market_id, created_at")
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: false });

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      const rows = (data ?? []) as Pick<MarketBookmarkRow, "market_id" | "created_at">[];
      return rows.map((r) => ({
        marketId: r.market_id,
        createdAt: new Date(r.created_at).toISOString(),
      }));
    }),

  /**
   * Set/unset a bookmark on a market
   */
  setBookmark: publicProcedure
    .input(z.object({ marketId: z.string().uuid(), bookmarked: z.boolean() }))
    .output(z.object({ marketId: z.string(), bookmarked: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      const exists = await supabaseService
        .from("markets")
        .select("id")
        .eq("id", input.marketId)
        .maybeSingle();

      if (exists.error || !exists.data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Market not found" });
      }

      if (input.bookmarked) {
        // Use service client for writes so we don't depend on sb_access_token cookie (we auth via auth_token).
        const ins = await supabaseService
          .from("market_bookmarks")
          .insert({ user_id: authUser.id, market_id: input.marketId } as Database["public"]["Tables"]["market_bookmarks"]["Insert"]);
        if (ins.error) {
          const msg = String(ins.error.message ?? "");
          if (!msg.toLowerCase().includes("duplicate")) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
          }
        }
      } else {
        const del = await supabaseService
          .from("market_bookmarks")
          .delete()
          .eq("user_id", authUser.id)
          .eq("market_id", input.marketId);
        if (del.error) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: del.error.message });
        }
      }

      return { marketId: input.marketId, bookmarked: input.bookmarked };
    }),

  /**
   * Get wallet balance for current user
   */
  myWalletBalance: publicProcedure
    .output(
      z.object({
        balanceMinor: z.number(),
        balanceMajor: z.number(),
        assetCode: z.string(),
        decimals: z.number(),
      })
    )
    .query(async ({ ctx }) => {
      const { supabase, authUser } = ctx;
      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      const { data, error } = await supabase
        .from("wallet_balances")
        .select("user_id, asset_code, balance_minor")
        .eq("user_id", authUser.id)
        .eq("asset_code", DEFAULT_ASSET)
        .maybeSingle();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const walletRow = data as WalletBalanceRow | null;
      const balanceMinor = walletRow ? Number(walletRow.balance_minor ?? 0) : 0;

      return {
        balanceMinor,
        balanceMajor: toMajorUnits(Number(balanceMinor), VCOIN_DECIMALS),
        assetCode: DEFAULT_ASSET,
        decimals: VCOIN_DECIMALS,
      };
    }),

  /**
   * Get price candles for market chart
   */
  getPriceCandles: publicProcedure
    .input(
      z.object({
        marketId: z.string().uuid(),
        limit: z.number().min(1).max(1000).optional().default(100),
      })
    )
    .output(
      z.array(
        z.object({
          bucket: z.string(),
          open: z.number(),
          high: z.number(),
          low: z.number(),
          close: z.number(),
          volume: z.number(),
          tradesCount: z.number(),
        })
      )
    )
    .query(async ({ ctx, input }) => {
      const { supabase } = ctx;

      const { data, error } = await supabase
        .from("market_price_candles")
        .select("market_id, bucket, open, high, low, close, volume_minor, trades_count")
        .eq("market_id", input.marketId)
        .order("bucket", { ascending: true })
        .limit(input.limit);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      type CandleRow = Database["public"]["Tables"]["market_price_candles"]["Row"];
      return (data ?? []).map((c) => {
        const candle = c as CandleRow;
        return {
          bucket: candle.bucket,
          open: Number(candle.open),
          high: Number(candle.high),
          low: Number(candle.low),
          close: Number(candle.close),
          volume: toMajorUnits(Number(candle.volume_minor), VCOIN_DECIMALS),
          tradesCount: candle.trades_count,
        };
      });
    }),

  /**
   * Get public trades feed (no user identities)
   */
  getPublicTrades: publicProcedure
    .input(
      z.object({
        marketId: z.string().uuid().optional(),
        limit: z.number().min(1).max(100).optional().default(50),
      })
    )
    .output(
      z.array(
        z.object({
          id: z.string(),
          marketId: z.string(),
          action: z.enum(["buy", "sell"]),
          outcome: z.enum(["YES", "NO"]),
          collateralGross: z.number(),
          sharesDelta: z.number(),
          priceBefore: z.number(),
          priceAfter: z.number(),
          createdAt: z.string(),
        })
      )
    )
    .query(async ({ ctx, input }) => {
      // Use service client to bypass RLS on underlying `trades` table.
      // This endpoint returns a privacy-safe public feed (no user identities), so it's safe to do so.
      const { supabaseService } = ctx;

      let query = supabaseService
        .from("trades_public")
        .select("id, market_id, action, outcome, collateral_gross_minor, shares_delta, price_before, price_after, created_at")
        .order("created_at", { ascending: false })
        .limit(input.limit);

      if (input.marketId) {
        query = query.eq("market_id", input.marketId);
      }

      const { data, error } = await query;

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      type PublicTradeRow = Database["public"]["Views"]["trades_public"]["Row"];
      return (data ?? []).map((t) => {
        const trade = t as PublicTradeRow;
        return {
          id: trade.id,
          marketId: trade.market_id,
          action: trade.action as "buy" | "sell",
          outcome: trade.outcome as "YES" | "NO",
          collateralGross: toMajorUnits(Number(trade.collateral_gross_minor), VCOIN_DECIMALS),
          sharesDelta: Number(trade.shares_delta),
          priceBefore: Number(trade.price_before),
          priceAfter: Number(trade.price_after),
          createdAt: new Date(trade.created_at).toISOString(),
        };
      });
    }),

  /**
   * Get market comments (public) with author name + avatar.
   */
  getMarketComments: publicProcedure
    .input(
      z.object({
        marketId: z.string().uuid(),
        limit: z.number().min(1).max(200).optional().default(50),
      })
    )
    .output(z.array(marketCommentOutput))
    .query(async ({ ctx, input }) => {
      const { supabase, supabaseService, authUser } = ctx;
      const { data, error } = await supabase
        .from("market_comments_public")
        .select("id, market_id, user_id, parent_id, body, created_at, author_name, author_username, author_avatar_url, likes_count")
        .eq("market_id", input.marketId)
        .order("created_at", { ascending: false })
        .limit(input.limit);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const rows = (data ?? []) as MarketCommentPublicRow[];

      let likedSet = new Set<string>();
      if (authUser && rows.length > 0) {
        const ids = rows.map((r) => r.id);
        // Use service client so this doesn't depend on a Supabase session cookie in WebViews.
        const liked = await supabaseService
          .from("market_comment_likes")
          .select("comment_id")
          .eq("user_id", authUser.id)
          .in("comment_id", ids);

        if (!liked.error && liked.data) {
          const likeRows = liked.data as Pick<MarketCommentLikeRow, "comment_id">[];
          likedSet = new Set(likeRows.map((r) => r.comment_id));
        }
      }

      return rows.map((c) => ({
        id: c.id,
        marketId: c.market_id,
        userId: c.user_id,
        parentId: c.parent_id ?? null,
        body: c.body,
        createdAt: new Date(c.created_at).toISOString(),
        authorName: c.author_name,
        authorUsername: c.author_username,
        authorAvatarUrl: c.author_avatar_url,
        likesCount: Number(c.likes_count ?? 0),
        likedByMe: likedSet.has(c.id),
      }));
    }),

  /**
   * Post a comment under a market (authenticated).
   */
  postMarketComment: publicProcedure
    .input(
      z.object({
        marketId: z.string().uuid(),
        body: z.string().trim().min(1).max(2000),
        parentId: z.string().uuid().optional().nullable(),
      })
    )
    .output(marketCommentOutput)
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (input.parentId) {
        const { data: parent, error: parentErr } = await supabaseService
          .from("market_comments")
          .select("id, market_id")
          .eq("id", input.parentId)
          .maybeSingle();

        if (parentErr || !parent) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid parent comment" });
        }

        const parentMarketId = String((parent as { market_id: string }).market_id);
        if (parentMarketId !== input.marketId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Parent comment is from another market" });
        }
      }

      const payload: MarketCommentInsert = {
        market_id: input.marketId,
        user_id: authUser.id,
        body: input.body.trim(),
        parent_id: input.parentId ?? null,
      };

      // Use service client (we authenticate via JWT cookie, not Supabase session cookie).
      const inserted = await supabaseService
        .from("market_comments")
        .insert(payload)
        .select("id")
        .single();

      if (inserted.error || !inserted.data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: inserted.error?.message ?? "Failed to create comment",
        });
      }

      const { data: row, error } = await supabaseService
        .from("market_comments_public")
        .select("id, market_id, user_id, parent_id, body, created_at, author_name, author_username, author_avatar_url, likes_count")
        .eq("id", inserted.data.id)
        .single();

      if (error || !row) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error?.message ?? "Failed to load comment",
        });
      }

      const c = row as MarketCommentPublicRow;
      return {
        id: c.id,
        marketId: c.market_id,
        userId: c.user_id,
        parentId: c.parent_id ?? null,
        body: c.body,
        createdAt: new Date(c.created_at).toISOString(),
        authorName: c.author_name,
        authorUsername: c.author_username,
        authorAvatarUrl: c.author_avatar_url,
        likesCount: Number(c.likes_count ?? 0),
        likedByMe: false,
      };
    }),

  toggleMarketCommentLike: publicProcedure
    .input(
      z.object({
        commentId: z.string().uuid(),
      })
    )
    .output(
      z.object({
        commentId: z.string(),
        likesCount: z.number(),
        likedByMe: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      const exists = await supabaseService
        .from("market_comments")
        .select("id")
        .eq("id", input.commentId)
        .maybeSingle();

      if (exists.error || !exists.data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found" });
      }

      const current = await supabaseService
        .from("market_comment_likes")
        .select("comment_id")
        .eq("comment_id", input.commentId)
        .eq("user_id", authUser.id)
        .maybeSingle();

      const alreadyLiked = Boolean(current.data);

      if (alreadyLiked) {
        const del = await supabaseService
          .from("market_comment_likes")
          .delete()
          .eq("comment_id", input.commentId)
          .eq("user_id", authUser.id);
        if (del.error) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: del.error.message });
        }
      } else {
        const ins = await supabaseService
          .from("market_comment_likes")
          .insert({ comment_id: input.commentId, user_id: authUser.id } as Database["public"]["Tables"]["market_comment_likes"]["Insert"]);
        if (ins.error) {
          const msg = String(ins.error.message ?? "");
          if (!msg.toLowerCase().includes("duplicate")) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
          }
        }
      }

      const countRes = await supabaseService
        .from("market_comment_likes")
        .select("comment_id", { count: "exact", head: true })
        .eq("comment_id", input.commentId);

      return {
        commentId: input.commentId,
        likesCount: Number(countRes.count ?? 0),
        likedByMe: !alreadyLiked,
      };
    }),

  myComments: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(200).optional().default(50) }).optional())
    .output(
      z.array(
        z.object({
          id: z.string(),
          marketId: z.string(),
          parentId: z.string().nullable(),
          body: z.string(),
          createdAt: z.string(),
          marketTitleRu: z.string(),
          marketTitleEn: z.string(),
          likesCount: z.number(),
        })
      )
    )
    .query(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      const limit = input?.limit ?? 50;

      const { data, error } = await supabaseService
        .from("market_comments_public")
        .select("id, market_id, parent_id, body, created_at, likes_count")
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      const rows = (data ?? []) as MarketCommentPublicRow[];
      const marketIds = Array.from(new Set(rows.map((r) => r.market_id)));

      const titlesById = new Map<string, Pick<MarketRow, "title_rus" | "title_eng">>();
      if (marketIds.length > 0) {
        const marketsRes = await supabaseService
          .from("markets")
          .select("id, title_rus, title_eng")
          .in("id", marketIds);
        if (!marketsRes.error && marketsRes.data) {
          (marketsRes.data as Array<Pick<MarketRow, "id" | "title_rus" | "title_eng">>).forEach((m) => {
            titlesById.set(m.id, { title_rus: m.title_rus, title_eng: m.title_eng });
          });
        }
      }

      return rows.map((r) => {
        const titles = titlesById.get(r.market_id);
        return {
          id: r.id,
          marketId: r.market_id,
          parentId: r.parent_id ?? null,
          body: r.body,
          createdAt: new Date(r.created_at).toISOString(),
          marketTitleRu: titles?.title_rus ?? titles?.title_eng ?? "",
          marketTitleEn: titles?.title_eng ?? "",
          likesCount: Number(r.likes_count ?? 0),
        };
      });
    }),

  /**
   * Create market (authenticated)
   */
  createMarket: publicProcedure
    .input(
      z.object({
        titleEn: z.string().min(3), // Allow any characters including special characters
        description: z.string().optional().nullable(), // Optional
        source: z.string().optional().nullable(), // Optional
        closesAt: z.string().optional().nullable(),
        expiresAt: z.string(), // Accepts datetime-local format (YYYY-MM-DDTHH:MM)
        categoryId: z.string().min(1),
        imageUrl: z.string().optional().nullable(), // Optional image URL from Supabase storage
        settlementAssetCode: z.enum(["VCOIN", "USDC"]).optional(),
      })
    )
    .output(
      z.object({
        id: z.string(),
        titleRu: z.string().nullable(),
        titleEn: z.string().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      const expiresAtMs = Date.parse(input.expiresAt);
      const closesAtMs = input.closesAt ? Date.parse(input.closesAt) : expiresAtMs;
      if (!Number.isFinite(closesAtMs) || !Number.isFinite(expiresAtMs)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid dates" });
      }
      if (closesAtMs > expiresAtMs) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Trading close must be <= end time" });
      }
      // Validate dates are not in the past
      const now = Date.now();
      if (expiresAtMs < now) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Event end time must be in the future" });
      }
      if (closesAtMs < now) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Trading close time must be in the future" });
      }

      const { data: category, error: categoryError } = await supabaseService
        .from("market_categories")
        .select("id, label_ru, label_en, is_enabled")
        .eq("id", input.categoryId)
        .maybeSingle();

      const cat = category as Pick<MarketCategoryRow, "id" | "label_ru" | "label_en" | "is_enabled"> | null;
      if (categoryError || !cat || !cat.is_enabled) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid category" });
      }

      // Validate trimmed title is not empty
      const titleEnTrimmed = input.titleEn.trim();
      const descriptionTrimmed = input.description?.trim() ?? "";
      const sourceTrimmed = input.source?.trim() ?? "";
      if (titleEnTrimmed.length < 3) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Title must be at least 3 characters" });
      }
      if (descriptionTrimmed.length > 0 && descriptionTrimmed.length < 3) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Description must be at least 3 characters" });
      }
      if (sourceTrimmed.length > 0 && sourceTrimmed.length < 3) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Source must be at least 3 characters" });
      }

      const { data: adminRow, error: adminError } = await supabaseService
        .from("users")
        .select("is_admin")
        .eq("id", authUser.id)
        .maybeSingle();
      if (adminError) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: adminError.message });
      }
      const isAdmin = Boolean(adminRow?.is_admin);

      const requestedAsset = (input.settlementAssetCode ?? DEFAULT_ASSET).toUpperCase();
      if (!isAdmin && requestedAsset !== DEFAULT_ASSET) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only admins can create USDC markets",
        });
      }
      const { data: assetRow, error: assetError } = await supabaseService
        .from("assets")
        .select("code, is_enabled")
        .eq("code", requestedAsset)
        .maybeSingle();
      if (assetError) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: assetError.message });
      }
      if (!assetRow || assetRow.is_enabled !== true) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ASSET_DISABLED" });
      }

      // Insert market - title_rus is optional (nullable) for English-only markets
      const { data: market, error: marketError } = await (supabaseService as SupabaseDbClient)
        .from("markets")
        .insert({
          title_rus: null, // Optional field - focusing on English audience
          title_eng: titleEnTrimmed,
          description: descriptionTrimmed || null,
          source: sourceTrimmed || null,
          image_url: input.imageUrl?.trim() || null,
          state: "open",
          closes_at: new Date(closesAtMs).toISOString(),
          expires_at: new Date(expiresAtMs).toISOString(),
          created_by: authUser.id,
          settlement_asset_code: requestedAsset,
          fee_bps: 0,
          liquidity_b: 100,
          amm_type: "lmsr",
          category_id: cat.id,
        })
        .select("id, title_rus, title_eng")
        .single();

      if (marketError || !market) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: marketError?.message ?? "Failed to create market",
        });
      }

      // Insert AMM state (use upsert with ignoreDuplicates to handle race conditions)
      const { error: ammError } = await (supabaseService as SupabaseDbClient)
        .from("market_amm_state")
        .upsert(
          {
            market_id: market.id,
            b: 100,
            q_yes: 0,
            q_no: 0,
            last_price_yes: 0.5,
            fee_accumulated_minor: 0,
          },
          {
            onConflict: "market_id",
            ignoreDuplicates: true, // Silently skip if already exists (handles race conditions)
          }
        );

      if (ammError) {
        // Rollback by deleting market (not ideal, but simple)
        await supabaseService.from("markets").delete().eq("id", market.id);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: ammError.message,
        });
      }

      return { id: market.id, titleRu: market.title_rus ?? market.title_eng, titleEn: market.title_eng };
    }),

  updateMarket: publicProcedure
    .input(
      z.object({
        marketId: z.string().uuid(),
        titleEn: z.string().min(3),
        description: z.string().optional().nullable(),
        source: z.string().optional().nullable(),
        closesAt: z.string().optional().nullable(),
        expiresAt: z.string(),
        categoryId: z.string().min(1),
        imageUrl: z.string().optional().nullable(),
      })
    )
    .output(z.object({ id: z.string(), titleRu: z.string().nullable(), titleEn: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      const { marketRow, hasBets } = await ensureCreatorAndNoBets(
        supabaseService as SupabaseDbClient,
        input.marketId,
        authUser.id
      );

      if (hasBets) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "MARKET_HAS_BETS" });
      }

      if (marketRow.state !== "open") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "MARKET_NOT_OPEN" });
      }

      const expiresAtMs = Date.parse(input.expiresAt);
      const closesAtMs = input.closesAt ? Date.parse(input.closesAt) : expiresAtMs;
      if (!Number.isFinite(closesAtMs) || !Number.isFinite(expiresAtMs)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid dates" });
      }
      if (closesAtMs > expiresAtMs) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Trading close must be <= end time" });
      }
      const now = Date.now();
      if (expiresAtMs < now) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Event end time must be in the future" });
      }
      if (closesAtMs < now) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Trading close time must be in the future" });
      }

      const { data: category, error: categoryError } = await supabaseService
        .from("market_categories")
        .select("id, label_ru, label_en, is_enabled")
        .eq("id", input.categoryId)
        .maybeSingle();

      const cat = category as Pick<MarketCategoryRow, "id" | "label_ru" | "label_en" | "is_enabled"> | null;
      if (categoryError || !cat || !cat.is_enabled) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid category" });
      }

      const titleEnTrimmed = input.titleEn.trim();
      const descriptionTrimmed = input.description?.trim() ?? "";
      const sourceTrimmed = input.source?.trim() ?? "";
      if (titleEnTrimmed.length < 3) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Title must be at least 3 characters" });
      }
      if (descriptionTrimmed.length > 0 && descriptionTrimmed.length < 3) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Description must be at least 3 characters" });
      }
      if (sourceTrimmed.length > 0 && sourceTrimmed.length < 3) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Source must be at least 3 characters" });
      }

      const { data: updated, error: updateError } = await (supabaseService as SupabaseDbClient)
        .from("markets")
        .update({
          title_eng: titleEnTrimmed,
          description: descriptionTrimmed || null,
          source: sourceTrimmed || null,
          image_url: input.imageUrl?.trim() || null,
          closes_at: new Date(closesAtMs).toISOString(),
          expires_at: new Date(expiresAtMs).toISOString(),
          category_id: cat.id,
        })
        .eq("id", input.marketId)
        .select("id, title_rus, title_eng")
        .single();

      if (updateError || !updated) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: updateError?.message ?? "Failed to update market",
        });
      }

      return { id: updated.id, titleRu: updated.title_rus ?? updated.title_eng, titleEn: updated.title_eng };
    }),

  deleteMarket: publicProcedure
    .input(z.object({ marketId: z.string().uuid() }))
    .output(z.object({ ok: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      const { hasBets } = await ensureCreatorAndNoBets(
        supabaseService as SupabaseDbClient,
        input.marketId,
        authUser.id
      );

      if (hasBets) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "MARKET_HAS_BETS" });
      }

      const { data: comments, error: commentsError } = await supabaseService
        .from("market_comments")
        .select("id")
        .eq("market_id", input.marketId);
      if (commentsError) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: commentsError.message });
      }
      const commentIds = (comments ?? []).map((c) => String((c as { id: string }).id));
      if (commentIds.length > 0) {
        const { error: likesError } = await supabaseService
          .from("market_comment_likes")
          .delete()
          .in("comment_id", commentIds);
        if (likesError) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: likesError.message });
        }
      }

      const deletions = await Promise.all([
        supabaseService.from("market_comments").delete().eq("market_id", input.marketId),
        supabaseService.from("market_bookmarks").delete().eq("market_id", input.marketId),
        supabaseService.from("market_context").delete().eq("market_id", input.marketId),
        supabaseService.from("market_price_candles").delete().eq("market_id", input.marketId),
        supabaseService.from("market_amm_state").delete().eq("market_id", input.marketId),
        supabaseService.from("market_onchain_map").delete().eq("market_id", input.marketId),
        supabaseService.from("positions").delete().eq("market_id", input.marketId),
        supabaseService.from("trades").delete().eq("market_id", input.marketId),
        supabaseService.from("on_chain_transactions").delete().eq("market_id", input.marketId),
      ]);

      const deletionError = deletions.find((res) => res.error)?.error;
      if (deletionError) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: deletionError.message });
      }

      const { error: marketDeleteError } = await supabaseService
        .from("markets")
        .delete()
        .eq("id", input.marketId);

      if (marketDeleteError) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: marketDeleteError.message });
      }

      return { ok: true };
    }),
});
