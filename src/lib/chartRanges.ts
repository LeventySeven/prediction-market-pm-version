import type { CandleInterval } from "@/types";

export type MarketChartRange = "1D" | "1W" | "1M" | "6M" | "Y";

export const MARKET_CHART_RANGES: MarketChartRange[] = ["1D", "1W", "1M", "6M", "Y"];

export const getChartRangeRequest = (
  range: MarketChartRange
): { interval: CandleInterval; limit: number } => {
  switch (range) {
    case "1D":
      return { interval: "1m", limit: 1440 };
    case "1W":
      return { interval: "1h", limit: 168 };
    case "1M":
      return { interval: "1h", limit: 720 };
    case "6M":
      return { interval: "1h", limit: 4320 };
    case "Y":
    default:
      return { interval: "1h", limit: 8760 };
  }
};
