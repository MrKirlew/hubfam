/**
 * SyncHelper.ts
 * Unified entry point for pushing local changes back to Google.
 * All widgets call these functions after local state mutations.
 * Respects the syncToGoogle toggle in the store.
 */

import { useAppStore } from "../store/appStore";
import type { CalendarEvent } from "../store/appStore";
import { createGoogleCalendarEvent, deleteGoogleCalendarEvent } from "./CalendarSyncService";
import { pushTaskChange } from "./GoogleTasksService";

function isSyncEnabled(): boolean {
  return useAppStore.getState().syncToGoogle;
}

function getFirstGoogleAccount(): string | null {
  const feeds = useAppStore.getState().feeds;
  const gcalFeed = feeds.find(f => f.type === "gcal" && f.account);
  return gcalFeed?.account || null;
}

function getListSyncInfo(listId: string): { syncEnabled: boolean; googleAccount?: string } {
  const list = useAppStore.getState().lists.find(l => l.id === listId);
  return {
    syncEnabled: list?.syncEnabled || false,
    googleAccount: list?.googleAccount,
  };
}

/**
 * Push a new calendar event to Google Calendar.
 * Updates the local event with the returned Google ID.
 */
export async function pushCalendarCreate(event: CalendarEvent): Promise<void> {
  if (!isSyncEnabled()) return;
  const email = getFirstGoogleAccount();
  if (!email) return;

  try {
    const googleId = await createGoogleCalendarEvent(email, {
      title: event.title,
      date: event.date,
      time: event.time,
      allDay: event.allDay,
    });
    // Update local event with Google ID so future syncs recognize it
    const store = useAppStore.getState();
    const events = store.events.map(e =>
      e.id === event.id ? { ...e, externalId: googleId, source: "gcal" as const } : e
    );
    store.setEvents(events);
  } catch (err) {
    console.log("[SyncHelper] Failed to push calendar event:", err);
  }
}

/**
 * Delete a calendar event from Google Calendar.
 */
export async function pushCalendarDelete(event: CalendarEvent): Promise<void> {
  if (!isSyncEnabled()) return;
  if (!event.externalId) return; // local-only event, nothing to delete on Google
  const email = getFirstGoogleAccount();
  if (!email) return;

  try {
    await deleteGoogleCalendarEvent(email, event.externalId);
  } catch (err) {
    console.log("[SyncHelper] Failed to delete calendar event:", err);
  }
}

/**
 * Push a new task to Google Tasks.
 */
export async function pushTaskCreate(listId: string, itemId: string, text: string): Promise<void> {
  if (!isSyncEnabled()) return;
  const info = getListSyncInfo(listId);
  if (!info.syncEnabled) return;

  try {
    await pushTaskChange(listId, "create", itemId, { text });
  } catch (err) {
    console.log("[SyncHelper] Failed to push task create:", err);
  }
}

/**
 * Push a task update to Google Tasks.
 */
export async function pushTaskUpdate(listId: string, itemId: string, patch: Record<string, any>): Promise<void> {
  if (!isSyncEnabled()) return;
  const info = getListSyncInfo(listId);
  if (!info.syncEnabled) return;

  try {
    await pushTaskChange(listId, "update", itemId, patch);
  } catch (err) {
    console.log("[SyncHelper] Failed to push task update:", err);
  }
}

/**
 * Push a task deletion to Google Tasks.
 * Must include the googleTaskId so the API knows which remote task to delete.
 */
export async function pushTaskDelete(listId: string, itemId: string): Promise<void> {
  if (!isSyncEnabled()) return;
  const info = getListSyncInfo(listId);
  if (!info.syncEnabled) return;

  // Look up the item's googleTaskId before it's removed from the store
  const list = useAppStore.getState().lists.find(l => l.id === listId);
  const item = list?.items.find(i => i.id === itemId);
  const googleTaskId = item?.googleTaskId;

  try {
    await pushTaskChange(listId, "delete", itemId, { googleTaskId });
  } catch (err) {
    console.log("[SyncHelper] Failed to push task delete:", err);
  }
}

/**
 * Push a task toggle (done/undone) to Google Tasks.
 */
export async function pushTaskToggle(listId: string, itemId: string, done: boolean, text: string): Promise<void> {
  if (!isSyncEnabled()) return;
  const info = getListSyncInfo(listId);
  if (!info.syncEnabled) return;

  try {
    await pushTaskChange(listId, "update", itemId, { done, text });
  } catch (err) {
    console.log("[SyncHelper] Failed to push task toggle:", err);
  }
}
