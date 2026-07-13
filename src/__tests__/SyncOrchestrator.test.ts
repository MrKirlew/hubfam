/**
 * SyncOrchestrator.test.ts — Tests for sync flow and race condition handling
 */

import { useAppStore } from "../store/appStore";
import type { CalendarEvent } from "../store/appStore";

// Mock the services that SyncOrchestrator depends on
jest.mock("../services/CalendarSyncService", () => ({
  syncAllFeeds: jest.fn().mockResolvedValue({ events: [], failedFeedIds: [] }),
  loadCachedEvents: jest.fn().mockResolvedValue([]),
  saveCachedEvents: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../services/GoogleTasksService", () => ({
  syncTasksForAllAccounts: jest.fn().mockResolvedValue(undefined),
  pushTaskChange: jest.fn(),
}));

jest.mock("../services/ErrorRecoveryService", () => ({
  onSyncFailure: jest.fn(),
  markResolved: jest.fn(),
  recordFailure: jest.fn(),
}));

import { performSync, loadCachedEventsOnStartup } from "../services/SyncOrchestrator";
import { syncAllFeeds } from "../services/CalendarSyncService";

const mockSyncAllFeeds = syncAllFeeds as jest.MockedFunction<typeof syncAllFeeds>;

const manualEvent: CalendarEvent = {
  id: "manual-1", title: "Manual Event", date: "2026-04-14", time: "10:00",
  allDay: false, memberId: null, calendarId: "manual",
  reminder: "15", source: "manual", externalId: null,
};

const syncedEvent: CalendarEvent = {
  id: "synced-1", title: "Synced Meeting", date: "2026-04-14", time: "14:00",
  allDay: false, memberId: null, calendarId: "feed-1",
  reminder: "30", source: "gcal", externalId: "gcal-123",
};

beforeEach(() => {
  useAppStore.setState({
    events: [],
    feeds: [],
    isSyncing: false,
    lastSyncTime: null,
    pendingTaskMutations: [],
  });
  jest.clearAllMocks();
});

describe("performSync", () => {
  it("preserves manual events after sync", async () => {
    useAppStore.setState({ events: [manualEvent] });
    mockSyncAllFeeds.mockResolvedValueOnce({ events: [syncedEvent], failedFeedIds: [] });

    await performSync();

    const events = useAppStore.getState().events;
    expect(events).toHaveLength(2);
    expect(events.find(e => e.id === "manual-1")).toBeDefined();
    expect(events.find(e => e.id === "synced-1")).toBeDefined();
  });

  it("replaces old synced events with new ones", async () => {
    const oldSynced: CalendarEvent = { ...syncedEvent, title: "Old Title" };
    useAppStore.setState({ events: [oldSynced] });

    const newSynced: CalendarEvent = { ...syncedEvent, title: "New Title" };
    mockSyncAllFeeds.mockResolvedValueOnce({ events: [newSynced], failedFeedIds: [] });

    await performSync();

    const events = useAppStore.getState().events;
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("New Title");
  });

  it("preserves prior events for a feed that FAILED to sync (no wipe)", async () => {
    // feed-1's events already in the store from a prior good sync.
    const existing: CalendarEvent = { ...syncedEvent, title: "Existing" };
    useAppStore.setState({ events: [existing] });

    // This round: feed-1 fails (auth/network) → no fresh events, feed-1 marked failed.
    mockSyncAllFeeds.mockResolvedValueOnce({ events: [], failedFeedIds: ["feed-1"] });

    await performSync();

    const events = useAppStore.getState().events;
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe("synced-1");
    expect(events[0].title).toBe("Existing");
  });

  it("clears events for a feed that succeeded with zero events", async () => {
    // feed-1 previously had an event, but the calendar is now genuinely empty
    // and the fetch SUCCEEDED (feed not in failedFeedIds) → event should clear.
    useAppStore.setState({ events: [syncedEvent] });
    mockSyncAllFeeds.mockResolvedValueOnce({ events: [], failedFeedIds: [] });

    await performSync();

    expect(useAppStore.getState().events).toHaveLength(0);
  });

  it("skips sync if already syncing", async () => {
    useAppStore.setState({ isSyncing: true });

    await performSync();

    expect(mockSyncAllFeeds).not.toHaveBeenCalled();
  });

  it("sets isSyncing flag during sync", async () => {
    let wasSyncing = false;
    mockSyncAllFeeds.mockImplementation(async () => {
      wasSyncing = useAppStore.getState().isSyncing;
      return { events: [syncedEvent], failedFeedIds: [] };
    });

    await performSync();

    expect(wasSyncing).toBe(true);
    expect(useAppStore.getState().isSyncing).toBe(false);
  });

  it("updates lastSyncTime on success", async () => {
    mockSyncAllFeeds.mockResolvedValueOnce({ events: [], failedFeedIds: [] });

    await performSync();

    expect(useAppStore.getState().lastSyncTime).toBeDefined();
    expect(useAppStore.getState().lastSyncTime).toBeGreaterThan(0);
  });

  it("handles sync failure gracefully", async () => {
    mockSyncAllFeeds.mockRejectedValueOnce(new Error("Network error"));

    await performSync();

    expect(useAppStore.getState().isSyncing).toBe(false);
  });

  it("preserves manual events created during sync", async () => {
    useAppStore.setState({ events: [manualEvent] });

    // Simulate a manual event being added mid-sync
    mockSyncAllFeeds.mockImplementation(async () => {
      const midSyncEvent: CalendarEvent = {
        id: "manual-2", title: "Added During Sync", date: "2026-04-15", time: "09:00",
        allDay: false, memberId: null, calendarId: "manual",
        reminder: "10", source: "manual", externalId: null,
      };
      useAppStore.getState().addEvent(midSyncEvent);
      return { events: [syncedEvent], failedFeedIds: [] };
    });

    await performSync();

    const events = useAppStore.getState().events;
    const manualEvents = events.filter(e => e.source === "manual");
    expect(manualEvents).toHaveLength(2);
    expect(manualEvents.find(e => e.id === "manual-1")).toBeDefined();
    expect(manualEvents.find(e => e.id === "manual-2")).toBeDefined();
  });
});

describe("loadCachedEventsOnStartup", () => {
  it("loads cached events preserving manual events", async () => {
    useAppStore.setState({ events: [manualEvent] });

    const { loadCachedEvents } = require("../services/CalendarSyncService");
    (loadCachedEvents as jest.Mock).mockResolvedValueOnce([syncedEvent]);

    await loadCachedEventsOnStartup();

    const events = useAppStore.getState().events;
    expect(events).toHaveLength(2);
    expect(events.find(e => e.source === "manual")).toBeDefined();
    expect(events.find(e => e.source === "gcal")).toBeDefined();
  });

  it("handles empty cache gracefully", async () => {
    const { loadCachedEvents } = require("../services/CalendarSyncService");
    (loadCachedEvents as jest.Mock).mockResolvedValueOnce([]);

    await loadCachedEventsOnStartup();

    expect(useAppStore.getState().events).toHaveLength(0);
  });
});
