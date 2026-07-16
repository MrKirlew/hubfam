import { applyOp, applyOps, visibleItems, type SharedList, type ListOp, type SharedListItem } from "../index";

function item(id: string, text: string, ts: number): SharedListItem {
  return { id, text, done: false, updatedAt: ts };
}

describe("SharedList reconcile", () => {
  it("creates a list idempotently", () => {
    let lists: SharedList[] = [];
    const op: ListOp = { k: "create-list", opId: "o1", listId: "L1", ts: 1, deviceId: "d1", name: "Groceries" };
    lists = applyOp(lists, op);
    expect(lists.length).toBe(1);
    lists = applyOp(lists, op); // replay
    expect(lists.length).toBe(1);
    expect(lists[0].name).toBe("Groceries");
  });

  it("adds items idempotently", () => {
    let lists = applyOp([], { k: "create-list", opId: "o1", listId: "L1", ts: 1, deviceId: "d1", name: "L" });
    const add: ListOp = { k: "add-item", opId: "o2", listId: "L1", ts: 2, deviceId: "d1", item: item("i1", "milk", 2) };
    lists = applyOp(lists, add);
    const revAfterAdd = lists[0].rev;
    lists = applyOp(lists, add); // duplicate
    expect(lists[0].items.length).toBe(1);
    expect(lists[0].rev).toBe(revAfterAdd); // no bump on idempotent replay
  });

  it("applies last-writer-wins on concurrent toggles", () => {
    let lists = applyOps([], [
      { k: "create-list", opId: "o1", listId: "L1", ts: 1, deviceId: "d1", name: "L" },
      { k: "add-item", opId: "o2", listId: "L1", ts: 2, deviceId: "d1", item: item("i1", "milk", 2) },
    ]);
    lists = applyOp(lists, { k: "toggle-item", opId: "o3", listId: "L1", ts: 5, deviceId: "dA", itemId: "i1", done: true });
    expect(lists[0].items[0].done).toBe(true);

    // stale write (older ts) is ignored
    lists = applyOp(lists, { k: "toggle-item", opId: "o4", listId: "L1", ts: 3, deviceId: "dB", itemId: "i1", done: false });
    expect(lists[0].items[0].done).toBe(true);

    // newer write wins
    lists = applyOp(lists, { k: "toggle-item", opId: "o5", listId: "L1", ts: 7, deviceId: "dB", itemId: "i1", done: false });
    expect(lists[0].items[0].done).toBe(false);
  });

  it("edits item text with LWW", () => {
    let lists = applyOps([], [
      { k: "create-list", opId: "o1", listId: "L1", ts: 1, deviceId: "d1", name: "L" },
      { k: "add-item", opId: "o2", listId: "L1", ts: 2, deviceId: "d1", item: item("i1", "milk", 2) },
      { k: "edit-item", opId: "o3", listId: "L1", ts: 4, deviceId: "d2", itemId: "i1", text: "oat milk" },
    ]);
    expect(lists[0].items[0].text).toBe("oat milk");
  });

  it("tombstones deletes so they converge", () => {
    let lists = applyOps([], [
      { k: "create-list", opId: "o1", listId: "L1", ts: 1, deviceId: "d1", name: "L" },
      { k: "add-item", opId: "o2", listId: "L1", ts: 2, deviceId: "d1", item: item("i1", "milk", 2) },
      { k: "delete-item", opId: "o3", listId: "L1", ts: 3, deviceId: "d2", itemId: "i1" },
    ]);
    expect(lists[0].items[0].deleted).toBe(true);
    expect(visibleItems(lists[0])).toHaveLength(0);
  });

  it("auto-creates a container if add-item arrives before create-list", () => {
    const lists = applyOp([], { k: "add-item", opId: "o1", listId: "L9", ts: 1, deviceId: "d1", item: item("i1", "x", 1) });
    expect(lists.length).toBe(1);
    expect(lists[0].items[0].id).toBe("i1");
  });

  it("converges to the newest value for concurrent edits (LWW), regardless of arrival order", () => {
    const base = applyOps([], [
      { k: "create-list", opId: "o1", listId: "L1", ts: 1, deviceId: "d1", name: "L" },
      { k: "add-item", opId: "o2", listId: "L1", ts: 2, deviceId: "d1", item: item("i1", "milk", 2) },
    ]);
    const editA: ListOp = { k: "edit-item", opId: "oA", listId: "L1", ts: 10, deviceId: "dA", itemId: "i1", text: "A" };
    const editB: ListOp = { k: "edit-item", opId: "oB", listId: "L1", ts: 20, deviceId: "dB", itemId: "i1", text: "B" };
    // Whichever order the two concurrent edits arrive, the higher-ts value wins.
    const ab = applyOps(base, [editA, editB]);
    const ba = applyOps(base, [editB, editA]);
    expect(ab[0].items[0].text).toBe("B");
    expect(ba[0].items[0].text).toBe("B");
  });
});
