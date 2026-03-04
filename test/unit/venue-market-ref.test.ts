import { describe, expect, test } from "bun:test";
import { parseVenueMarketRef } from "../../src/server/venues/types";

describe("parseVenueMarketRef", () => {
  test("strips provider prefix when explicit provider is passed", () => {
    const parsed = parseVenueMarketRef("limitless:abc123", "limitless");
    expect(parsed.provider).toBe("limitless");
    expect(parsed.providerMarketId).toBe("abc123");
    expect(parsed.canonicalMarketId).toBe("limitless:abc123");
  });

  test("keeps raw id when no prefix exists", () => {
    const parsed = parseVenueMarketRef("xyz789", "polymarket");
    expect(parsed.provider).toBe("polymarket");
    expect(parsed.providerMarketId).toBe("xyz789");
    expect(parsed.canonicalMarketId).toBe("polymarket:xyz789");
  });
});
