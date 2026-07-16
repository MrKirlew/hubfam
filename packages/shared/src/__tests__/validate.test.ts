import { isEnvelope, parseEnvelope, EnvelopeParseError, type Envelope } from "../index";

function base(): Envelope {
  return { v: 1, id: "e1", household: "h1", from: "d1", ts: 123, kind: "message", payload: { body: "hi" } };
}

describe("envelope validation", () => {
  it("accepts a well-formed envelope", () => {
    expect(isEnvelope(base())).toBe(true);
    expect(parseEnvelope(base())).toEqual(base());
  });

  it("parses from a JSON string", () => {
    const parsed = parseEnvelope(JSON.stringify(base()));
    expect(parsed.id).toBe("e1");
  });

  it("rejects missing/blank required fields", () => {
    expect(isEnvelope({ ...base(), id: "" })).toBe(false);
    expect(isEnvelope({ ...base(), household: "" })).toBe(false);
    const { from: _drop, ...noFrom } = base();
    expect(isEnvelope(noFrom)).toBe(false);
  });

  it("rejects an unknown kind", () => {
    expect(isEnvelope({ ...base(), kind: "bogus" })).toBe(false);
  });

  it("requires iv+ct when sealed", () => {
    expect(isEnvelope({ ...base(), sealed: true, payload: { iv: "x", ct: "y" } })).toBe(true);
    expect(isEnvelope({ ...base(), sealed: true, payload: { body: "plain" } })).toBe(false);
  });

  it("throws EnvelopeParseError on invalid JSON", () => {
    expect(() => parseEnvelope("{not json")).toThrow(EnvelopeParseError);
  });

  it("throws EnvelopeParseError on shape mismatch", () => {
    expect(() => parseEnvelope({ hello: "world" })).toThrow(EnvelopeParseError);
  });
});
