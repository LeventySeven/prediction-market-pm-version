import { describe, expect, it } from "bun:test";
import { buildPolymarketCatalogFingerprint, buildVenueCatalogFingerprint } from "../../src/server/venues/catalogFingerprint";

describe("catalog fingerprint helpers", () => {
  it("treats Polymarket volume changes as catalog changes", () => {
    const base = {
      id: "pm-1",
      conditionId: "pm-1",
      slug: "test-market",
      title: "Test market",
      description: null,
      imageUrl: null,
      sourceUrl: null,
      state: "open" as const,
      closesAt: "2026-03-12T00:00:00.000Z",
      expiresAt: "2026-03-12T00:00:00.000Z",
      createdAt: "2026-03-11T00:00:00.000Z",
      category: "Crypto",
      volume: 0,
      clobTokenIds: ["yes", "no"],
      outcomes: [
        { id: "yes", tokenId: "yes", title: "YES", probability: 0.5, price: 0.5, sortOrder: 0 },
        { id: "no", tokenId: "no", title: "NO", probability: 0.5, price: 0.5, sortOrder: 1 },
      ],
      resolvedOutcomeTitle: null,
    };

    expect(
      buildPolymarketCatalogFingerprint({
        ...base,
        volume: 0,
      })
    ).not.toBe(
      buildPolymarketCatalogFingerprint({
        ...base,
        volume: 125.42,
      })
    );
  });

  it("treats venue volume changes as catalog changes", () => {
    const base = {
      provider: "limitless" as const,
      providerMarketId: "lm-1",
      providerConditionId: "cond-1",
      marketAddress: "0x1111111111111111111111111111111111111111",
      slug: "test-market",
      title: "Test market",
      description: null,
      imageUrl: null,
      sourceUrl: null,
      state: "open" as const,
      closesAt: "2026-03-12T00:00:00.000Z",
      expiresAt: "2026-03-12T00:00:00.000Z",
      createdAt: "2026-03-11T00:00:00.000Z",
      category: "Crypto",
      volume: 0,
      resolvedOutcomeTitle: null,
      outcomes: [
        {
          id: "yes",
          providerOutcomeId: "yes",
          providerTokenId: "yes-token",
          title: "YES",
          probability: 0.5,
          price: 0.5,
          sortOrder: 0,
          isActive: true,
        },
        {
          id: "no",
          providerOutcomeId: "no",
          providerTokenId: "no-token",
          title: "NO",
          probability: 0.5,
          price: 0.5,
          sortOrder: 1,
          isActive: true,
        },
      ],
      capabilities: {
        supportsTrading: true,
        supportsCandles: true,
        supportsPublicTrades: true,
        chainId: 8453,
      },
      providerPayload: null,
    };

    expect(
      buildVenueCatalogFingerprint({
        ...base,
        volume: 0,
      })
    ).not.toBe(
      buildVenueCatalogFingerprint({
        ...base,
        volume: 361.87,
      })
    );
  });
});
