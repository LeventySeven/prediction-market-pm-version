import { z } from "zod";
import type { Json } from "@/src/types/database";
import {
  API_VERSION_V1,
  LEADERBOARD_SORT_FIELDS,
  MARKET_ACTIVITY_SIDES,
  MARKET_BINARY_OUTCOMES,
  MARKET_CANDLE_INTERVALS,
  MARKET_CATALOG_BUCKETS,
  MARKET_ORDER_TYPES,
  MARKET_ORDERBOOK_SIDES,
  MARKET_RELAY_AUTH_MODES,
  MARKET_STATES,
  MARKET_STORAGE_BUCKETS,
  MARKET_TRADE_ACTIONS,
  MARKET_TYPES,
  USERNAME_AVAILABILITY_REASONS,
  USER_EVENT_TYPES,
  VENUE_PROVIDER_FILTERS,
  VENUE_PROVIDERS,
} from "../constants";

export const apiVersionV1Schema = z.literal(API_VERSION_V1);
export const venueProviderSchema = z.enum(VENUE_PROVIDERS);
export const venueProviderFilterSchema = z.enum(VENUE_PROVIDER_FILTERS);
export const marketStateSchema = z.enum(MARKET_STATES);
export const marketTypeSchema = z.enum(MARKET_TYPES);
export const marketBinaryOutcomeSchema = z.enum(MARKET_BINARY_OUTCOMES);
export const marketTradeActionSchema = z.enum(MARKET_TRADE_ACTIONS);
export const marketActivitySideSchema = z.enum(MARKET_ACTIVITY_SIDES);
export const candleIntervalSchema = z.enum(MARKET_CANDLE_INTERVALS);
export const marketOrderTypeSchema = z.enum(MARKET_ORDER_TYPES);
export const marketCatalogBucketSchema = z.enum(MARKET_CATALOG_BUCKETS);
export const marketStorageBucketSchema = z.enum(MARKET_STORAGE_BUCKETS);
export const marketRelayAuthModeSchema = z.enum(MARKET_RELAY_AUTH_MODES);
export const marketOrderbookSideSchema = z.enum(MARKET_ORDERBOOK_SIDES);
export const userEventTypeSchema = z.enum(USER_EVENT_TYPES);
export const usernameAvailabilityReasonSchema = z.enum(USERNAME_AVAILABILITY_REASONS);
export const leaderboardSortFieldSchema = z.enum(LEADERBOARD_SORT_FIELDS);

export const jsonValueSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ])
);

export type VenueProviderValue = z.infer<typeof venueProviderSchema>;
