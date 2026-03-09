import { describe, expect, it } from "bun:test";
import {
  computeEffectiveVolumeRaw,
  formatCompactUsd,
  formatPercent,
  pickBinaryOutcomes,
  pickYesLikeOutcome,
  resolveReliableBinaryPrice,
  roundPercentValue,
} from "../../src/lib/marketPresentation";

describe("marketPresentation", () => {
  it("prefers YES and NO outcomes by title instead of raw array order", () => {
    const outcomes = [
      { id: "no", title: "NO", sortOrder: 0, probability: 0.61, price: 0.61 },
      { id: "yes", title: "YES", sortOrder: 1, probability: 0.39, price: 0.39 },
    ];

    const { yes, no } = pickBinaryOutcomes(outcomes);

    expect(yes?.id).toBe("yes");
    expect(no?.id).toBe("no");
  });

  it("falls back to sort order when no YES title exists", () => {
    const outcomes = [
      { id: "a", title: "Candidate A", sortOrder: 1 },
      { id: "b", title: "Candidate B", sortOrder: 0 },
    ];

    expect(pickYesLikeOutcome(outcomes)?.id).toBe("b");
  });

  it("uses the larger of base and rolling 24h volume for display", () => {
    expect(computeEffectiveVolumeRaw(0, 1250)).toBe(1250);
    expect(computeEffectiveVolumeRaw(540, 125)).toBe(540);
    expect(computeEffectiveVolumeRaw(null, "2500")).toBe(2500);
    expect(computeEffectiveVolumeRaw(-10, -5)).toBe(0);
  });

  it("formats compact usd values with rounded suffixes", () => {
    expect(formatCompactUsd(98_580_143.58917899)).toBe("$98.6m");
    expect(formatCompactUsd(9_800_000)).toBe("$9.8m");
    expect(formatCompactUsd(12_450)).toBe("$12.4k");
  });

  it("normalizes percent values consistently", () => {
    expect(roundPercentValue(0.041)).toBe(4);
    expect(roundPercentValue(52.49)).toBe(52);
    expect(formatPercent(0.5)).toBe("50%");
    expect(formatPercent(10.5543, 1)).toBe("10.6%");
  });

  it("prefers book or trade prices over bogus 0/100 live mid values", () => {
    expect(
      resolveReliableBinaryPrice({
        mid: 0,
        bestBid: 0.42,
        bestAsk: 0.44,
        lastTradePrice: 0.43,
        fallbackPrice: 0.5,
      })
    ).toBe(0.43);

    expect(
      resolveReliableBinaryPrice({
        mid: 1,
        bestBid: null,
        bestAsk: null,
        lastTradePrice: 0.91,
        fallbackPrice: 0.5,
      })
    ).toBe(0.91);
  });
});
