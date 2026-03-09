import type { Market } from "@/types";

const POLYMARKET_SITE_URL = "https://polymarket.com";
const LIMITLESS_SITE_URL = "https://limitless.exchange";

export type ExternalLinkMarket = Pick<Market, "id" | "provider" | "providerMarketId" | "source">;

export const defaultExternalMarketUrl = (provider?: Market["provider"]): string =>
  provider === "limitless" ? LIMITLESS_SITE_URL : POLYMARKET_SITE_URL;

const extractVenueSlug = (value: string): string => {
  const withoutOrigin = value.replace(/^https?:\/\/[^/]+/i, "");
  const withoutQuery = withoutOrigin.split(/[?#]/, 1)[0] ?? "";
  const withoutLeadingSlashes = withoutQuery.replace(/^\/+/, "");
  const withoutLocale = withoutLeadingSlashes.replace(/^[a-z]{2}(?:-[a-z]{2})?\//i, "");
  return withoutLocale.replace(/^(event|market|markets)\//i, "").trim();
};

export const buildCanonicalVenueUrl = (
  provider: Market["provider"] | undefined,
  market?: ExternalLinkMarket | null
): string => {
  const fallbackBase = defaultExternalMarketUrl(provider);
  const sourceValue = String(market?.source ?? "").trim();

  const fromSource = (() => {
    if (!sourceValue) return "";
    return extractVenueSlug(sourceValue);
  })();
  const fallbackId = String(market?.providerMarketId ?? market?.id ?? "")
    .trim()
    .replace(/^limitless:/i, "")
    .replace(/^polymarket:/i, "");
  const slug = fromSource || fallbackId;
  if (!slug) return fallbackBase;

  if (provider === "limitless") {
    return `${LIMITLESS_SITE_URL}/market/${encodeURIComponent(slug)}`;
  }
  return `${POLYMARKET_SITE_URL}/event/${encodeURIComponent(slug)}`;
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
      ? `${LIMITLESS_SITE_URL}/market/${encodeURIComponent(bare)}`
      : `${POLYMARKET_SITE_URL}/event/${encodeURIComponent(bare)}`;
  }
  if (/^(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:event|market|markets)\//i.test(value)) {
    const slug = extractVenueSlug(value);
    if (provider === "limitless") {
      return `${LIMITLESS_SITE_URL}/market/${encodeURIComponent(slug)}`;
    }
    return `${POLYMARKET_SITE_URL}/event/${encodeURIComponent(slug)}`;
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
