import { describe, expect, it } from "bun:test";
import {
  encodeSocketIoEventPacket,
  normalizeHexAddress,
  normalizeSlug,
  parseSocketIoEventPacket,
  resolveSocketIoConnection,
} from "../../src/server/venues/limitlessSocketIo";

describe("limitless collector socket.io alignment", () => {
  it("normalizes socket.io transport URL and namespace", () => {
    const resolved = resolveSocketIoConnection("wss://ws.limitless.exchange/markets");
    expect(resolved.namespace).toBe("/markets");
    expect(resolved.transportUrl).toContain("/socket.io/");
    expect(resolved.transportUrl).toContain("EIO=4");
    expect(resolved.transportUrl).toContain("transport=websocket");
  });

  it("defaults to /markets namespace when only host is provided", () => {
    const resolved = resolveSocketIoConnection("wss://ws.limitless.exchange");
    expect(resolved.namespace).toBe("/markets");
  });

  it("encodes and parses namespace event packets", () => {
    const packet = encodeSocketIoEventPacket("/markets", "subscribe_market_prices", {
      marketSlugs: ["us-election-2028"],
      marketAddresses: ["0x1111111111111111111111111111111111111111"],
    });
    const parsed = parseSocketIoEventPacket(packet, "/markets");

    expect(parsed).not.toBeNull();
    expect(parsed?.event).toBe("subscribe_market_prices");
    expect(parsed?.payload).toEqual({
      marketSlugs: ["us-election-2028"],
      marketAddresses: ["0x1111111111111111111111111111111111111111"],
    });
  });

  it("rejects packets for a different namespace", () => {
    const packet = encodeSocketIoEventPacket("/admin", "newPriceData", { marketAddress: "0x1" });
    const parsed = parseSocketIoEventPacket(packet, "/markets");
    expect(parsed).toBeNull();
  });

  it("normalizes market identity helpers", () => {
    expect(normalizeSlug("  Will-ETH-Hit-6k " )).toBe("will-eth-hit-6k");
    expect(normalizeHexAddress("0xABCDEFabcdefABCDEFabcdefABCDEFabcdef1234")).toBe(
      "0xabcdefabcdefabcdefabcdefabcdefabcdef1234"
    );
    expect(normalizeHexAddress("not-an-address")).toBeNull();
  });
});
