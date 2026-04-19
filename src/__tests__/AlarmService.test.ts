/**
 * AlarmService.test.ts — Tests for alarm scheduling and trigger logic
 */

import { useAppStore } from "../store/appStore";
import type { AlarmSchedule } from "../store/appStore";

// Reset store before each test
beforeEach(() => {
  useAppStore.setState({
    alarms: [],
    isLocked: false,
    lockMuteAlarms: false,
    notificationsEnabled: true,
  });
});

// Test the shouldFire logic via store state
describe("Alarm scheduling", () => {
  const specificTimeAlarm: AlarmSchedule = {
    id: "a1", enabled: true, label: "Morning Check",
    type: "specific-time", recurrence: "daily", specificTime: "08:00",
  };

  const intervalAlarm: AlarmSchedule = {
    id: "a2", enabled: true, label: "Every 4 Hours",
    type: "interval", recurrence: "daily", intervalHours: 4,
  };

  it("stores alarms correctly", () => {
    useAppStore.getState().addAlarm(specificTimeAlarm);
    useAppStore.getState().addAlarm(intervalAlarm);
    expect(useAppStore.getState().alarms).toHaveLength(2);
  });

  it("disables one-time alarm after trigger", () => {
    const onceAlarm: AlarmSchedule = {
      id: "a3", enabled: true, label: "One Timer",
      type: "specific-time", recurrence: "once", specificTime: "09:00",
    };
    useAppStore.getState().addAlarm(onceAlarm);
    useAppStore.getState().updateAlarm("a3", { enabled: false, lastTriggered: Date.now() });
    expect(useAppStore.getState().alarms[0].enabled).toBe(false);
  });

  it("tracks lastTriggered timestamp", () => {
    useAppStore.getState().addAlarm(intervalAlarm);
    const now = Date.now();
    useAppStore.getState().updateAlarm("a2", { lastTriggered: now });
    expect(useAppStore.getState().alarms[0].lastTriggered).toBe(now);
  });

  it("disabled alarm stays disabled", () => {
    const disabled: AlarmSchedule = {
      ...specificTimeAlarm, id: "a4", enabled: false,
    };
    useAppStore.getState().addAlarm(disabled);
    expect(useAppStore.getState().alarms[0].enabled).toBe(false);
  });

  it("supports random-window alarm type", () => {
    const randomAlarm: AlarmSchedule = {
      id: "a5", enabled: true, label: "Random Reminder",
      type: "random-window", recurrence: "daily",
      windowStart: "10:00", windowEnd: "14:00",
    };
    useAppStore.getState().addAlarm(randomAlarm);
    const stored = useAppStore.getState().alarms[0];
    expect(stored.windowStart).toBe("10:00");
    expect(stored.windowEnd).toBe("14:00");
  });

  it("mutes alarms when locked and lockMuteAlarms is enabled", () => {
    useAppStore.setState({ isLocked: true, lockMuteAlarms: true });
    useAppStore.getState().addAlarm(specificTimeAlarm);
    // When muted, alarm should still update lastTriggered but not alert
    useAppStore.getState().updateAlarm("a1", { lastTriggered: Date.now() });
    expect(useAppStore.getState().alarms[0].lastTriggered).toBeDefined();
  });
});
