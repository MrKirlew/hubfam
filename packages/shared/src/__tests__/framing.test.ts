import { encodeFrames, FrameReassembler } from "../index";

function randomPayload(len: number): Uint8Array {
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = (i * 101 + 7) & 0xff;
  return out;
}

describe("BLE framing", () => {
  it("round-trips in order", () => {
    const payload = randomPayload(1000);
    const frames = encodeFrames(1, payload, 180);
    const r = new FrameReassembler();
    let result: Uint8Array | null = null;
    for (const f of frames) result = r.push(f) ?? result;
    expect(result).not.toBeNull();
    expect(Array.from(result!)).toEqual(Array.from(payload));
  });

  it("round-trips when frames arrive out of order", () => {
    const payload = randomPayload(777);
    const frames = encodeFrames(42, payload, 64);
    const shuffled = [...frames].reverse();
    const r = new FrameReassembler();
    let result: Uint8Array | null = null;
    for (const f of shuffled) result = r.push(f) ?? result;
    expect(result).not.toBeNull();
    expect(Array.from(result!)).toEqual(Array.from(payload));
  });

  it("handles a payload smaller than one frame", () => {
    const payload = randomPayload(3);
    const frames = encodeFrames(5, payload, 180);
    expect(frames.length).toBe(1);
    const r = new FrameReassembler();
    expect(Array.from(r.push(frames[0])!)).toEqual(Array.from(payload));
  });

  it("reassembles two interleaved messages independently", () => {
    const a = randomPayload(200);
    const b = randomPayload(140);
    const fa = encodeFrames(1, a, 32);
    const fb = encodeFrames(2, b, 32);
    const r = new FrameReassembler();
    let ra: Uint8Array | null = null;
    let rb: Uint8Array | null = null;
    const maxLen = Math.max(fa.length, fb.length);
    for (let i = 0; i < maxLen; i++) {
      if (fa[i]) ra = r.push(fa[i]) ?? ra;
      if (fb[i]) rb = r.push(fb[i]) ?? rb;
    }
    expect(Array.from(ra!)).toEqual(Array.from(a));
    expect(Array.from(rb!)).toEqual(Array.from(b));
  });

  it("ignores duplicate frames", () => {
    const payload = randomPayload(100);
    const frames = encodeFrames(9, payload, 40);
    const r = new FrameReassembler();
    let result: Uint8Array | null = null;
    for (const f of frames) {
      result = r.push(f) ?? result; // first delivery
      result = r.push(f) ?? result; // duplicate delivery
    }
    expect(result).not.toBeNull();
    expect(Array.from(result!)).toEqual(Array.from(payload));
  });
});
