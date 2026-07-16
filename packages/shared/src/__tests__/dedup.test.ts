import { Dedup } from "../index";

describe("Dedup", () => {
  it("reports first sight vs repeat", () => {
    const d = new Dedup();
    expect(d.seenBefore("a")).toBe(false);
    expect(d.seenBefore("a")).toBe(true);
    expect(d.has("a")).toBe(true);
    expect(d.has("b")).toBe(false);
  });

  it("evicts oldest beyond max (LRU)", () => {
    const d = new Dedup(2);
    d.seenBefore("a");
    d.seenBefore("b");
    d.seenBefore("c"); // evicts "a"
    expect(d.has("a")).toBe(false);
    expect(d.has("b")).toBe(true);
    expect(d.has("c")).toBe(true);
    expect(d.seenBefore("a")).toBe(false); // seen as new again
  });

  it("hydrates from a snapshot", () => {
    const d = new Dedup();
    d.seenBefore("x");
    d.seenBefore("y");
    const d2 = new Dedup();
    d2.hydrate(d.snapshot());
    expect(d2.has("x")).toBe(true);
    expect(d2.has("y")).toBe(true);
  });
});
