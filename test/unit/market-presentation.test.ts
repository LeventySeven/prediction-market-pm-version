import { describe, expect, it } from "bun:test";
import {
  computeEffectiveVolumeRaw,
  pickBinaryOutcomes,
  pickYesLikeOutcome,
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
});
