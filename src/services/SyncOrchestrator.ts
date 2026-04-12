/**
 * SyncOrchestrator.ts
 *
 * Coordinates calendar sync between CalendarSyncService and the Zustand store.
 * Preserves manual events while replacing synced events with fresh data.
 */

import { useAppStore } from "../store/appStore";
import { syncAllFeeds, loadCachedEvents } from "./CalendarSyncService";
import { syncTasksForAllAccounts } from "./GoogleTasksService";
export { pushTaskChange } from "./GoogleTasksService";

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
 */
export async function performSync(): Promise<void> {
  const store = useAppStore.getState();
  if (store.isSyncing) {
    console.log("[Sync] Skipped — already syncing");
    return;
  }

  console.log("[Sync] Starting full sync...");
  store.setSyncing(true);
  try {
    const [from, to] = getSyncRange();
    console.log("[Sync] Syncing calendar feeds...");
    const syncedEvents = await syncAllFeeds(store.feeds, from, to);
    console.log(`[Sync] Calendar: ${syncedEvents.length} events synced`);

    // Keep manual events, replace everything else with fresh synced data
    const manualEvents = store.events.filter(e => e.source === "manual");
    store.setEvents([...manualEvents, ...syncedEvents]);

    // Sync Google Tasks for all connected accounts
    console.log("[Sync] Syncing Google Tasks...");
    await syncTasksForAllAccounts();
    console.log("[Sync] Tasks sync complete");

    store.setLastSyncTime(Date.now());
    console.log("[Sync] Full sync complete");
  } catch (err) {
    console.log("[Sync] FAILED:", err);
  } finally {
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
