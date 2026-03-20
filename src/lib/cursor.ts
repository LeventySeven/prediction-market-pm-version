/**
 * Shared offset-based cursor encoding/decoding for paginated tRPC endpoints.
 */

export const encodeCursor = (offset: number): string =>
  Buffer.from(String(Math.max(0, Math.floor(offset))), "utf8").toString("base64url");

export const decodeCursor = (cursor?: string | null): number => {
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
