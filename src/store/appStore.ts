/**
 * store/appStore.ts
 *
 * Zustand store with Immer for all global state.
 * Persisted to AsyncStorage so state survives app restarts.
 */

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { persist, createJSONStorage } from "zustand/middleware";
import { migrateIfNeeded } from "../services/PinService";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AuthProvider = "google" | "apple";

export interface LinkedAccount {
  provider:     AuthProvider;
  email:        string;        // Google email or Apple ID email
  displayName?: string;        // "Mom's Google" or "Dad's Apple ID"
  linkedAt:     number;        // unix ms
}

export interface Member {
  id:       string;
  name:     string;
  initials: string;
  color:    string;
  role:     "adult" | "child"; // member type for access control
  isAdmin:  boolean;     // admins can manage members, settings, feeds, reminders
  linkedAccounts?: LinkedAccount[]; // Google/Apple accounts linked to this member
}

export interface CalendarFeed {
  id:         string;
  name:       string;
  type:       "gcal" | "ical" | "apple" | "manual";
  memberId:   string | null;
  color:      string;
  account:           string | null;
  googleCalendarId?: string;        // specific Google calendar ID
  appleCalendarId?:  string;        // iOS system calendar ID for iCloud calendars
  enabled:    boolean;
  lastSynced: number | null;
}

export interface CalendarEvent {
  id:         string;
  title:      string;
  date:       string;
  time:       string;
  endTime?:   string;
  allDay:     boolean;
  memberId:   string | null;
  calendarId: string;
  reminder:   string;
  location?:  string;
  notes?:     string;
  source:     "gcal" | "ical" | "apple" | "native" | "manual";
  externalId: string | null;
  // Recurrence stored locally only. SyncHelper does not yet translate to RRULE
  // for Google Calendar — recurring events sync as single events. See TECH_DEBT.
  recurrence?:         TaskRecurrence;
  recurrenceDays?:     number[];   // 0=Sun..6=Sat (used for weekly w/ specific days)
  recurrenceInterval?: number;     // "every N weeks/months"
}

export interface TodoList {
  id:                string;
  name:              string;
  icon:              string;
  color:             string;
  memberId:          string | null;
  items:             TodoItem[];
  googleTaskListId?: string;        // Google Tasks list ID for two-way sync
  googleAccount?:    string;        // Google account email this list syncs with
  syncEnabled?:      boolean;       // whether Google Tasks sync is active
  lastSynced?:       number;        // unix ms of last sync
}

export type TaskRecurrence = "none" | "daily" | "weekly" | "weekends" | "monthly";

export interface TodoItem {
  id:            string;
  text:          string;
  done:          boolean;
  assignedTo?:   string;
  googleTaskId?: string;            // Google Tasks item ID for two-way sync
  dueDate?:      string;            // "YYYY-MM-DD"
  dueTime?:      string;            // "HH:MM" — due by this time
  notes?:        string;
  lastModified?: number;            // unix ms
  recurrence?:      TaskRecurrence; // recurring schedule
  recurrenceInterval?: number;      // for "every N days" custom interval
}

export interface PendingTaskMutation {
  id:        string;
  type:      "create" | "update" | "delete";
  listId:    string;
  itemId?:   string;
  payload?:  Record<string, any>;
  createdAt: number;
}

// ── Alarm schedule types ─────────────────────────────────────────────────────

export type AlarmType = "interval" | "specific-time" | "random-window";
export type AlarmRecurrence = "once" | "daily" | "weekly" | "monthly" | "yearly";

export interface AlarmSchedule {
  id:           string;
  enabled:      boolean;
  label:        string;
  message?:     string;        // custom popup message when alarm fires
  soundName?:   string;        // "chime" | "bell" | "alert" | "none"
  type:         AlarmType;
  recurrence:   AlarmRecurrence;
  intervalHours?: number;      // for "interval": every X hours
  specificTime?:  string;      // for "specific-time": "HH:MM"
  windowStart?:   string;      // for "random-window": "HH:MM"
  windowEnd?:     string;      // for "random-window": "HH:MM"
  daysOfWeek?:    number[];    // for "weekly": 0=Sun..6=Sat
  dayOfMonth?:    number;      // for "monthly": 1-31
  month?:         number;      // for "yearly": 0-11
  day?:           number;      // for "yearly": 1-31
  lastTriggered?: number;      // unix ms
}

// ── Cleaning tracker types ────────────────────────────────────────────────────

export interface CleaningEntry {
  timestamp:  number;        // unix ms
  memberName: string;        // who cleaned
  notes:      string;        // what specifically was done
}

export interface CleaningItem {
  id:            string;
  name:          string;       // "Kitchen", "Bathroom", etc.
  icon:          string;       // emoji
  frequencyDays: number;       // how often it should be cleaned (7 = weekly)
  lastCleaned?:  number;       // unix ms
  cleanedBy?:    string;       // member name who last cleaned
  lastNotes?:    string;       // what was done last time
  log:           CleaningEntry[]; // history of cleanings
}

// ── Weather types ────────────────────────────────────────────────────────────

export interface WeatherLocation {
  latitude:  number;
  longitude: number;
  name:      string;    // city name or "Current Location"
  isAuto:    boolean;   // true = use device GPS
}

// ── Dashboard layout types ───────────────────────────────────────────────────

export type LayoutPreset = "1-panel" | "2-panel" | "3-panel" | "4-panel" | "2-row" | "6-panel" | "sidebar";

export type WidgetType =
  | "calendar-today"
  | "calendar-tomorrow"
  | "calendar-date"
  | "todo-list"
  | "daily-tasks"
  | "weekly-tasks"
  | "calendar-list"
  | "cleaning"
  | "month-calendar"
  | "timer"
  | "clock";

export interface WidgetConfig {
  id:        string;
  type:      WidgetType;
  listId?:   string;     // for "todo-list" — which TodoList to show
  date?:     string;     // for "calendar-date" — YYYY-MM-DD
  memberId?: string;     // optional member filter
}

export interface DashboardLayout {
  preset:  LayoutPreset;
  widgets: WidgetConfig[];
}

interface AppState {
  // Hydration tracking (not persisted)
  _hasHydrated:  boolean;

  // Auth
  isLocked:      boolean;
  activeProfile: string;   // "all" or memberId

  // Settings
  hubName:             string;
  notificationsEnabled: boolean;
  dndEnabled:          boolean;
  batteryAlertPercent: number;     // 0 = disabled, 10-50 typical
  screenBrightness:    number;     // 0.1 to 1.0
  hubPin:              string | null;  // 4-digit PIN to lock the dashboard
  keepAwakeEnabled:    boolean;        // always-on display mode (drains battery)
  showClockBar:        boolean;        // persistent time/date in toolbar
  syncToGoogle:        boolean;        // push local changes back to Google
  themeName:           "dark" | "ocean"; // color theme
  lockShowContent:     boolean;        // when locked, still show dashboard content (view-only)
  lockMuteAlarms:      boolean;        // when locked, silence alarms and reminders
  pendingChildAdmin:   { childId: string; approvedBy: string[] } | null; // child pending admin approval
  weatherLocation:     WeatherLocation | null;
  showWidgetDates:     boolean;        // show date next to Today/Tomorrow widget headers
  rolloverIncomplete:  boolean;        // roll uncompleted tasks to next day at midnight
  smartInputEnabled:   boolean;        // QuickAddBar: parse natural-language input & clarify missing fields
  exactAlarmPromptShown: boolean;      // Android 14+: have we shown the SCHEDULE_EXACT_ALARM explainer once? See DEBT-041.

  // Sync state
  isSyncing:     boolean;
  lastSyncTime:  number | null;

  // Data
  members:         Member[];
  feeds:           CalendarFeed[];
  events:          CalendarEvent[];
  lists:           TodoList[];
  dashboardLayout: DashboardLayout;
  alarms:          AlarmSchedule[];
  cleaningItems:   CleaningItem[];

  // Actions
  lock:               () => void;
  unlock:             (profile: string) => void;
  setActiveProfile:   (id: string) => void;
  setHubName:         (name: string) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setSyncing:             (val: boolean) => void;
  setLastSyncTime:        (ts: number) => void;
  setDndEnabled:          (enabled: boolean) => void;
  setBatteryAlertPercent: (pct: number) => void;
  setScreenBrightness:    (val: number) => void;
  setHubPin:              (pin: string | null) => void;
  setKeepAwakeEnabled:    (enabled: boolean) => void;
  setShowClockBar:        (val: boolean) => void;
  setSyncToGoogle:        (val: boolean) => void;
  setThemeName:           (name: "dark" | "ocean") => void;
  setLockShowContent:     (val: boolean) => void;
  setLockMuteAlarms:      (val: boolean) => void;
  setPendingChildAdmin:   (val: { childId: string; approvedBy: string[] } | null) => void;
  setWeatherLocation:     (loc: WeatherLocation | null) => void;
  setShowWidgetDates:     (val: boolean) => void;
  setRolloverIncomplete:  (val: boolean) => void;
  setSmartInputEnabled:   (val: boolean) => void;
  setExactAlarmPromptShown: (val: boolean) => void;

  addMember:          (m: Member) => void;
  updateMember:       (id: string, patch: Partial<Member>) => void;
  removeMember:       (id: string) => void;
  linkAccount:        (memberId: string, account: LinkedAccount) => void;
  unlinkAccount:      (memberId: string, provider: AuthProvider, email: string) => void;

  addFeed:            (f: CalendarFeed) => void;
  updateFeed:         (id: string, patch: Partial<CalendarFeed>) => void;
  removeFeed:         (id: string) => void;
  toggleFeed:         (id: string) => void;
  toggleAllFeeds:     (ids: string[], enabled: boolean) => void;

  setEvents:          (events: CalendarEvent[]) => void;
  addEvent:           (e: CalendarEvent) => void;
  removeEvent:        (id: string) => void;
  updateEvent:        (id: string, patch: Partial<CalendarEvent>) => void;

  addList:            (l: TodoList) => void;
  removeList:         (id: string) => void;
  updateList:         (id: string, patch: Partial<TodoList>) => void;
  toggleTodoItem:     (listId: string, itemId: string) => void;
  addTodoItem:        (listId: string, text: string) => void;
  removeTodoItem:     (listId: string, itemId: string) => void;
  updateTodoItem:     (listId: string, itemId: string, patch: Partial<TodoItem>) => void;

  setDashboardLayout:   (layout: DashboardLayout) => void;
  addCleaningItem:      (item: CleaningItem) => void;
  updateCleaningItem:   (id: string, patch: Partial<CleaningItem>) => void;
  removeCleaningItem:   (id: string) => void;
  markCleaned:          (id: string, memberName: string, notes?: string) => void;

  addAlarm:             (a: AlarmSchedule) => void;
  updateAlarm:          (id: string, patch: Partial<AlarmSchedule>) => void;
  removeAlarm:          (id: string) => void;
  updateWidget:         (index: number, widget: WidgetConfig) => void;

  pendingTaskMutations: PendingTaskMutation[];
  addPendingMutation:   (m: PendingTaskMutation) => void;
  clearPendingMutation: (id: string) => void;
}

// ── Seed data ─────────────────────────────────────────────────────────────────

const SEED_MEMBERS: Member[] = [];

const SEED_FEEDS: CalendarFeed[] = [];

const SEED_EVENTS: CalendarEvent[] = [];

const SEED_LISTS: TodoList[] = [];

// ── Store ─────────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>()(
  persist(
    immer((set) => ({
      _hasHydrated:  false,
      isLocked:      false,
      activeProfile: "all",
      hubName:              "Family Hub",
      notificationsEnabled: true,
      dndEnabled:          false,
      batteryAlertPercent: 0,
      screenBrightness:    1.0,
      hubPin:              null,
      keepAwakeEnabled:    false,
      showClockBar:        true,
      syncToGoogle:        true,
      themeName:           "dark" as const,
      lockShowContent:     true,
      lockMuteAlarms:      false,
      pendingChildAdmin:   null,
      weatherLocation:     { latitude: 0, longitude: 0, name: "", isAuto: true },
      showWidgetDates:     true,
      rolloverIncomplete:  true,
      smartInputEnabled:   true,
      exactAlarmPromptShown: false,
      isSyncing:           false,
      lastSyncTime:        null,
      members:         SEED_MEMBERS,
      feeds:           SEED_FEEDS,
      events:          SEED_EVENTS,
      lists:           SEED_LISTS,
      alarms:          [],
      cleaningItems:   [
        { id: "c1",  name: "Kitchen",         icon: "\uD83C\uDF73", frequencyDays: 1,  log: [] },
        { id: "c2",  name: "Bathroom",        icon: "\uD83D\uDEC1", frequencyDays: 3,  log: [] },
        { id: "c3",  name: "Living Room",     icon: "\uD83D\uDECB", frequencyDays: 7,  log: [] },
        { id: "c4",  name: "Master Bedroom",  icon: "\uD83D\uDECF", frequencyDays: 7,  log: [] },
        { id: "c5",  name: "Laundry - Colors", icon: "\uD83E\uDDFA", frequencyDays: 3,  log: [] },
        { id: "c5b", name: "Laundry - Whites", icon: "\uD83E\uDDFA", frequencyDays: 7,  log: [] },
        { id: "c5c", name: "Laundry - Darks",  icon: "\uD83E\uDDFA", frequencyDays: 7,  log: [] },
        { id: "c6",  name: "Dishwasher",      icon: "\uD83E\uDEBD", frequencyDays: 2,  log: [] },
        { id: "c7",  name: "Stove",           icon: "\uD83D\uDD25", frequencyDays: 3,  log: [] },
        { id: "c8",  name: "Car",             icon: "\uD83D\uDE97", frequencyDays: 14, log: [] },
        { id: "c9",  name: "Fridge",          icon: "\u2744\uFE0F", frequencyDays: 14, log: [] },
        { id: "c10", name: "Vacuum",          icon: "\uD83E\uDDF9", frequencyDays: 3,  log: [] },
        { id: "c11", name: "Trash Bins",      icon: "\uD83D\uDDD1", frequencyDays: 7,  log: [] },
        { id: "c12", name: "Windows",         icon: "\uD83E\uDE9F", frequencyDays: 30, log: [] },
        { id: "c13", name: "Game Room",       icon: "\uD83C\uDFAE", frequencyDays: 7,  log: [] },
        { id: "c14", name: "Foyer",           icon: "\uD83D\uDEAA", frequencyDays: 7,  log: [] },
        { id: "c15", name: "Front Lawn",      icon: "\uD83C\uDF3F", frequencyDays: 7,  log: [] },
        { id: "c16", name: "Back Lawn",       icon: "\uD83C\uDF33", frequencyDays: 7,  log: [] },
        { id: "c17", name: "Side Lawn",       icon: "\uD83C\uDF3E", frequencyDays: 14, log: [] },
      ],
      dashboardLayout: {
        preset: "2-panel",
        widgets: [
          { id: "w0", type: "calendar-today" },
          { id: "w1", type: "todo-list" },
        ],
      },

      lock:             () => set(s => { s.isLocked = true; s.activeProfile = "all"; }),
      unlock:           (profile) => set(s => { s.isLocked = false; s.activeProfile = profile; }),
      setActiveProfile: (id) => set(s => { s.activeProfile = id; }),
      setHubName:       (name) => set(s => { s.hubName = name; }),
      setNotificationsEnabled: (enabled) => set(s => { s.notificationsEnabled = enabled; }),
      setDndEnabled:          (enabled) => set(s => { s.dndEnabled = enabled; }),
      setBatteryAlertPercent: (pct) => set(s => { s.batteryAlertPercent = pct; }),
      setScreenBrightness:    (val) => set(s => { s.screenBrightness = val; }),
      setHubPin:              (pin) => set(s => { s.hubPin = pin; }),
      setKeepAwakeEnabled:    (enabled) => set(s => { s.keepAwakeEnabled = enabled; }),
      setShowClockBar:        (val) => set(s => { s.showClockBar = val; }),
      setSyncToGoogle:        (val) => set(s => { s.syncToGoogle = val; }),
      setThemeName:           (name) => set(s => { s.themeName = name; }),
      setLockShowContent:     (val) => set(s => { s.lockShowContent = val; }),
      setLockMuteAlarms:      (val) => set(s => { s.lockMuteAlarms = val; }),
      setPendingChildAdmin:   (val) => set(s => { s.pendingChildAdmin = val; }),
      setWeatherLocation:     (loc) => set(s => { s.weatherLocation = loc; }),
      setShowWidgetDates:     (val) => set(s => { s.showWidgetDates = val; }),
      setRolloverIncomplete:  (val) => set(s => { s.rolloverIncomplete = val; }),
      setSmartInputEnabled:   (val) => set(s => { s.smartInputEnabled = val; }),
      setExactAlarmPromptShown: (val) => set(s => { s.exactAlarmPromptShown = val; }),
      setSyncing:             (val) => set(s => { s.isSyncing = val; }),
      setLastSyncTime:        (ts) => set(s => { s.lastSyncTime = ts; }),

      addMember:    (m) => set(s => { s.members.push(m); }),
      updateMember: (id, patch) => set(s => {
        const i = s.members.findIndex(m => m.id === id);
        if (i !== -1) Object.assign(s.members[i], patch);
      }),
      removeMember: (id) => set(s => { s.members = s.members.filter(m => m.id !== id); }),
      linkAccount: (memberId, account) => set(s => {
        const member = s.members.find(m => m.id === memberId);
        if (member) {
          if (!member.linkedAccounts) member.linkedAccounts = [];
          const exists = member.linkedAccounts.find(
            a => a.provider === account.provider && a.email === account.email
          );
          if (!exists) member.linkedAccounts.push(account);
        }
      }),
      unlinkAccount: (memberId, provider, email) => set(s => {
        const member = s.members.find(m => m.id === memberId);
        if (member?.linkedAccounts) {
          member.linkedAccounts = member.linkedAccounts.filter(
            a => !(a.provider === provider && a.email === email)
          );
        }
      }),

      addFeed:    (f) => set(s => { s.feeds.push(f); }),
      updateFeed: (id, patch) => set(s => {
        const i = s.feeds.findIndex(f => f.id === id);
        if (i !== -1) Object.assign(s.feeds[i], patch);
      }),
      removeFeed:     (id) => set(s => { s.feeds = s.feeds.filter(f => f.id !== id); }),
      toggleFeed:     (id) => set(s => { const f = s.feeds.find(f => f.id === id); if (f) f.enabled = !f.enabled; }),
      toggleAllFeeds: (ids, enabled) => set(s => { s.feeds.forEach(f => { if (ids.includes(f.id)) f.enabled = enabled; }); }),

      setEvents:    (events) => set(s => { s.events = events; }),
      addEvent:     (e) => set(s => { s.events.push(e); }),
      removeEvent:  (id) => set(s => { s.events = s.events.filter(e => e.id !== id); }),
      updateEvent:  (id, patch) => set(s => {
        const ev = s.events.find(e => e.id === id);
        if (ev) Object.assign(ev, patch);
      }),

      addList:      (l) => set(s => { s.lists.push(l); }),
      removeList:   (id) => set(s => { s.lists = s.lists.filter(l => l.id !== id); }),
      updateList:   (id, patch) => set(s => {
        const i = s.lists.findIndex(l => l.id === id);
        if (i !== -1) Object.assign(s.lists[i], patch);
      }),
      toggleTodoItem: (listId, itemId) => set(s => {
        const list = s.lists.find(l => l.id === listId);
        const item = list?.items.find(i => i.id === itemId);
        if (item) item.done = !item.done;
      }),
      addTodoItem: (listId, text) => set(s => {
        const list = s.lists.find(l => l.id === listId);
        list?.items.push({ id: Date.now().toString(), text, done: false });
      }),
      removeTodoItem: (listId, itemId) => set(s => {
        const list = s.lists.find(l => l.id === listId);
        if (list) list.items = list.items.filter(i => i.id !== itemId);
      }),
      updateTodoItem: (listId, itemId, patch) => set(s => {
        const list = s.lists.find(l => l.id === listId);
        const item = list?.items.find(i => i.id === itemId);
        if (item) Object.assign(item, patch);
      }),

      setDashboardLayout: (layout) => set(s => { s.dashboardLayout = layout; }),
      updateWidget: (index, widget) => set(s => {
        if (index >= 0 && index < s.dashboardLayout.widgets.length) {
          s.dashboardLayout.widgets[index] = widget;
        }
      }),

      addCleaningItem: (item) => set(s => { s.cleaningItems.push(item); }),
      updateCleaningItem: (id, patch) => set(s => {
        const i = s.cleaningItems.findIndex(c => c.id === id);
        if (i !== -1) Object.assign(s.cleaningItems[i], patch);
      }),
      removeCleaningItem: (id) => set(s => { s.cleaningItems = s.cleaningItems.filter(c => c.id !== id); }),
      markCleaned: (id, memberName, notes) => set(s => {
        const item = s.cleaningItems.find(c => c.id === id);
        if (item) {
          const now = Date.now();
          item.lastCleaned = now;
          item.cleanedBy = memberName;
          item.lastNotes = notes || "";
          if (!item.log) item.log = [];
          item.log.unshift({ timestamp: now, memberName, notes: notes || "" });
          if (item.log.length > 20) item.log = item.log.slice(0, 20); // keep last 20
        }
      }),

      addAlarm: (a) => set(s => { s.alarms.push(a); }),
      updateAlarm: (id, patch) => set(s => {
        const i = s.alarms.findIndex(a => a.id === id);
        if (i !== -1) Object.assign(s.alarms[i], patch);
      }),
      removeAlarm: (id) => set(s => { s.alarms = s.alarms.filter(a => a.id !== id); }),

      pendingTaskMutations: [],
      addPendingMutation: (m) => set(s => { s.pendingTaskMutations.push(m); }),
      clearPendingMutation: (id) => set(s => {
        s.pendingTaskMutations = s.pendingTaskMutations.filter(m => m.id !== id);
      }),
    })),
    {
      name:    "family-hub-store",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => {
        const { _hasHydrated, ...rest } = state;
        return { ...rest, isLocked: false, isSyncing: false }; // always start unlocked + sync unlocked
      },
      onRehydrateStorage: () => {
        return (state) => {
          useAppStore.setState({ _hasHydrated: true });
          // Migrate existing members: add role/isAdmin/linkedAccounts defaults if missing
          if (state?.members) {
            const needsMigration = state.members.some((m: any) => !m.role || !m.linkedAccounts);
            if (needsMigration) {
              const updated = state.members.map((m: any) => ({
                ...m,
                role: m.role || "adult",
                isAdmin: m.isAdmin ?? (state.members.indexOf(m) === 0),
                linkedAccounts: m.linkedAccounts || [],
              }));
              useAppStore.setState({ members: updated });
            }
          }
          // Migrate plaintext PIN to SecureStore. If SecureStore is unavailable
          // (locked keychain, missing entitlement, transient device error),
          // leave hubPin untouched so the legacy unlock fallback in
          // DashboardScreen + PinService.verifyHubPin keeps the user able to
          // unlock with their existing PIN. We never log the raw PIN value or
          // the raw error object — only a fixed string — to avoid leaking the
          // PIN through stack traces that some libraries echo back.
          if (state?.hubPin && state.hubPin !== "SECURE") {
            migrateIfNeeded(state.hubPin)
              .then(() => {
                useAppStore.setState({ hubPin: "SECURE" });
              })
              .catch(() => {
                console.warn(
                  "[Store] SecureStore PIN migration failed — legacy unlock fallback active."
                );
              });
          }
          // Prune old events: keep only last 6 months to prevent unbounded growth
          if (state?.events) {
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            const cutoff = sixMonthsAgo.toISOString().substring(0, 10);
            const pruned = state.events.filter((e: any) => !e.date || e.date >= cutoff);
            if (pruned.length < state.events.length) {
              console.log(`[Store] Pruned ${state.events.length - pruned.length} old events (before ${cutoff})`);
              useAppStore.setState({ events: pruned });
            }
          }
          // Cap pending task mutations to prevent queue buildup
          if (state?.pendingTaskMutations && state.pendingTaskMutations.length > 100) {
            const trimmed = state.pendingTaskMutations.slice(-100);
            console.log(`[Store] Trimmed pending mutations from ${state.pendingTaskMutations.length} to 100`);
            useAppStore.setState({ pendingTaskMutations: trimmed });
          }
          // Cap list items per list to 500
          if (state?.lists) {
            let capped = false;
            const cappedLists = state.lists.map((l: any) => {
              if (l.items && l.items.length > 500) {
                capped = true;
                return { ...l, items: l.items.slice(0, 500) };
              }
              return l;
            });
            if (capped) {
              console.log("[Store] Capped list items to 500 per list");
              useAppStore.setState({ lists: cappedLists });
            }
          }
          // Migrate cleaning items: add new defaults that don't exist yet
          if (state?.cleaningItems) {
            const existingIds = new Set(state.cleaningItems.map((c: any) => c.id));
            const defaults = [
              { id: "c6",  name: "Dishwasher", icon: "\uD83E\uDEBD", frequencyDays: 2,  log: [] },
              { id: "c7",  name: "Stove",      icon: "\uD83D\uDD25", frequencyDays: 3,  log: [] },
              { id: "c8",  name: "Car",        icon: "\uD83D\uDE97", frequencyDays: 14, log: [] },
              { id: "c9",  name: "Fridge",     icon: "\u2744\uFE0F", frequencyDays: 14, log: [] },
              { id: "c10", name: "Vacuum",     icon: "\uD83E\uDDF9", frequencyDays: 3,  log: [] },
              { id: "c11", name: "Trash Bins", icon: "\uD83D\uDDD1", frequencyDays: 7,  log: [] },
              { id: "c12", name: "Windows",    icon: "\uD83E\uDE9F", frequencyDays: 30, log: [] },
            ];
            const toAdd = defaults.filter(d => !existingIds.has(d.id));
            if (toAdd.length > 0) {
              const store = useAppStore.getState();
              for (const item of toAdd) store.addCleaningItem(item);
            }
          }
        };
      },
    }
  )
);
