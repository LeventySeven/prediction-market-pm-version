import { describe, expect, it } from "bun:test";
import {
  isPlaceholderDisplayName,
  isPlaceholderPrivyUsername,
  isValidUsername,
  normalizeDisplayName,
  normalizeUsername,
} from "../../src/server/auth/identity";

describe("identity utils", () => {
  it("normalizes handles into stable lowercase format", () => {
    expect(normalizeUsername("  John Doe  ")).toBe("john_doe");
    expect(normalizeUsername("@@User--Name!!")).toBe("user--name");
  });

  it("validates username constraints", () => {
    expect(isValidUsername("abc")).toBe(true);
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("UPPERCASE")).toBe(true);
    expect(isValidUsername("name with spaces")).toBe(false);
  });

  it("detects privy placeholder identities", () => {
    expect(isPlaceholderPrivyUsername("privy_test_123")).toBe(true);
    expect(isPlaceholderPrivyUsername("normal_user")).toBe(false);
    expect(isPlaceholderDisplayName("privy_foo")).toBe(true);
    expect(isPlaceholderDisplayName("Alice")).toBe(false);
  });

  it("normalizes display names by trimming and collapsing spaces", () => {
    expect(normalizeDisplayName("  Alice    Bob ")).toBe("Alice Bob");
  });
});
