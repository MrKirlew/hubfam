import { Outbox, MemoryKV, type Envelope } from "../index";

function env(id: string): Envelope {
  return { v: 1, id, household: "h1", from: "d1", ts: 1, kind: "message", payload: { body: "hi" } };
}

describe("Outbox", () => {
  it("enqueues idempotently by envelope id", async () => {
    const box = new Outbox(new MemoryKV());
    await box.enqueue(env("a"));
    await box.enqueue(env("a"));
    await box.enqueue(env("b"));
    expect(box.size()).toBe(2);
  });

  it("flush removes items the sender accepts", async () => {
    const box = new Outbox(new MemoryKV());
    await box.enqueue(env("a"));
    await box.enqueue(env("b"));
    const sent: string[] = [];
    const count = await box.flush(async (e) => {
      sent.push(e.id);
    });
    expect(count).toBe(2);
    expect(sent).toEqual(["a", "b"]);
    expect(box.size()).toBe(0);
  });

  it("stops on first failure and keeps ordering", async () => {
    const box = new Outbox(new MemoryKV());
    await box.enqueue(env("a"));
    await box.enqueue(env("b"));
    let fail = true;
    const first = await box.flush(async () => {
      if (fail) throw new Error("offline");
    });
    expect(first).toBe(0);
    expect(box.size()).toBe(2); // nothing sent
    fail = false;
    const second = await box.flush(async () => {});
    expect(second).toBe(2);
    expect(box.size()).toBe(0);
  });

  it("persists across instances via the shared KV", async () => {
    const kv = new MemoryKV();
    const box = new Outbox(kv, "familyhub_outbox");
    await box.enqueue(env("a"));

    const reloaded = new Outbox(kv, "familyhub_outbox");
    await reloaded.load();
    expect(reloaded.size()).toBe(1);
    expect(reloaded.peekAll()[0].env.id).toBe("a");
  });
});
