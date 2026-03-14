import { describe, expect, it } from "bun:test";
import {
  getExternalMarketUrl,
  normalizeExternalMarketUrl,
} from "@/src/lib/marketExternalUrl";

describe("market external url normalization", () => {
  it("maps limitless market paths to the limitless venue", () => {
    expect(normalizeExternalMarketUrl("market/will-eth-hit-10k", "limitless")).toBe(
      "https://limitless.exchange/market/will-eth-hit-10k"
    );
    expect(normalizeExternalMarketUrl("event/will-eth-hit-10k", "limitless")).toBe(
      "https://limitless.exchange/market/will-eth-hit-10k"
    );
  });

  it("maps polymarket paths to event links", () => {
    expect(normalizeExternalMarketUrl("event/us-election", "polymarket")).toBe(
      "https://polymarket.com/event/us-election"
    );
    expect(normalizeExternalMarketUrl("market/us-election", "polymarket")).toBe(
      "https://polymarket.com/event/us-election"
    );
    expect(normalizeExternalMarketUrl("/en/event/us-election", "polymarket")).toBe(
      "https://polymarket.com/event/us-election"
    );
    expect(normalizeExternalMarketUrl("https://polymarket.com/en/event/us-election?tid=abc", "polymarket")).toBe(
      "https://polymarket.com/en/event/us-election?tid=abc"
    );
  });

  it("forces limitless destination when source host is not limitless", () => {
    const url = getExternalMarketUrl({
      id: "limitless:abc123",
      provider: "limitless",
      providerMarketId: "abc123",
      source: "https://polymarket.com/event/some-market",
    } as any);
    expect(url).toBe("https://limitless.exchange/market/some-market");
  });

  it("falls back to canonical provider urls when source is missing", () => {
    const pm = getExternalMarketUrl({
      id: "polymarket:btc-halving",
      provider: "polymarket",
      providerMarketId: "btc-halving",
      source: null,
    } as any);
    const lm = getExternalMarketUrl({
      id: "limitless:eth-6k",
      provider: "limitless",
      providerMarketId: "eth-6k",
      source: null,
    } as any);
    expect(pm).toBe("https://polymarket.com/event/btc-halving");
    expect(lm).toBe("https://limitless.exchange/market/eth-6k");
  });

  it("prefers canonical slugs over brittle provider ids when rebuilding venue links", () => {
    const pm = getExternalMarketUrl({
      id: "polymarket:0xabc123",
      slug: "fed-march-rate-cut",
      provider: "polymarket",
      providerMarketId: "0xabc123",
      source: null,
    } as any);
    const lm = getExternalMarketUrl({
      id: "limitless:99123",
      slug: "will-solana-hit-500",
      provider: "limitless",
      providerMarketId: "99123",
      source: null,
    } as any);

    expect(pm).toBe("https://polymarket.com/event/fed-march-rate-cut");
    expect(lm).toBe("https://limitless.exchange/market/will-solana-hit-500");
  });
});
