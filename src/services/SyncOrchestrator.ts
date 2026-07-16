/**
 * SyncOrchestrator.ts
 *
 * Coordinates calendar sync between CalendarSyncService and the Zustand store.
 * Preserves manual events while replacing synced events with fresh data.
 * Uses timestamp-based sync lock to prevent race conditions.
 */

import { useAppStore } from "../store/appStore";
import { syncAllFeeds, loadCachedEvents, saveCachedEvents } from "./CalendarSyncService";
import { syncTasksForAllAccounts } from "./GoogleTasksService";
import { onSyncFailure, markResolved } from "./ErrorRecoveryService";
export { pushTaskChange } from "./GoogleTasksService";

// Sync lock: tracks when current sync started to detect stale operations
let syncStartedAt: number | null = null;

/** Sync window: 30 days back, 90 days forward */
function getSyncRange(): [Date, Date] {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - 30);

  const to = new Date();
  to.setHours(23, 59, 59, 999);
  to.setDate(to.getDate() + 90);

  return [from, to];
}

/**
 * Perform a full sync of all enabled feeds.
 * Merges results into the store, preserving manual events.
 * Race-safe: captures manual events before AND after sync to prevent data loss.
 */
export async function performSync(): Promise<void> {
  const store = useAppStore.getState();
  if (store.isSyncing) {
    console.log("[Sync] Skipped — already syncing");
    return;
  }

  const thisSync = Date.now();
  syncStartedAt = thisSync;

  console.log("[Sync] Starting full sync...");
  store.setSyncing(true);
  try {
    // Snapshot manual events BEFORE sync starts
    const preManualEvents = store.events.filter(e => e.source === "manual");

    const [from, to] = getSyncRange();
    console.log("[Sync] Syncing calendar feeds...");
    const { events: syncedEvents, failedFeedIds } = await syncAllFeeds(store.feeds, from, to);
    console.log(`[Sync] Calendar: ${syncedEvents.length} events synced, ${failedFeedIds.length} feed(s) failed`);

    // Check if another sync has superseded this one
    if (syncStartedAt !== thisSync) {
      console.log("[Sync] Superseded by newer sync — discarding results");
      return;
    }

    // Snapshot the store AFTER sync — this holds manual events added during the
    // sync AND the prior synced events we may need to preserve for failed feeds.
    const currentEvents = useAppStore.getState().events;
    const postManualEvents = currentEvents.filter(e => e.source === "manual");

    // Merge: keep all unique manual events from both snapshots
    const manualMap = new Map<string, typeof preManualEvents[0]>();
    for (const e of preManualEvents) manualMap.set(e.id, e);
    for (const e of postManualEvents) manualMap.set(e.id, e);
    const allManualEvents = Array.from(manualMap.values());

    // Preserve previously-synced events for any feed that FAILED to fetch this
    // round (e.g. a transient token/network error), so a hiccup never blanks a
    // calendar off the hub. Feeds that succeeded with 0 events are NOT in
    // failedFeedIds, so genuinely-empty calendars still clear correctly.
    const preservedFromFailed = failedFeedIds.length
      ? currentEvents.filter(e => e.source !== "manual" && failedFeedIds.includes(e.calendarId))
      : [];
    if (preservedFromFailed.length) {
      console.log(`[Sync] Preserved ${preservedFromFailed.length} event(s) from ${failedFeedIds.length} failed feed(s)`);
    }

    const syncedAndPreserved = [...syncedEvents, ...preservedFromFailed];
    store.setEvents([...allManualEvents, ...syncedAndPreserved]);
    // Cache only the non-manual set for instant display on next startup.
    await saveCachedEvents(syncedAndPreserved);

    // Sync Google Tasks for all connected accounts
    console.log("[Sync] Syncing Google Tasks...");
    await syncTasksForAllAccounts();
    console.log("[Sync] Tasks sync complete");

    store.setLastSyncTime(Date.now());
    markResolved("sync:calendar");
    console.log("[Sync] Full sync complete");
  } catch (err) {
    console.log("[Sync] FAILED:", err);
    onSyncFailure(err as Error);
  } finally {
    if (syncStartedAt === thisSync) {
      syncStartedAt = null;
    }
    store.setSyncing(false);
  }
}

/**
 * Load cached events on startup for instant display before sync completes.
 */
export async function loadCachedEventsOnStartup(): Promise<void> {
  try {
    const cached = await loadCachedEvents();
    if (cached.length > 0) {
      const store = useAppStore.getState();
      const manualEvents = store.events.filter(e => e.source === "manual");
      store.setEvents([...manualEvents, ...cached]);
    }
  } catch (err) {
    console.log("Failed to load cached events:", err);
  }
}
