/**
 * GoogleTasksService.ts
 *
 * Two-way sync between FamilyHub local TodoLists and Google Tasks API v1.
 * Reuses token management from CalendarSyncService.
 * Server-wins conflict resolution.
 */

import { useAppStore, TodoList, TodoItem } from "../store/appStore";
import { getStoredToken, refreshTokenForAccount } from "./CalendarSyncService";

const TASKS_BASE = "https://www.googleapis.com/tasks/v1";

// ── Token helper ────────────────────────────────────────────────────────────

async function getValidToken(email: string): Promise<string> {
  // getStoredToken now uses getValidAccessToken() internally which is robust
  let token = await getStoredToken(email);
  if (!token) token = await refreshTokenForAccount(email);
  if (!token) throw new Error(`No valid token for ${email}. Re-authenticate needed.`);
  return token;
}

async function authedFetch(email: string, url: string, init?: RequestInit): Promise<Response> {
  const token = await getValidToken(email);
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  // Handle expired token — retry once after refresh
  if (res.status === 401) {
    const fresh = await refreshTokenForAccount(email);
    if (!fresh) throw new Error(`Token refresh failed for ${email}. Re-authenticate needed.`);
    return fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${fresh}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  }

  return res;
}

// ── Google Tasks API wrappers ───────────────────────────────────────────────

interface GTaskList {
  id: string;
  title: string;
  updated: string;
}

interface GTask {
  id: string;
  title: string;
  status: "needsAction" | "completed";
  due?: string;
  notes?: string;
  updated: string;
  deleted?: boolean;
}

export async function fetchTaskLists(email: string): Promise<GTaskList[]> {
  const res = await authedFetch(email, `${TASKS_BASE}/users/@me/lists`);
  if (!res.ok) throw new Error(`Failed to fetch task lists: ${res.status}`);
  const data = await res.json();
  return data.items || [];
}

export async function fetchTasks(email: string, taskListId: string): Promise<GTask[]> {
  const params = new URLSearchParams({
    showCompleted: "true",
    showHidden: "false",
    maxResults: "100",
  });
  const res = await authedFetch(email, `${TASKS_BASE}/lists/${taskListId}/tasks?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch tasks: ${res.status}`);
  const data = await res.json();
  return (data.items || []).filter((t: GTask) => !t.deleted);
}

export async function createGoogleTask(
  email: string,
  taskListId: string,
  task: { title: string; due?: string; notes?: string }
): Promise<GTask> {
  const body: Record<string, any> = { title: task.title };
  if (task.due) body.due = new Date(task.due).toISOString();
  if (task.notes) body.notes = task.notes;

  const res = await authedFetch(email, `${TASKS_BASE}/lists/${taskListId}/tasks`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to create task: ${res.status}`);
  return res.json();
}

export async function updateGoogleTask(
  email: string,
  taskListId: string,
  taskId: string,
  patch: { title?: string; status?: "needsAction" | "completed"; due?: string; notes?: string }
): Promise<GTask> {
  const body: Record<string, any> = {};
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.due !== undefined) body.due = patch.due ? new Date(patch.due).toISOString() : null;
  if (patch.notes !== undefined) body.notes = patch.notes;

  const res = await authedFetch(email, `${TASKS_BASE}/lists/${taskListId}/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to update task: ${res.status}`);
  return res.json();
}

export async function deleteGoogleTask(
  email: string,
  taskListId: string,
  taskId: string
): Promise<void> {
  const res = await authedFetch(email, `${TASKS_BASE}/lists/${taskListId}/tasks/${taskId}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 404) throw new Error(`Failed to delete task: ${res.status}`);
}

// ── Sync Algorithm (server-wins) ────────────────────────────────────────────

const DEFAULT_ICONS = ["📋", "✅", "📝", "🎯", "💼"];

export async function syncTasksForAccount(email: string): Promise<void> {
  const store = useAppStore.getState();

  // 1. Flush pending offline mutations FIRST
  // This ensures local changes are pushed to Google before we pull the server state.
  await flushPendingMutations(email);

  // 2. Fetch Google task lists
  const googleLists = await fetchTaskLists(email);

  for (const gList of googleLists) {
    // Find matching local list
    let localList = store.lists.find(
      l => l.googleTaskListId === gList.id && l.googleAccount === email
    );

    // Auto-import: create local list for new Google Task lists
    if (!localList) {
      const iconIdx = store.lists.length % DEFAULT_ICONS.length;
      const newList: TodoList = {
        id: `gtask_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: gList.title,
        icon: DEFAULT_ICONS[iconIdx],
        color: "#60a5fa",
        memberId: null,
        items: [],
        googleTaskListId: gList.id,
        googleAccount: email,
        syncEnabled: true,
        lastSynced: undefined,
      };
      store.addList(newList);
      localList = useAppStore.getState().lists.find(l => l.id === newList.id)!;
    }

    if (!localList.syncEnabled) continue;

    // Fetch Google tasks for this list
    const gTasks = await fetchTasks(email, gList.id);

    // Build lookup maps
    const localByGoogleId = new Map(
      localList.items.filter(i => i.googleTaskId).map(i => [i.googleTaskId!, i])
    );

    const mergedItems: TodoItem[] = [];

    // 1. Process Google tasks (server-wins: Google is authoritative)
    for (const gTask of gTasks) {
      const existing = localByGoogleId.get(gTask.id);
      mergedItems.push({
        id: existing?.id || `gt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        text: gTask.title || "(No title)",
        done: gTask.status === "completed",
        googleTaskId: gTask.id,
        dueDate: gTask.due ? gTask.due.substring(0, 10) : undefined,
        notes: gTask.notes,
        lastModified: new Date(gTask.updated).getTime(),
      });
    }

    // 2. Push local-only items (no googleTaskId) to Google
    // (These are items created locally while offline or just now)
    const localOnlyItems = localList.items.filter(i => !i.googleTaskId);
    for (const localItem of localOnlyItems) {
      try {
        const created = await createGoogleTask(email, gList.id, {
          title: localItem.text,
          due: localItem.dueDate,
          notes: localItem.notes,
        });
        if (localItem.done) {
          await updateGoogleTask(email, gList.id, created.id, { status: "completed" });
        }
        mergedItems.push({
          ...localItem,
          googleTaskId: created.id,
          lastModified: Date.now(),
        });
      } catch (err) {
        // Keep local item even if push fails
        mergedItems.push(localItem);
        console.log(`[GoogleTasks] Failed to push local task "${localItem.text}" to Google:`, err);
      }
    }

    // 3. Items that had a googleTaskId but no longer exist on Google → deleted remotely
    // (already excluded by not being in gTasks — server-wins)

    // Update local list with merged items
    store.updateList(localList.id, {
      items: mergedItems,
      lastSynced: Date.now(),
    });
  }
}

async function flushPendingMutations(email: string): Promise<void> {
  const store = useAppStore.getState();
  const mutations = store.pendingTaskMutations.filter(m => {
    const list = store.lists.find(l => l.id === m.listId);
    return list?.googleAccount === email;
  });

  if (mutations.length > 0) {
    console.log(`[GoogleTasks] Flushing ${mutations.length} pending mutations for ${email}`);
  }

  for (const mut of mutations) {
    const list = store.lists.find(l => l.id === mut.listId);
    if (!list?.googleTaskListId) continue;

    try {
      if (mut.type === "create" && mut.payload) {
        await createGoogleTask(email, list.googleTaskListId, {
          title: mut.payload.text,
          due: mut.payload.dueDate,
          notes: mut.payload.notes,
        });
      } else if (mut.type === "update" && mut.itemId && mut.payload) {
        const item = list.items.find(i => i.id === mut.itemId);
        if (item?.googleTaskId) {
          await updateGoogleTask(email, list.googleTaskListId, item.googleTaskId, {
            title: mut.payload.text,
            status: mut.payload.done ? "completed" : "needsAction",
          });
        }
      } else if (mut.type === "delete" && mut.payload?.googleTaskId) {
        await deleteGoogleTask(email, list.googleTaskListId, mut.payload.googleTaskId);
      }
      store.clearPendingMutation(mut.id);
    } catch (err) {
      console.log(`[GoogleTasks] Failed to flush mutation ${mut.id}:`, err);
      // Keep mutation in queue if it's a network error
    }
  }
}

/**
 * Sync Google Tasks for all connected Google accounts.
 * Called by SyncOrchestrator alongside calendar sync.
 */
export async function syncTasksForAllAccounts(): Promise<void> {
  const store = useAppStore.getState();

  // Get unique Google account emails from feeds
  const googleEmails = new Set(
    store.feeds
      .filter(f => f.type === "gcal" && f.account)
      .map(f => f.account!)
  );

  const errors: string[] = [];
  for (const email of googleEmails) {
    try {
      await syncTasksForAccount(email);
    } catch (err: any) {
      console.log(`[GoogleTasks] Sync failed for ${email}:`, err);
      errors.push(`${email}: ${err?.message || "Unknown error"}`);
    }
  }
  if (errors.length > 0 && googleEmails.size === errors.length) {
    throw new Error(`Tasks sync failed: ${errors.join("; ")}`);
  }
}

/**
 * Push a single local change to Google Tasks immediately.
 * If offline, queues the mutation for later.
 */
export async function pushTaskChange(
  listId: string,
  type: "create" | "update" | "delete",
  itemId?: string,
  payload?: Record<string, any>
): Promise<void> {
  const store = useAppStore.getState();
  const list = store.lists.find(l => l.id === listId);

  if (!list?.syncEnabled || !list.googleTaskListId || !list.googleAccount) return;

  try {
    if (type === "create" && payload) {
      const created = await createGoogleTask(list.googleAccount, list.googleTaskListId, {
        title: payload.text,
        due: payload.dueDate,
        notes: payload.notes,
      });
      if (payload.done) {
        await updateGoogleTask(list.googleAccount, list.googleTaskListId, created.id, {
          status: "completed",
        });
      }
      // Update local item with Google ID
      if (itemId) {
        store.updateTodoItem(listId, itemId, { googleTaskId: created.id });
      }
    } else if (type === "update" && itemId) {
      const item = list.items.find(i => i.id === itemId);
      if (item?.googleTaskId) {
        const patch: Record<string, any> = {
          title: payload?.text ?? item.text,
          status: (payload?.done ?? item.done) ? "completed" : "needsAction",
        };
        if (payload?.notes !== undefined) patch.notes = payload.notes;
        await updateGoogleTask(list.googleAccount, list.googleTaskListId, item.googleTaskId, patch);
      }
    } else if (type === "delete" && payload?.googleTaskId) {
      await deleteGoogleTask(list.googleAccount, list.googleTaskListId, payload.googleTaskId);
    }
  } catch {
    // Offline or failed — queue for later
    store.addPendingMutation({
      id: Date.now().toString(),
      type,
      listId,
      itemId,
      payload,
      createdAt: Date.now(),
    });
  }
}
