/**
 * NotificationService.ts
 *
 * Schedules local push notifications for calendar reminders.
 * Uses expo-notifications — works on both Android and iOS with no server needed.
 *
 * On Android: shows heads-up notification + sound + LED
 * On iOS:     shows banner + sound + badge
 *
 * The app can schedule reminders even when the screen is off / app is in
 * background, thanks to SCHEDULE_EXACT_ALARM permission on Android.
 */

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { CalendarEvent } from "./CalendarSyncService";

// ── Setup ─────────────────────────────────────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  false,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  if (!Device.isDevice) return false;   // simulators can't receive push

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;

  const { status } = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
      allowAnnouncements: true,
    },
  });
  return status === "granted";
}

export async function setupNotificationChannel() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("reminders", {
      name:              "Event Reminders",
      importance:        Notifications.AndroidImportance.HIGH,
      vibrationPattern:  [0, 250, 250, 250],
      lightColor:        "#60a5fa",
      sound:             "notification.wav",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
}

// ── Schedule / cancel ─────────────────────────────────────────────────────────

/**
 * Schedule a local notification for a single event.
 * `reminderMinutes` before the event start time.
 * Returns the notification identifier (store this to cancel later).
 */
export async function scheduleEventReminder(
  event: CalendarEvent,
  memberName: string,
  reminderMinutes: number
): Promise<string | null> {
  const [year, month, day]   = event.date.split("-").map(Number);
  const [hour, minute]       = event.time.split(":").map(Number);
  const eventTime            = new Date(year, month - 1, day, hour, minute);
  const triggerTime          = new Date(eventTime.getTime() - reminderMinutes * 60_000);

  if (triggerTime <= new Date()) return null;   // already past

  // Respect the global notifications toggle
  const { useAppStore } = require("../store/appStore");
  if (!useAppStore.getState().notificationsEnabled) return null;

  const body = event.allDay
    ? `${event.title} is today`
    : `${event.title} at ${event.time}`;

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title:    `📅 Reminder for ${memberName}`,
      body,
      data:     { eventId: event.id, memberId: event.memberId },
      sound:    "notification.wav",
      ...(Platform.OS === "android" && { channelId: "reminders" }),
    },
    trigger: {
      date: triggerTime,
    },
  });

  return id;
}

/**
 * Schedule reminders for all events in a list.
 * Cancels existing notifications first to avoid duplicates.
 */
export async function scheduleAllReminders(
  events: CalendarEvent[],
  getMemberName: (id: string | null) => string
): Promise<void> {
  // Cancel all existing scheduled notifications
  await Notifications.cancelAllScheduledNotificationsAsync();

  for (const event of events) {
    const memberName = getMemberName(event.memberId);
    const minutes    = parseInt(event.reminder, 10) || 30;
    await scheduleEventReminder(event, memberName, minutes);
  }
}

/** Cancel a specific notification by its ID */
export async function cancelReminder(notificationId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}

/** Get count of scheduled notifications (for debugging / settings display) */
export async function getScheduledCount(): Promise<number> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled.length;
}
