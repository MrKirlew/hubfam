/**
 * Integration check: the hub app's own toolchain (root tsconfig + jest) can
 * resolve, typecheck, and run @familyhub/shared through the workspace symlink.
 */
import {
  makeEnvelope,
  applyOp,
  Dedup,
  TransportRouter,
  Outbox,
  MemoryKV,
  newId,
  type ListOp,
  type SharedList,
} from "@familyhub/shared";

describe("hub ↔ @familyhub/shared integration", () => {
  it("resolves the shared package and builds an envelope", () => {
    const env = makeEnvelope(
      { household: "h1", from: "hub", kind: "message", payload: { body: "hi" } },
      newId(),
      123,
    );
    expect(env.v).toBe(1);
    expect(env.household).toBe("h1");
    expect(typeof env.id).toBe("string");
  });

  it("applies a shared list op through reconcile", () => {
    const op: ListOp = { k: "create-list", opId: "o1", listId: "L1", ts: 1, deviceId: "d1", name: "Groceries" };
    const lists: SharedList[] = applyOp([], op);
    expect(lists[0].name).toBe("Groceries");
  });

  it("constructs a TransportRouter that reports offline with no lanes", () => {
    const router = new TransportRouter({ outbox: new Outbox(new MemoryKV()), dedup: new Dedup() });
    expect(router.getState().effective).toBe("offline");
  });
});
