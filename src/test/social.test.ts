import { describe, expect, it } from "vitest";
import { normalizeFriendCode } from "@/lib/social";

describe("friend ID validation", () => {
  it("accepts exactly six digits and preserves leading zeroes only as valid input when present", () => {
    expect(normalizeFriendCode("123456")).toBe("123456");
    expect(normalizeFriendCode("000123")).toBe("000123");
  });

  it("rejects short, long, or non-numeric IDs", () => {
    expect(normalizeFriendCode("12345")).toBeNull();
    expect(normalizeFriendCode("1234567")).toBeNull();
    expect(normalizeFriendCode("12a456")).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeFriendCode(" 123456 ")).toBe("123456");
  });
});
