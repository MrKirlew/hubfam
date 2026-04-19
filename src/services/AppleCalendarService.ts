/**
 * AppleCalendarService.ts
 *
 * Handles Apple Sign-In and iCloud calendar access.
 *
 * Platform behavior:
 *  - iOS: Apple Sign-In + system calendar access for iCloud calendars
 *  - Android: Graceful fallback — Apple Sign-In unavailable, use iCal URLs instead
 *
 * expo-apple-authentication is loaded dynamically to prevent crashes
 * when the native module isn't built or on Android.
 */

import { Platform } from "react-native";
import RNCalendarEvents from "react-native-calendar-events";
import type { CalendarEvent } from "./CalendarSyncService";

export interface AppleCalendarEntry {
  id: string;
  title: string;
  color?: string;
  source: string;
}

/** Check if Apple Sign-In is available on this device */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  try {
    const AppleAuth = require("expo-apple-authentication");
    return await AppleAuth.isAvailableAsync();
  } catch {
    return false;
  }
}

/** iOS only: Sign in with Apple, returns Apple ID info */
export async function connectAppleAccount(): Promise<{ email: string; displayName: string }> {
  if (Platform.OS !== "ios") {
    throw new Error("Apple Sign-In is not available on Android. Use an iCal subscription URL for iCloud calendars.");
  }

  try {
    const AppleAuth = require("expo-apple-authentication");
    const credential = await AppleAuth.signInAsync({
      requestedScopes: [
        AppleAuth.AppleAuthenticationScope.FULL_NAME,
        AppleAuth.AppleAuthenticationScope.EMAIL,
      ],
    });

    const email = credential.email || "apple-user@icloud.com";
    const fullName = credential.fullName;
    const displayName = fullName
      ? [fullName.givenName, fullName.familyName].filter(Boolean).join(" ") || "Apple User"
      : "Apple User";

    console.log(`[AppleAuth] Signed in: ${displayName} (${email})`);
    return { email, displayName };
  } catch (err: any) {
    if (err?.code === "ERR_CANCELED") {
      throw new Error("Apple Sign-In was cancelled");
    }
    throw new Error(`Apple Sign-In failed: ${err?.message || "Unknown error"}`);
  }
}

/** iOS only: Fetch iCloud calendars from the device's system calendar store */
export async function fetchAppleCalendars(): Promise<AppleCalendarEntry[]> {
  if (Platform.OS !== "ios") return [];

  try {
    const status = await RNCalendarEvents.requestPermissions();
    if (status !== "authorized") return [];

    const calendars = await RNCalendarEvents.findCalendars();
    return calendars
      .filter((cal: any) => {
        const src = (cal.source || "").toLowerCase();
        return src.includes("icloud") || src.includes("caldav");
      })
      .map((cal: any) => ({
        id: cal.id,
        title: cal.title,
        color: cal.color,
        source: cal.source || "iCloud",
      }));
  } catch (err) {
    console.log("[AppleCalendar] Failed to fetch calendars:", err);
    return [];
  }
}

/**
 * Fetch events from a specific system calendar by ID.
 * Works on iOS for iCloud calendars accessed via react-native-calendar-events.
 */
export async function fetchAppleCalendarEvents(
  calendarId: string,
  fromDate: Date,
  toDate: Date
): Promise<Partial<CalendarEvent>[]> {
  try {
    const status = await RNCalendarEvents.requestPermissions();
    if (status !== "authorized") return [];

    const events = await RNCalendarEvents.fetchAllEvents(
      fromDate.toISOString(),
      toDate.toISOString(),
      [calendarId]
    );

    return events.map(e => ({
      title:      e.title,
      date:       (e.startDate || "").substring(0, 10),
      time:       (e.startDate || "").substring(11, 16),
      allDay:     e.allDay || false,
      location:   e.location,
      notes:      e.notes,
      source:     "apple" as const,
      externalId: e.id,
      reminder:   "30",
    }));
  } catch (err) {
    console.log("[AppleCalendar] Failed to fetch events:", err);
    return [];
  }
}
