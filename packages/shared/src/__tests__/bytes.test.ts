import {
  b64encode,
  b64decode,
  utf8ToBytes,
  bytesToUtf8,
  concatBytes,
  timingSafeEqual,
} from "../index";

describe("bytes util", () => {
  it("round-trips base64 for arbitrary bytes", () => {
    for (let len = 0; len < 40; len++) {
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = (i * 37 + 11) & 0xff;
      const decoded = b64decode(b64encode(bytes));
      expect(Array.from(decoded)).toEqual(Array.from(bytes));
    }
  });

  it("round-trips UTF-8 including unicode and emoji", () => {
    const samples = ["", "hello", "café ☕", "家庭 🏠 Family", "surrogate 😀🎉 pair"];
    for (const s of samples) {
      expect(bytesToUtf8(utf8ToBytes(s))).toBe(s);
    }
  });

  it("concatBytes joins in order", () => {
    const out = concatBytes(new Uint8Array([1, 2]), new Uint8Array([]), new Uint8Array([3]));
    expect(Array.from(out)).toEqual([1, 2, 3]);
  });

  it("timingSafeEqual compares content and length", () => {
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
  });
});
