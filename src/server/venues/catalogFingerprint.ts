import type { PolymarketMarket } from "../polymarket/client";
import type { VenueMarket } from "./types";

const normalizeVolumeForFingerprint = (value: number): string => {
  if (!Number.isFinite(value)) return "0.00";
  return Math.max(0, value).toFixed(2);
};

export const buildPolymarketCatalogFingerprint = (market: PolymarketMarket): string => {
  const outcomes = market.outcomes
    .map((outcome) => `${outcome.id}|${outcome.tokenId ?? ""}|${outcome.title}|${outcome.sortOrder}`)
    .join(";");
  const tokens = market.clobTokenIds.join(",");

  return [
    market.state,
    market.slug,
    market.title,
    market.description ?? "",
    market.imageUrl ?? "",
    market.sourceUrl ?? "",
    market.createdAt,
    market.closesAt,
    market.expiresAt,
    market.category ?? "",
    market.resolvedOutcomeTitle ?? "",
    normalizeVolumeForFingerprint(market.volume),
    outcomes,
    tokens,
  ].join("||");
};

export const buildVenueCatalogFingerprint = (market: VenueMarket): string => {
  const outcomes = [...market.outcomes]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((outcome) =>
      [
        outcome.id,
        outcome.providerOutcomeId ?? "",
        outcome.providerTokenId ?? "",
        outcome.title,
        outcome.sortOrder,
        outcome.isActive ? "1" : "0",
      ].join("|")
    )
    .join(";");

  return [
    market.state,
    market.marketAddress ?? "",
    market.slug,
    market.title,
    market.description ?? "",
    market.category ?? "",
    market.sourceUrl ?? "",
    market.imageUrl ?? "",
    market.createdAt,
    market.closesAt,
    market.expiresAt,
    market.resolvedOutcomeTitle ?? "",
    normalizeVolumeForFingerprint(market.volume),
    outcomes,
  ].join("||");
};
