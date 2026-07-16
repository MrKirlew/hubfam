import type { SharedList, SharedListItem, ListOp } from "../models/list";

/**
 * Op-log reconciliation with last-writer-wins at item-field granularity.
 * Every op carries a `ts` (LWW clock) and `opId` (idempotency). Applying the
 * same op twice, or an op older than the current item state, is a no-op — so
 * hub + all phones converge regardless of arrival order or lane.
 *
 * Note: list *name* uses arrival-order (rename applies, updatedAt = max). Item
 * collaboration — the frequent, conflict-prone path — is the LWW-guarded one.
 */

function replaceAt(lists: SharedList[], idx: number, next: SharedList): SharedList[] {
  const out = lists.slice();
  out[idx] = next;
  return out;
}

function bumped(list: SharedList, ts: number): Pick<SharedList, "rev" | "updatedAt"> {
  return { rev: list.rev + 1, updatedAt: Math.max(list.updatedAt, ts) };
}

function updateItem(
  lists: SharedList[],
  idx: number,
  list: SharedList,
  itemId: string,
  ts: number,
  fn: (it: SharedListItem) => SharedListItem,
): SharedList[] {
  const iIdx = list.items.findIndex((i) => i.id === itemId);
  if (iIdx < 0) return lists;
  const item = list.items[iIdx];
  if (ts < item.updatedAt) return lists; // stale write loses
  const items = list.items.slice();
  items[iIdx] = { ...fn(item), updatedAt: ts };
  return replaceAt(lists, idx, { ...list, items, ...bumped(list, ts) });
}

export function applyOp(lists: SharedList[], op: ListOp): SharedList[] {
  const idx = lists.findIndex((l) => l.id === op.listId);
  const list = idx >= 0 ? lists[idx] : undefined;

  switch (op.k) {
    case "create-list": {
      if (list) return lists; // idempotent
      return [...lists, { id: op.listId, name: op.name, color: op.color, items: [], rev: 1, updatedAt: op.ts }];
    }
    case "rename-list": {
      if (!list) return lists;
      return replaceAt(lists, idx, { ...list, name: op.name, ...bumped(list, op.ts) });
    }
    case "add-item": {
      if (!list) {
        // Auto-create the container so an add isn't lost if create-list is late.
        return [...lists, { id: op.listId, name: "List", items: [op.item], rev: 1, updatedAt: op.ts }];
      }
      if (list.items.some((i) => i.id === op.item.id)) return lists; // idempotent
      return replaceAt(lists, idx, { ...list, items: [...list.items, op.item], ...bumped(list, op.ts) });
    }
    case "toggle-item":
      return list ? updateItem(lists, idx, list, op.itemId, op.ts, (it) => ({ ...it, done: op.done })) : lists;
    case "edit-item":
      return list ? updateItem(lists, idx, list, op.itemId, op.ts, (it) => ({ ...it, text: op.text })) : lists;
    case "delete-item":
      return list ? updateItem(lists, idx, list, op.itemId, op.ts, (it) => ({ ...it, deleted: true })) : lists;
    case "delete-list":
      return lists.filter((l) => l.id !== op.listId);
    default:
      return lists;
  }
}

export function applyOps(lists: SharedList[], ops: ListOp[]): SharedList[] {
  return ops.reduce((acc, op) => applyOp(acc, op), lists);
}

/** Visible (non-tombstoned) items of a list, for rendering. */
export function visibleItems(list: SharedList): SharedListItem[] {
  return list.items.filter((i) => !i.deleted);
}
