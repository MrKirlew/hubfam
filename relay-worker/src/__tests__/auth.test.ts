import { sha256Hex, randomToken, bearer, safeEqual } from "../auth";

describe("relay auth helpers", () => {
  it("hashes deterministically to 64 hex chars", async () => {
    const h = await sha256Hex("device-token-abc");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256Hex("device-token-abc")).toBe(h);
    expect(await sha256Hex("device-token-xyz")).not.toBe(h);
  });

  it("produces unique hex tokens of the requested length", () => {
    const t = randomToken(16);
    expect(t).toMatch(/^[0-9a-f]{32}$/);
    expect(randomToken()).not.toBe(randomToken());
  });

  it("extracts a Bearer token", () => {
    const req = new Request("https://x", { headers: { Authorization: "Bearer abc.def" } });
    expect(bearer(req)).toBe("abc.def");
    expect(bearer(new Request("https://x"))).toBeNull();
  });

  it("compares safely", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "ab")).toBe(false);
  });
});
