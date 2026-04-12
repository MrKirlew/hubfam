/**
 * appStore.test.ts — Unit tests for Zustand store mutations
 * Owner: Sage
 * Coverage: members, lists, todo items, events, cleaning, alarms
 */

import { useAppStore } from "../store/appStore";
import type { Member, TodoList, CalendarEvent, CleaningItem, AlarmSchedule } from "../store/appStore";

// Reset store before each test
beforeEach(() => {
  const { setState } = useAppStore;
  setState({
    members: [],
    feeds: [],
    events: [],
    lists: [],
    cleaningItems: [],
    alarms: [],
    pendingTaskMutations: [],
    hubPin: null,
    isLocked: false,
  });
});

// ── Member CRUD ──────────────────────────────────────────

describe("Members", () => {
  const mom: Member = {
    id: "m1", name: "Mom", initials: "M", color: "#f87171",
    role: "adult", isAdmin: true,
  };

  it("adds a member", () => {
    useAppStore.getState().addMember(mom);
    expect(useAppStore.getState().members).toHaveLength(1);
    expect(useAppStore.getState().members[0].name).toBe("Mom");
  });

  it("updates a member", () => {
    useAppStore.getState().addMember(mom);
    useAppStore.getState().updateMember("m1", { name: "Mama" });
    expect(useAppStore.getState().members[0].name).toBe("Mama");
  });

  it("removes a member", () => {
    useAppStore.getState().addMember(mom);
    useAppStore.getState().removeMember("m1");
    expect(useAppStore.getState().members).toHaveLength(0);
  });

  it("does not crash when updating non-existent member", () => {
    useAppStore.getState().updateMember("nonexistent", { name: "Ghost" });
    expect(useAppStore.getState().members).toHaveLength(0);
  });
});

// ── TodoList + TodoItem CRUD ─────────────────────────────

describe("Lists and TodoItems", () => {
  const groceryList: TodoList = {
    id: "l1", name: "Grocery", icon: "🛒", color: "#60a5fa",
    memberId: null, items: [],
  };

  it("adds a list", () => {
    useAppStore.getState().addList(groceryList);
    expect(useAppStore.getState().lists).toHaveLength(1);
    expect(useAppStore.getState().lists[0].name).toBe("Grocery");
  });

  it("removes a list", () => {
    useAppStore.getState().addList(groceryList);
    useAppStore.getState().removeList("l1");
    expect(useAppStore.getState().lists).toHaveLength(0);
  });

  it("adds a todo item to a list", () => {
    useAppStore.getState().addList(groceryList);
    useAppStore.getState().addTodoItem("l1", "Milk");
    const list = useAppStore.getState().lists[0];
    expect(list.items).toHaveLength(1);
    expect(list.items[0].text).toBe("Milk");
    expect(list.items[0].done).toBe(false);
  });

  it("toggles a todo item", () => {
    useAppStore.getState().addList(groceryList);
    useAppStore.getState().addTodoItem("l1", "Eggs");
    const itemId = useAppStore.getState().lists[0].items[0].id;
    useAppStore.getState().toggleTodoItem("l1", itemId);
    expect(useAppStore.getState().lists[0].items[0].done).toBe(true);
    useAppStore.getState().toggleTodoItem("l1", itemId);
    expect(useAppStore.getState().lists[0].items[0].done).toBe(false);
  });

  it("removes a todo item", () => {
    useAppStore.getState().addList(groceryList);
    useAppStore.getState().addTodoItem("l1", "Bread");
    const itemId = useAppStore.getState().lists[0].items[0].id;
    useAppStore.getState().removeTodoItem("l1", itemId);
    expect(useAppStore.getState().lists[0].items).toHaveLength(0);
  });

  it("updates a todo item text", () => {
    useAppStore.getState().addList(groceryList);
    useAppStore.getState().addTodoItem("l1", "Buter");
    const itemId = useAppStore.getState().lists[0].items[0].id;
    useAppStore.getState().updateTodoItem("l1", itemId, { text: "Butter" });
    expect(useAppStore.getState().lists[0].items[0].text).toBe("Butter");
  });

  it("assigns a member to a todo item", () => {
    useAppStore.getState().addList(groceryList);
    useAppStore.getState().addTodoItem("l1", "Pick up kids");
    const itemId = useAppStore.getState().lists[0].items[0].id;
    useAppStore.getState().updateTodoItem("l1", itemId, { assignedTo: "m1" });
    expect(useAppStore.getState().lists[0].items[0].assignedTo).toBe("m1");
  });
});

// ── Calendar Events ──────────────────────────────────────

describe("Events", () => {
  const event: CalendarEvent = {
    id: "e1", title: "Dentist", date: "2026-04-12", time: "09:00",
    allDay: false, memberId: null, calendarId: "manual",
    reminder: "15", source: "manual", externalId: null,
  };

  it("adds an event", () => {
    useAppStore.getState().addEvent(event);
    expect(useAppStore.getState().events).toHaveLength(1);
    expect(useAppStore.getState().events[0].title).toBe("Dentist");
  });

  it("removes an event", () => {
    useAppStore.getState().addEvent(event);
    useAppStore.getState().removeEvent("e1");
    expect(useAppStore.getState().events).toHaveLength(0);
  });

  it("replaces all events", () => {
    useAppStore.getState().addEvent(event);
    useAppStore.getState().setEvents([{ ...event, id: "e2", title: "Meeting" }]);
    expect(useAppStore.getState().events).toHaveLength(1);
    expect(useAppStore.getState().events[0].title).toBe("Meeting");
  });
});

// ── Cleaning Tracker ─────────────────────────────────────

describe("Cleaning", () => {
  const item: CleaningItem = {
    id: "c1", name: "Kitchen", icon: "🍳", frequencyDays: 1, log: [],
  };

  it("adds a cleaning item", () => {
    useAppStore.getState().addCleaningItem(item);
    expect(useAppStore.getState().cleaningItems).toHaveLength(1);
  });

  it("marks item as cleaned with notes", () => {
    useAppStore.getState().addCleaningItem(item);
    useAppStore.getState().markCleaned("c1", "Mom", "Wiped counters, mopped floor");
    const cleaned = useAppStore.getState().cleaningItems[0];
    expect(cleaned.lastCleaned).toBeDefined();
    expect(cleaned.cleanedBy).toBe("Mom");
    expect(cleaned.lastNotes).toBe("Wiped counters, mopped floor");
    expect(cleaned.log).toHaveLength(1);
    expect(cleaned.log[0].notes).toBe("Wiped counters, mopped floor");
  });

  it("keeps cleaning log history", () => {
    useAppStore.getState().addCleaningItem(item);
    useAppStore.getState().markCleaned("c1", "Mom", "First clean");
    useAppStore.getState().markCleaned("c1", "Dad", "Second clean");
    const cleaned = useAppStore.getState().cleaningItems[0];
    expect(cleaned.log).toHaveLength(2);
    expect(cleaned.log[0].memberName).toBe("Dad"); // most recent first
    expect(cleaned.log[1].memberName).toBe("Mom");
  });

  it("removes a cleaning item", () => {
    useAppStore.getState().addCleaningItem(item);
    useAppStore.getState().removeCleaningItem("c1");
    expect(useAppStore.getState().cleaningItems).toHaveLength(0);
  });
});

// ── Alarms ───────────────────────────────────────────────

describe("Alarms", () => {
  const alarm: AlarmSchedule = {
    id: "a1", enabled: true, label: "Check Hub",
    type: "interval", recurrence: "daily", intervalHours: 4,
  };

  it("adds an alarm", () => {
    useAppStore.getState().addAlarm(alarm);
    expect(useAppStore.getState().alarms).toHaveLength(1);
    expect(useAppStore.getState().alarms[0].label).toBe("Check Hub");
  });

  it("updates alarm", () => {
    useAppStore.getState().addAlarm(alarm);
    useAppStore.getState().updateAlarm("a1", { enabled: false });
    expect(useAppStore.getState().alarms[0].enabled).toBe(false);
  });

  it("removes alarm", () => {
    useAppStore.getState().addAlarm(alarm);
    useAppStore.getState().removeAlarm("a1");
    expect(useAppStore.getState().alarms).toHaveLength(0);
  });
});

// ── Lock / PIN ───────────────────────────────────────────

describe("Lock and PIN", () => {
  it("starts unlocked", () => {
    expect(useAppStore.getState().isLocked).toBe(false);
  });

  it("locks and unlocks", () => {
    useAppStore.getState().lock();
    expect(useAppStore.getState().isLocked).toBe(true);
    useAppStore.getState().unlock("all");
    expect(useAppStore.getState().isLocked).toBe(false);
  });

  it("sets hub PIN", () => {
    useAppStore.getState().setHubPin("1234");
    expect(useAppStore.getState().hubPin).toBe("1234");
  });
});

// ── Dashboard Layout ─────────────────────────────────────

describe("Dashboard", () => {
  it("updates widget config", () => {
    useAppStore.getState().updateWidget(0, { id: "w0", type: "cleaning" });
    expect(useAppStore.getState().dashboardLayout.widgets[0].type).toBe("cleaning");
  });

  it("changes layout preset", () => {
    useAppStore.getState().setDashboardLayout({
      preset: "4-panel",
      widgets: [
        { id: "w0", type: "calendar-today" },
        { id: "w1", type: "todo-list" },
        { id: "w2", type: "weekly-tasks" },
        { id: "w3", type: "clock" },
      ],
    });
    expect(useAppStore.getState().dashboardLayout.preset).toBe("4-panel");
    expect(useAppStore.getState().dashboardLayout.widgets).toHaveLength(4);
  });
});
