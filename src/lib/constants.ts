export const API_VERSION_V1 = "v1" as const;

export const VENUE_PROVIDERS = ["polymarket", "limitless"] as const;
export const VENUE_PROVIDER_FILTERS = ["all", ...VENUE_PROVIDERS] as const;

export const MARKET_STATES = ["open", "closed", "resolved", "cancelled"] as const;
export const MARKET_TYPES = ["binary", "multi_choice"] as const;
export const MARKET_BINARY_OUTCOMES = ["YES", "NO"] as const;
export const MARKET_TRADE_ACTIONS = ["buy", "sell"] as const;
export const MARKET_ACTIVITY_SIDES = ["BUY", "SELL", "UNKNOWN"] as const;
export const MARKET_CANDLE_INTERVALS = ["1m", "1h"] as const;
export const MARKET_ORDER_TYPES = ["FOK", "GTC"] as const;

export const USER_EVENT_TYPES = [
  "view",
  "dwell",
  "click",
  "bookmark",
  "comment",
  "trade_intent",
] as const;

export const USERNAME_AVAILABILITY_REASONS = [
  "INVALID_FORMAT",
  "RESERVED",
  "TAKEN",
  "CHECK_FAILED",
  "UNCHANGED",
] as const;

export const LEADERBOARD_SORT_FIELDS = ["pnl", "bets"] as const;

export const DEFAULT_FEED_LIMIT = 16;
export const MAX_FEED_LIMIT = 30;

export const MAX_MARKET_LIST_PAGE = 1000;
export const MAX_MARKET_LIST_PAGE_SIZE = 200;
export const DEFAULT_MARKET_LIST_PAGE_SIZE = 50;
export const MAX_MARKET_LIST_CANDIDATE_LIMIT = 8_000;
export const MAX_MARKET_LIVE_HYDRATION_LIMIT = 400;
export const MAX_MARKET_SIMILAR_LIMIT = 30;
export const DEFAULT_MARKET_SIMILAR_LIMIT = 10;
export const MAX_MARKET_SEARCH_LIMIT = 30;
export const DEFAULT_MARKET_SEARCH_LIMIT = 15;
export const MAX_PRICE_CANDLE_LIMIT = 20_000;
export const MAX_MARKET_ACTIVITY_LIMIT = 200;
export const DEFAULT_MARKET_ACTIVITY_LIMIT = 80;
export const DEFAULT_PUBLIC_TRADES_LIMIT = 50;
export const MAX_MARKET_COMMENT_LIMIT = 200;
export const DEFAULT_MARKET_COMMENT_LIMIT = 100;
export const MAX_MY_COMMENTS_LIMIT = 500;

export const MAX_USER_ACTIVITY_LIMIT = 500;
export const MAX_LEADERBOARD_LIMIT = 500;
export const DEFAULT_LEADERBOARD_LIMIT = 100;

export const MIN_SESSION_ID_LENGTH = 8;
export const MAX_SESSION_ID_LENGTH = 128;
export const MIN_MARKET_REF_LENGTH = 1;
export const MAX_MARKET_REF_LENGTH = 256;
export const MAX_METADATA_BYTES = 1024;

export const MIN_USERNAME_LENGTH = 1;
export const MAX_USERNAME_LENGTH = 64;
export const MIN_PROFILE_USERNAME_LENGTH = 3;
export const MAX_PROFILE_USERNAME_LENGTH = 32;
export const MIN_DISPLAY_NAME_LENGTH = 2;
export const MAX_DISPLAY_NAME_LENGTH = 32;
export const MAX_EMAIL_LENGTH = 254;
export const MAX_PROFILE_DESCRIPTION_LENGTH = 280;

export const MAX_RELAY_MARKET_SLUG_LENGTH = 256;
export const MIN_RELAY_IDEMPOTENCY_KEY_LENGTH = 8;
export const MAX_RELAY_IDEMPOTENCY_KEY_LENGTH = 128;
export const MAX_CLIENT_ORDER_ID_LENGTH = 128;
export const MAX_API_KEY_LENGTH = 512;
export const MAX_API_SECRET_LENGTH = 1024;
export const MAX_API_PASSPHRASE_LENGTH = 1024;
export const MAX_LIMITLESS_OWNER_ID = 2_147_483_647;

export const EVENT_RATE_LIMIT_PER_MINUTE = 90;
export const EVENT_RATE_LIMIT_WINDOW_SECONDS = 60;

export const HISTORY_NAVIGATION_THROTTLE_MS = 250;
export const CATALOG_VISIBLE_MARKETS_REALTIME_LIMIT = 200;
export const CATALOG_REALTIME_FLUSH_MS = 250;
export const SELECTED_MARKET_REALTIME_FLUSH_MS = 120;
export const SELECTED_MARKET_FALLBACK_POLL_MS = 10_000;
