/**
 * NotificationService.test.ts
 *
 * Regression tests for the cross-platform DATE trigger (DEBT-040). The earlier
 * CALENDAR trigger was iOS-only and was being silently coerced to immediate on
 * Android, causing event reminders to fire at the wrong time. These tests pin
 * the trigger shape so that bug cannot recur.
 */

import { CalendarEvent } from "../services/CalendarSyncService";

// react-native is not Jest-friendly out of the box; we only need Platform here.
jest.mock("react-native", () => ({
  Platform: { OS: "android", Version: 31 },
}));

// expo-notifications is auto-mocked via jest.config.js moduleNameMapper.
const Notifications = require("expo-notifications");

// In-test override of the Zustand store. NotificationService.scheduleEventReminder
// pulls notificationsEnabled via require("../store/appStore"), so we shim it.
let notificationsEnabledFlag = true;
jest.mock("../store/appStore", () => ({
  useAppStore: {
    getState: () => ({ notificationsEnabled: notificationsEnabledFlag }),
  },
}));

import { scheduleEventReminder } from "../services/NotificationService";

const baseEvent: CalendarEvent = {
  id:         "evt-1",
  title:      "Soccer practice",
  date:       "2099-12-31",
  time:       "16:00",
  allDay:     false,
  memberId:   "m-1",
  calendarId: "cal-1",
  reminder:   "30",
  source:     "manual",
  externalId: null,
};

beforeEach(() => {
  notificationsEnabledFlag = true;
  (Notifications.scheduleNotificationAsync as jest.Mock).mockClear();
  (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue("notif-id");
});

describe("scheduleEventReminder — DEBT-040 regression", () => {
  it("uses the cross-platform DATE trigger (not the iOS-only CALENDAR trigger)", async () => {
    const id = await scheduleEventReminder(baseEvent, "Mom", 30);

    expect(id).toBe("notif-id");
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);

    const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.trigger.type).toBe(Notifications.SchedulableTriggerInputTypes.DATE);
    expect(call.trigger.type).not.toBe(Notifications.SchedulableTriggerInputTypes.CALENDAR);
    expect(call.trigger.date).toBeInstanceOf(Date);

    // 30-minute lead time before the event start (2099-12-31 16:00 local)
    const expected = new Date(2099, 11, 31, 15, 30);
    expect(call.trigger.date.getTime()).toBe(expected.getTime());
  });

  it("returns null and does not schedule for past-time events", async () => {
    const pastEvent: CalendarEvent = { ...baseEvent, date: "2000-01-01", time: "08:00" };

    const id = await scheduleEventReminder(pastEvent, "Mom", 30);

    expect(id).toBeNull();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("returns null and does not schedule when notifications are globally disabled", async () => {
    notificationsEnabledFlag = false;

    const id = await scheduleEventReminder(baseEvent, "Mom", 30);

    expect(id).toBeNull();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
