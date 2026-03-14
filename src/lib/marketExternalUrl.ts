import type { Market } from "@/types";

const POLYMARKET_SITE_URL = "https://polymarket.com";
const LIMITLESS_SITE_URL = "https://limitless.exchange";

export type ExternalLinkMarket = Pick<Market, "id" | "slug" | "provider" | "providerMarketId" | "source">;

export const defaultExternalMarketUrl = (provider?: Market["provider"]): string =>
  provider === "limitless" ? LIMITLESS_SITE_URL : POLYMARKET_SITE_URL;

const extractVenueSlug = (value: string): string => {
  const withoutOrigin = value.replace(/^https?:\/\/[^/]+/i, "");
  const withoutQuery = withoutOrigin.split(/[?#]/, 1)[0] ?? "";
  const withoutLeadingSlashes = withoutQuery.replace(/^\/+/, "");
  const withoutLocale = withoutLeadingSlashes.replace(/^[a-z]{2}(?:-[a-z]{2})?\//i, "");
  return withoutLocale.replace(/^(event|market|markets)\//i, "").trim();
};

/**
 * Encode a slug for use in a URL path segment.
 * Decode first to avoid double-encoding (e.g. %20 → %2520),
 * then encode only characters unsafe for path segments while preserving `/`.
 */
const encodeSlugForPath = (slug: string): string => {
  try {
    const decoded = decodeURIComponent(slug);
    return decoded
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
  } catch {
    return encodeURIComponent(slug);
  }
};

/**
 * Check if a value looks like a provider condition/market ID rather than a
 * human-readable slug. Condition IDs are hex strings (0x...) or UUIDs.
 */
const isProviderIdNotSlug = (value: string): boolean =>
  /^0x[0-9a-f]+$/i.test(value) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export const buildCanonicalVenueUrl = (
  provider: Market["provider"] | undefined,
  market?: ExternalLinkMarket | null
): string => {
  const fallbackBase = defaultExternalMarketUrl(provider);
  const sourceValue = String(market?.source ?? "").trim();

  const fromSource = (() => {
    if (!sourceValue) return "";
    // If the source is already a full URL to the correct venue, return it directly
    if (/^https?:\/\//i.test(sourceValue)) {
      if (provider === "limitless" && /limitless\.exchange/i.test(sourceValue)) return sourceValue;
      if (provider !== "limitless" && /polymarket\.com/i.test(sourceValue)) return sourceValue;
    }
    return extractVenueSlug(sourceValue);
  })();

  // If fromSource is already a full URL, return it directly (no re-encoding)
  if (/^https?:\/\//i.test(fromSource)) return fromSource;

  const fallbackSlug = String(market?.slug ?? "").trim();
  const fallbackId = String(market?.providerMarketId ?? market?.id ?? "")
    .trim()
    .replace(/^limitless:/i, "")
    .replace(/^polymarket:/i, "");

  const slug = fromSource || fallbackSlug;
  // Don't use condition IDs as slugs — they produce broken venue URLs
  const effectiveSlug = slug || (fallbackId && !isProviderIdNotSlug(fallbackId) ? fallbackId : "");
  if (!effectiveSlug) return fallbackBase;

  if (provider === "limitless") {
    return `${LIMITLESS_SITE_URL}/market/${encodeSlugForPath(effectiveSlug)}`;
  }
  return `${POLYMARKET_SITE_URL}/event/${encodeSlugForPath(effectiveSlug)}`;
};

export const normalizeExternalMarketUrl = (
  raw: string | null | undefined,
  provider?: Market["provider"]
): string | null => {
  const value = (raw ?? "").trim();
  const fallbackBase = defaultExternalMarketUrl(provider);
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^\/\//.test(value)) return `https:${value}`;
  if (value.startsWith("/")) {
    const bare = extractVenueSlug(value);
    if (!bare) return fallbackBase;
    return provider === "limitless"
      ? `${LIMITLESS_SITE_URL}/market/${encodeSlugForPath(bare)}`
      : `${POLYMARKET_SITE_URL}/event/${encodeSlugForPath(bare)}`;
  }
  if (/^(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:event|market|markets)\//i.test(value)) {
    const slug = extractVenueSlug(value);
    if (provider === "limitless") {
      return `${LIMITLESS_SITE_URL}/market/${encodeSlugForPath(slug)}`;
    }
    return `${POLYMARKET_SITE_URL}/event/${encodeSlugForPath(slug)}`;
  }
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:\/|$)/i.test(value)) return `https://${value}`;
  return buildCanonicalVenueUrl(provider, { id: "", provider: provider ?? "polymarket", providerMarketId: "", source: value });
};

export const getExternalMarketUrl = (market: ExternalLinkMarket | null | undefined): string => {
  const provider = market?.provider ?? "polymarket";
  const normalized = normalizeExternalMarketUrl(market?.source, provider);
  if (provider === "limitless") {
    if (normalized && /limitless\.exchange/i.test(normalized)) return normalized;
    return buildCanonicalVenueUrl("limitless", market);
  }
  if (normalized && /polymarket\.com/i.test(normalized)) return normalized;
  return buildCanonicalVenueUrl("polymarket", market);
};
