import { describe, expect, it } from "bun:test";
import { resolveRolling24hVolumeFromWsPayload } from "@/src/server/venues/limitlessCollectorUtils";

describe("limitless collector rolling 24h volume resolution", () => {
  it("keeps previous rolling volume when ws payload omits volume fields", () => {
    const next = resolveRolling24hVolumeFromWsPayload(
      {
        mid: 0.57,
        last_trade_price: 0.57,
        last_trade_size: 10,
      },
      1280
    );
    expect(next).toBe(1280);
  });

  it("accepts explicit zero volume when payload contains it", () => {
    const next = resolveRolling24hVolumeFromWsPayload(
      {
        rolling_24h_volume: 0,
      },
      1280
    );
    expect(next).toBe(0);
  });

  it("falls back to zero when neither payload nor previous value has volume", () => {
    const next = resolveRolling24hVolumeFromWsPayload({}, null);
    expect(next).toBe(0);
  });
});
