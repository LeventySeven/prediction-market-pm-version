import { describe, expect, it } from "bun:test";
import { __readServiceTestUtils } from "../../src/server/markets/readService";

const { mapCanonicalRows, normalizeCandlesForChart } = __readServiceTestUtils;

describe("market read service", () => {
  it("keeps total volume as the canonical card volume when rolling 24h is higher", () => {
    const rows = mapCanonicalRows(
      [
        {
          id: "market-ref-1",
          provider: "polymarket",
          provider_market_id: "pm-1",
          provider_condition_id: null,
          slug: "pm-1",
          title: "Will it rain?",
          description: null,
          state: "open",
          category: "weather",
          source_url: null,
          image_url: null,
          market_created_at: "2026-03-01T00:00:00.000Z",
          closes_at: "2026-03-15T00:00:00.000Z",
          expires_at: "2026-03-16T00:00:00.000Z",
          market_type: "binary",
          resolved_outcome_title: null,
          total_volume_usd: 620,
          provider_payload: { volume: 10 },
          source_updated_at: "2026-03-10T10:00:00.000Z",
          last_synced_at: "2026-03-10T10:00:00.000Z",
        } as any,
      ],
      new Map([
        [
          "market-ref-1",
          [
            {
              market_id: "market-ref-1",
              provider_outcome_id: "pm-1-yes",
              provider_token_id: "yes-token",
              outcome_key: "yes",
              title: "YES",
              sort_order: 0,
              probability: 0.56,
              price: 0.56,
              is_active: true,
            },
            {
              market_id: "market-ref-1",
              provider_outcome_id: "pm-1-no",
              provider_token_id: "no-token",
              outcome_key: "no",
              title: "NO",
              sort_order: 1,
              probability: 0.44,
              price: 0.44,
              is_active: true,
            },
          ] as any,
        ],
      ]),
      new Map([
        [
          "market-ref-1",
          {
            market_id: "market-ref-1",
            best_bid: 0.55,
            best_ask: 0.57,
            mid: 0.56,
            last_trade_price: 0.56,
            last_trade_size: 24,
            rolling_24h_volume: 910,
            open_interest: 1500,
            source_ts: "2026-03-10T10:00:00.000Z",
          },
        ],
      ])
    );

    expect(rows[0]?.volume).toBe(620);
    expect(rows[0]?.totalVolumeUsd).toBe(620);
    expect(rows[0]?.rolling24hVolume).toBe(910);
  });

  it("falls back to provider lifetime volume payloads before treating volume as zero", () => {
    const rows = mapCanonicalRows(
      [
        {
          id: "market-ref-2",
          provider: "limitless",
          provider_market_id: "lt-1",
          provider_condition_id: null,
          slug: "lt-1",
          title: "Will BTC close above 100k?",
          description: null,
          state: "open",
          category: "crypto",
          source_url: null,
          image_url: null,
          market_created_at: "2026-03-01T00:00:00.000Z",
          closes_at: "2026-03-15T00:00:00.000Z",
          expires_at: "2026-03-16T00:00:00.000Z",
          market_type: "binary",
          resolved_outcome_title: null,
          total_volume_usd: null,
          provider_payload: {
            stats: {
              analytics: {
                allTimeVolumeUsd: 777,
              },
            },
          },
          source_updated_at: "2026-03-10T10:00:00.000Z",
          last_synced_at: "2026-03-10T10:00:00.000Z",
        } as any,
      ],
      new Map([
        [
          "market-ref-2",
          [
            {
              market_id: "market-ref-2",
              provider_outcome_id: "lt-1-yes",
              provider_token_id: "yes-token",
              outcome_key: "yes",
              title: "YES",
              sort_order: 0,
              probability: 0.61,
              price: 0.61,
              is_active: true,
            },
            {
              market_id: "market-ref-2",
              provider_outcome_id: "lt-1-no",
              provider_token_id: "no-token",
              outcome_key: "no",
              title: "NO",
              sort_order: 1,
              probability: 0.39,
              price: 0.39,
              is_active: true,
            },
          ] as any,
        ],
      ]),
      new Map([
        [
          "market-ref-2",
          {
            market_id: "market-ref-2",
            best_bid: 0.6,
            best_ask: 0.62,
            mid: 0.61,
            last_trade_price: 0.61,
            last_trade_size: 14,
            rolling_24h_volume: 1900,
            open_interest: 800,
            source_ts: "2026-03-10T10:00:00.000Z",
          },
        ],
      ])
    );

    expect(rows[0]?.volume).toBe(777);
    expect(rows[0]?.totalVolumeUsd).toBe(777);
    expect(rows[0]?.rolling24hVolume).toBe(1900);
  });

  it("downsamples yearly charts to a stable server-sized payload", () => {
    const candles = Array.from({ length: 900 }, (_, index) => ({
      bucket: new Date(Date.parse("2025-01-01T00:00:00.000Z") + index * 60 * 60 * 1000).toISOString(),
      outcomeId: null,
      outcomeTitle: null,
      outcomeColor: null,
      open: 0.4,
      high: 0.45,
      low: 0.35,
      close: 0.41,
      volume: index,
      tradesCount: 1,
    }));

    const normalized = normalizeCandlesForChart(candles as any, {
      limit: 365,
      interval: "1h",
      range: "Y",
    });

    expect(normalized).toHaveLength(365);
    expect(normalized[0]?.bucket).toBe(candles[0]?.bucket);
    expect(normalized.at(-1)?.bucket).toBe(candles.at(-1)?.bucket);
  });
});
