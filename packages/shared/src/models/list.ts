export interface SharedListItem {
  id: string;
  text: string;
  done: boolean;
  assignedTo?: string | null;
  /** Epoch ms of the last field change — drives last-writer-wins reconciliation. */
  updatedAt: number;
  /** Tombstone flag; kept (not spliced) so deletes converge across devices. */
  deleted?: boolean;
}

export interface SharedList {
  id: string;
  name: string;
  color?: string;
  items: SharedListItem[];
  /** Monotonic local revision, bumped on every applied op. */
  rev: number;
  updatedAt: number;
}

/**
 * Operation log entries. Each carries `opId` (idempotency) + `ts` (LWW clock) +
 * `deviceId` (origin). Applying the same op twice is a no-op.
 */
export type ListOp =
  | { k: "create-list"; opId: string; listId: string; ts: number; deviceId: string; name: string; color?: string }
  | { k: "rename-list"; opId: string; listId: string; ts: number; deviceId: string; name: string }
  | { k: "add-item"; opId: string; listId: string; ts: number; deviceId: string; item: SharedListItem }
  | { k: "toggle-item"; opId: string; listId: string; ts: number; deviceId: string; itemId: string; done: boolean }
  | { k: "edit-item"; opId: string; listId: string; ts: number; deviceId: string; itemId: string; text: string }
  | { k: "delete-item"; opId: string; listId: string; ts: number; deviceId: string; itemId: string };

export type ListOpKind = ListOp["k"];
