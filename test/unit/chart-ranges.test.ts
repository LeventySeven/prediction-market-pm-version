import { describe, expect, it } from "bun:test";
import { getChartRangeRequest } from "../../src/lib/chartRanges";

describe("chart range mapping", () => {
  it("maps apple-style ranges to candle requests", () => {
    expect(getChartRangeRequest("1D")).toEqual({ interval: "1m", limit: 1440 });
    expect(getChartRangeRequest("1W")).toEqual({ interval: "1h", limit: 168 });
    expect(getChartRangeRequest("1M")).toEqual({ interval: "1h", limit: 720 });
    expect(getChartRangeRequest("6M")).toEqual({ interval: "1h", limit: 4320 });
    expect(getChartRangeRequest("Y")).toEqual({ interval: "1h", limit: 8760 });
  });
});
