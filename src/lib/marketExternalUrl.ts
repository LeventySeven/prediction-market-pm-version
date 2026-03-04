import type { Market } from "@/types";

const POLYMARKET_SITE_URL = "https://polymarket.com";
const LIMITLESS_SITE_URL = "https://limitless.exchange";

export type ExternalLinkMarket = Pick<Market, "id" | "provider" | "providerMarketId" | "source">;

export const defaultExternalMarketUrl = (provider?: Market["provider"]): string =>
  provider === "limitless" ? LIMITLESS_SITE_URL : POLYMARKET_SITE_URL;

export const buildCanonicalVenueUrl = (
  provider: Market["provider"] | undefined,
  market?: ExternalLinkMarket | null
): string => {
  const fallbackBase = defaultExternalMarketUrl(provider);
  const sourceValue = String(market?.source ?? "").trim();

  const fromSource = (() => {
    if (!sourceValue) return "";
    const bare = sourceValue
      .replace(/^https?:\/\/[^/]+/i, "")
      .replace(/^\/+/, "")
      .replace(/^(event|market|markets)\//i, "")
      .trim();
    return bare;
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
    const bare = value.replace(/^\/+/, "");
    if (provider === "limitless" && /^(event|markets)\//i.test(bare)) {
      return `${LIMITLESS_SITE_URL}/market/${encodeURIComponent(bare.replace(/^(event|markets)\//i, ""))}`;
    }
    if (provider === "polymarket" && /^market\//i.test(bare)) {
      return `${POLYMARKET_SITE_URL}/event/${encodeURIComponent(bare.replace(/^market\//i, ""))}`;
    }
    return `${fallbackBase}/${bare}`;
  }
  if (/^(event|market|markets)\//i.test(value)) {
    if (provider === "limitless") {
      const slug = value.replace(/^(event|market|markets)\//i, "");
      return `${LIMITLESS_SITE_URL}/market/${encodeURIComponent(slug)}`;
    }
    const slug = value.replace(/^(event|market|markets)\//i, "");
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
