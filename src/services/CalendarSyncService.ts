/**
 * CalendarSyncService.ts
 *
 * Handles:
 *  • Google Calendar OAuth via @react-native-google-signin/google-signin
 *  • Multi-account support: stores refresh tokens in SecureStore per email
 *  • iCal / CalDAV feed fetching + parsing (no library needed, native fetch)
 *  • Native iOS/Android calendar read via react-native-calendar-events
 *  • Merging all sources into our unified CalendarEvent format
 */

import { GoogleSignin } from "@react-native-google-signin/google-signin";
import * as SecureStore from "expo-secure-store";
import RNCalendarEvents from "react-native-calendar-events";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { googleApiFetch } from "./googleApiFetch";
import { recordFailure } from "./ErrorRecoveryService";
import { onAuthFailure, markResolved } from "./ErrorRecoveryService";
import { useAppStore } from "../store/appStore";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CalendarFeed {
  id:         string;
  name:       string;
  type:       "gcal" | "ical" | "apple" | "native" | "manual";
  memberId:   string | null;
  color:      string;
  account:           string | null;   // email or .ics URL
  googleCalendarId?: string;         // specific Google calendar ID
  appleCalendarId?:  string;         // iOS system calendar ID for iCloud
  enabled:    boolean;
  lastSynced: number | null;   // unix ms
}

export interface CalendarEvent {
  id:         string;
  title:      string;
  date:       string;          // "YYYY-MM-DD"
  time:       string;          // "HH:MM"
  endTime?:   string;
  allDay:     boolean;
  memberId:   string | null;
  calendarId: string;
  reminder:   string;          // minutes as string
  location?:  string;
  notes?:     string;
  source:     "gcal" | "ical" | "apple" | "native" | "manual";
  externalId: string | null;   // original event ID from source
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TOKEN_PREFIX = "google_refresh_token_";

// ── Google Sign-In Setup ──────────────────────────────────────────────────────

/**
 * Call once at app startup (App.tsx).
 */
export function initGoogleSignIn() {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!webClientId) {
    console.error("[GoogleSignin] EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is missing from environment!");
  }

  GoogleSignin.configure({
    webClientId: webClientId ?? "",
    scopes: [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/tasks.readonly",
      "https://www.googleapis.com/auth/tasks",
    ],
    offlineAccess: true,
    forceCodeForRefreshToken: true,
  });
}

/**
 * Helper to sanitise email for SecureStore keys.
 */
function getSafeKey(email: string): string {
  if (!email) return "unknown_account";
  return email.toLowerCase().replace(/@/g, "_at_").replace(/\./g, "_dot_");
}

/**
 * Exchange serverAuthCode for refresh_token and store it in SecureStore.
 * This allows background sync for multiple accounts.
 * Note: Mobile/installed apps do not send client_secret per Google OAuth2 spec.
 */
async function exchangeAndStoreToken(email: string, code: string): Promise<void> {
  if (!email) return;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "",
        grant_type: "authorization_code",
        redirect_uri: "",
      }).toString(),
    });

    const data = await res.json();
    if (data.refresh_token) {
      await SecureStore.setItemAsync(TOKEN_PREFIX + getSafeKey(email), data.refresh_token);
      console.log(`[GoogleSignin] Stored refresh token for ${email}`);
    } else {
      console.log(`[GoogleSignin] No refresh token returned for ${email}. SDK tokens will be used as fallback.`);
    }
  } catch (err) {
    console.error(`[GoogleSignin] Token exchange error for ${email}:`, err);
  }
}

/**
 * Manually refresh an access token using a stored refresh token.
 * Note: Mobile/installed apps do not send client_secret per Google OAuth2 spec.
 */
async function refreshAccessTokenManually(email: string): Promise<string | null> {
  if (!email) return null;
  try {
    const refreshToken = await SecureStore.getItemAsync(TOKEN_PREFIX + getSafeKey(email));
    if (!refreshToken) return null;

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "",
        grant_type: "refresh_token",
      }).toString(),
    });

    const data = await res.json();
    if (data.access_token) {
      return data.access_token;
    }
    console.log(`[GoogleSignin] Manual refresh failed for ${email}. User may need to re-authenticate.`);
    return null;
  } catch (err) {
    console.error(`[GoogleSignin] Manual refresh error for ${email}:`, err);
    return null;
  }
}

/**
 * Internal helper to get a fresh access token for a SPECIFIC account.
 * 1. Checks if the requested account is the current active session in SDK.
 * 2. If yes, tries to get tokens from SDK (handling silent refresh).
 * 3. If no, or if SDK fails, uses the stored refresh token to get a new access token.
 */
async function getValidAccessToken(email: string): Promise<string> {
  if (!email) throw new Error("SIGN_IN_REQUIRED: No email provided");

  const currentUser = GoogleSignin.getCurrentUser();
  
  // If the SDK's current user matches the requested email, use the SDK
  if (currentUser?.user.email && currentUser.user.email.toLowerCase() === email.toLowerCase()) {
    try {
      const tokens = await GoogleSignin.getTokens();
      if (tokens.accessToken) return tokens.accessToken;
    } catch (e) {
      // SDK session might be stale, try silent sign in
      try {
        await GoogleSignin.signInSilently();
        const tokens = await GoogleSignin.getTokens();
        if (tokens.accessToken) return tokens.accessToken;
      } catch (silentErr) {
        // Fall back to manual refresh
      }
    }
  }

  // Use manual refresh if SDK session is different or failed
  const manualToken = await refreshAccessTokenManually(email);
  if (manualToken) {
    markResolved(`auth:${email}`);
    return manualToken;
  }

  const authError = new Error(`SIGN_IN_REQUIRED: ${email}`);
  onAuthFailure(email, authError);
  throw authError;
}

/**
 * Sign a family member into their Google account.
 * Forces the account picker to allow multiple different accounts.
 */
export async function connectGoogleCalendar(): Promise<string> {
  await GoogleSignin.hasPlayServices();
  
  // 1. Force sign out to ensure the account picker appears
  try {
    await GoogleSignin.signOut();
  } catch (e) {
    // Ignore sign-out errors
  }

  // 2. Perform interactive sign-in
  const userInfo = await GoogleSignin.signIn();
  
  // 3. Exchange auth code for refresh token if available
  if (userInfo.serverAuthCode) {
    await exchangeAndStoreToken(userInfo.user.email, userInfo.serverAuthCode);
  } else {
    console.log(`[GoogleSignin] No serverAuthCode returned for ${userInfo.user.email}. Background sync might fail.`);
  }

  return userInfo.user.email;
}

// ── Token helpers (used by GoogleTasksService) ──────────────────────────────

/**
 * Get the stored access token for a specific Google account.
 */
export async function getStoredToken(email: string): Promise<string | null> {
  try {
    return await getValidAccessToken(email);
  } catch (err) {
    console.log(`[GoogleSignin] getStoredToken failed for ${email}:`, err);
    return null;
  }
}

/**
 * Force refresh the access token for a specific account.
 */
export async function refreshTokenForAccount(email: string): Promise<string | null> {
  return await refreshAccessTokenManually(email);
}

// ── Google Calendar List ─────────────────────────────────────────────────────

export interface GCalListEntry {
  id: string;
  summary: string;
  description?: string;
  backgroundColor?: string;
  primary?: boolean;
  accessRole: string;
}

/**
 * Fetch the list of calendars visible to a Google account.
 */
export async function fetchCalendarList(email: string): Promise<GCalListEntry[]> {
  const accessToken = await getValidAccessToken(email);
  const res = await googleApiFetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList",
    { headers: { Authorization: `Bearer ${accessToken}` } },
    { operationKey: `calendarList:${email}` }
  );
  if (!res.ok) throw new Error(`Failed to fetch calendar list: ${res.status}`);
  const data = await res.json();
  return (data.items || []).map((c: any) => ({
    id: c.id,
    summary: c.summary || c.id,
    description: c.description,
    backgroundColor: c.backgroundColor,
    primary: c.primary || false,
    accessRole: c.accessRole,
  }));
}

/**
 * Subscribe to a shared or public calendar by ID.
 */
export async function subscribeToCalendar(email: string, calendarId: string): Promise<void> {
  const accessToken = await getValidAccessToken(email);
  const res = await googleApiFetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: calendarId }),
    },
    { operationKey: `calSubscribe:${calendarId}` }
  );
  if (!res.ok) throw new Error(`Failed to subscribe: ${res.status}`);
}

/**
 * Unsubscribe from a calendar.
 */
export async function unsubscribeFromCalendar(email: string, calendarId: string): Promise<void> {
  const accessToken = await getValidAccessToken(email);
  const res = await googleApiFetch(
    `https://www.googleapis.com/calendar/v3/users/me/calendarList/${encodeURIComponent(calendarId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    { operationKey: `calUnsubscribe:${calendarId}` }
  );
  if (!res.ok) throw new Error(`Failed to unsubscribe: ${res.status}`);
}

// ── Google Calendar Events ───────────────────────────────────────────────────

/**
 * Fetch events from a Google Calendar account for a date range.
 */
export async function fetchGoogleCalendarEvents(
  email: string,
  fromDate: Date,
  toDate: Date,
  googleCalendarId?: string
): Promise<Partial<CalendarEvent>[]> {
  const accessToken = await getValidAccessToken(email);

  // Determine which calendar IDs to fetch from
  let calIds: string[];
  if (googleCalendarId) {
    calIds = [googleCalendarId];
  } else {
    const calsRes = await googleApiFetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList",
      { headers: { Authorization: `Bearer ${accessToken}` } },
      { operationKey: `calendarList:${email}` }
    );
    if (!calsRes.ok) throw new Error(`Failed to fetch calendar list: ${calsRes.status}`);
    const calsData = await calsRes.json();
    calIds = (calsData.items || []).map((c: any) => c.id);
  }

  console.log(`[GCal] Syncing ${calIds.length} calendar(s) for ${email}`);

  const allEvents: Partial<CalendarEvent>[] = [];

  for (const calId of calIds) {
    try {
      const params = new URLSearchParams({
        timeMin: fromDate.toISOString(),
        timeMax: toDate.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "250",
      });

      const evRes = await googleApiFetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?${params}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
        { operationKey: `calEvents:${calId}` }
      );

      if (!evRes.ok) {
        console.error(`[GCal] Failed to fetch events for ${calId} after retries: ${evRes.status}`);
        recordFailure(`calEvents:${calId}`, new Error(`Calendar ${calId} fetch failed: ${evRes.status}`));
        continue;
      }

      const evData = await evRes.json();
      const items = evData.items || [];
      console.log(`[GCal]   Found ${items.length} items in calendar ${calId}`);

      for (const item of items) {
        if (!item.start) continue;

        const isAllDay = Boolean(item.start.date);
        const dateStr = isAllDay
          ? item.start.date
          : (item.start.dateTime ? item.start.dateTime.substring(0, 10) : "");
        const timeStr = isAllDay
          ? "00:00"
          : (item.start.dateTime ? item.start.dateTime.substring(11, 16) : "00:00");

        if (!dateStr) continue;

        const event: Partial<CalendarEvent> = {
          title:      item.summary || "(No title)",
          date:       dateStr,
          time:       timeStr,
          allDay:     isAllDay,
          location:   item.location,
          notes:      item.description,
          source:     "gcal",
          externalId: item.id,
          reminder:   "30",
        };

        console.log(`[GCal]     Parsed: "${event.title}" on ${event.date} ${event.allDay ? "(All Day)" : event.time}`);
        allEvents.push(event);
      }
    } catch (err) {
      console.error(`[GCal] Error processing calendar ${calId}:`, err);
    }
  }

  console.log(`[GCal] Finished fetch for ${email}: total ${allEvents.length} events`);
  return allEvents;
}

/**
 * Create an event on Google Calendar for a specific account.
 * Returns the created event's Google ID.
 */
export async function createGoogleCalendarEvent(
  email: string,
  event: { title: string; date: string; time: string; allDay: boolean }
): Promise<string> {
  const accessToken = await getValidAccessToken(email);

  const body: Record<string, any> = {
    summary: event.title,
  };

  if (event.allDay) {
    body.start = { date: event.date };
    body.end = { date: event.date };
  } else {
    const dateTime = `${event.date}T${event.time}:00`;
    const tzOffset = new Date().getTimezoneOffset();
    const sign = tzOffset <= 0 ? "+" : "-";
    const absH = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, "0");
    const absM = String(Math.abs(tzOffset) % 60).padStart(2, "0");
    const tz = `${sign}${absH}:${absM}`;
    body.start = { dateTime: dateTime + tz };
    // Default 1-hour duration
    const endHour = (parseInt(event.time.split(":")[0], 10) + 1) % 24;
    const endTime = `${event.date}T${String(endHour).padStart(2, "0")}:${event.time.split(":")[1]}:00`;
    body.end = { dateTime: endTime + tz };
  }

  const res = await googleApiFetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    { operationKey: `calCreateEvent:${email}` }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to create calendar event: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return data.id;
}

/**
 * Delete an event from Google Calendar.
 */
export async function deleteGoogleCalendarEvent(
  email: string,
  eventId: string,
  calendarId: string = "primary"
): Promise<void> {
  const accessToken = await getValidAccessToken(email);
  const res = await googleApiFetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    { operationKey: `calDeleteEvent:${eventId}` }
  );
  if (!res.ok && res.status !== 410) {
    console.log(`[CalendarSync] Delete event failed: ${res.status}`);
  }
}

/**
 * Update an event on Google Calendar.
 */
export async function updateGoogleCalendarEvent(
  email: string,
  eventId: string,
  patch: { title?: string; date?: string; time?: string; allDay?: boolean },
  calendarId: string = "primary"
): Promise<void> {
  const accessToken = await getValidAccessToken(email);
  const body: Record<string, any> = {};
  if (patch.title) body.summary = patch.title;
  if (patch.date && patch.allDay) {
    body.start = { date: patch.date };
    body.end = { date: patch.date };
  } else if (patch.date && patch.time) {
    const dateTime = `${patch.date}T${patch.time}:00`;
    const tzOffset = new Date().getTimezoneOffset();
    const sign = tzOffset <= 0 ? "+" : "-";
    const absH = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, "0");
    const absM = String(Math.abs(tzOffset) % 60).padStart(2, "0");
    const tz = `${sign}${absH}:${absM}`;
    body.start = { dateTime: dateTime + tz };
    const endHour = (parseInt(patch.time.split(":")[0], 10) + 1) % 24;
    const endTime = `${patch.date}T${String(endHour).padStart(2, "0")}:${patch.time.split(":")[1]}:00`;
    body.end = { dateTime: endTime + tz };
  }

  const res = await googleApiFetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    { operationKey: `calUpdateEvent:${eventId}` }
  );
  if (!res.ok) {
    console.log(`[CalendarSync] Update event failed: ${res.status}`);
  }
}

// ── iCal Parsing ──────────────────────────────────────────────────────────────

/**
 * Fetch and parse a .ics / webcal:// feed.
 */
export async function fetchICalEvents(
  url: string
): Promise<Partial<CalendarEvent>[]> {
  const fetchUrl = url.replace(/^webcal:\/\//i, "https://");
  const res = await fetch(fetchUrl);
  if (!res.ok) throw new Error(`iCal fetch failed: ${res.status}`);
  const text = await res.text();
  return parseICalText(text);
}

function parseICalText(text: string): Partial<CalendarEvent>[] {
  const events: Partial<CalendarEvent>[] = [];
  const lines = text
    .replace(/\r\n /g, "")   // unfold lines
    .replace(/\r\n/g, "\n")
    .split("\n");

  let inEvent = false;
  let current: Record<string, string> = {};

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "BEGIN:VEVENT") { inEvent = true; current = {}; continue; }
    if (line === "END:VEVENT") {
      inEvent = false;
      const ev = parseVEvent(current);
      if (ev) events.push(ev);
      continue;
    }
    if (!inEvent) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key   = line.substring(0, colonIdx).split(";")[0].toUpperCase();
    const value = line.substring(colonIdx + 1);
    current[key] = value;
  }

  return events;
}

const ICAL_DATE_RE = /^(\d{8})(T(\d{6}))?/;

function parseVEvent(ev: Record<string, string>): Partial<CalendarEvent> | null {
  // Find the DTSTART key — handles DTSTART, DTSTART;VALUE=DATE, DTSTART;TZID=... variants
  const dtKey = Object.keys(ev).find(k => k.startsWith("DTSTART"));
  const dtRaw = dtKey ? ev[dtKey] : "";

  if (!dtRaw) return null;

  const match = ICAL_DATE_RE.exec(dtRaw);
  if (!match) {
    console.warn("[iCal] Skipping event with malformed date:", dtRaw);
    return null;
  }

  const dateDigits = match[1]; // "20240315"
  const timeDigits = match[3]; // "093000" or undefined

  const year  = dateDigits.substring(0, 4);
  const month = dateDigits.substring(4, 6);
  const day   = dateDigits.substring(6, 8);

  // Bounds check
  const monthNum = parseInt(month, 10);
  const dayNum   = parseInt(day, 10);
  if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
    console.warn("[iCal] Skipping event with out-of-bounds date:", dtRaw);
    return null;
  }

  const isAllDay = !timeDigits;
  const dateStr = `${year}-${month}-${day}`;
  const timeStr = isAllDay ? "00:00" : `${timeDigits.substring(0, 2)}:${timeDigits.substring(2, 4)}`;

  return {
    title:      decodeICalText(ev["SUMMARY"] || "(No title)"),
    date:       dateStr,
    time:       timeStr,
    allDay:     isAllDay,
    location:   decodeICalText(ev["LOCATION"] || ""),
    notes:      decodeICalText(ev["DESCRIPTION"] || ""),
    source:     "ical",
    externalId: ev["UID"] || null,
    reminder:   "30",
  };
}

function decodeICalText(s: string): string {
  return s.replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

// ── Native Calendar (iOS/Android system calendars) ────────────────────────────

/**
 * Read events from the device's built-in calendar app.
 */
export async function fetchNativeCalendarEvents(
  fromDate: Date,
  toDate: Date
): Promise<Partial<CalendarEvent>[]> {
  const status = await RNCalendarEvents.requestPermissions();
  if (status !== "authorized") throw new Error("Calendar permission denied");

  const events = await RNCalendarEvents.fetchAllEvents(
    fromDate.toISOString(),
    toDate.toISOString()
  );

  return events.map(e => ({
    title:      e.title,
    date:       (e.startDate || "").substring(0, 10),
    time:       (e.startDate || "").substring(11, 16),
    allDay:     e.allDay || false,
    location:   e.location,
    notes:      e.notes,
    source:     "native" as const,
    externalId: e.id,
    reminder:   "30",
  }));
}

// ── Sync orchestrator ─────────────────────────────────────────────────────────

const SYNC_CACHE_KEY = "calendar_sync_cache";

/**
 * Sync all enabled feeds for a member and return merged events.
 */
export async function syncAllFeeds(
  feeds: CalendarFeed[],
  fromDate: Date,
  toDate: Date
): Promise<CalendarEvent[]> {
  const allEvents: CalendarEvent[] = [];
  const enabledFeeds = feeds.filter(f => f.enabled);

  console.log(`[Sync] Starting sync for ${enabledFeeds.length} enabled feeds`);

  for (const feed of enabledFeeds) {
    try {
      let rawEvents: Partial<CalendarEvent>[] = [];

      console.log(`[Sync]   Processing feed: ${feed.name} (type: ${feed.type})`);

      if (feed.type === "gcal" && feed.account) {
        rawEvents = await fetchGoogleCalendarEvents(feed.account, fromDate, toDate, feed.googleCalendarId);
      } else if (feed.type === "apple" && feed.appleCalendarId) {
        const { fetchAppleCalendarEvents } = require("./AppleCalendarService");
        rawEvents = await fetchAppleCalendarEvents(feed.appleCalendarId, fromDate, toDate);
      } else if (feed.type === "ical" && feed.account) {
        rawEvents = await fetchICalEvents(feed.account);
      } else if (feed.type === "native") {
        rawEvents = await fetchNativeCalendarEvents(fromDate, toDate);
      }

      console.log(`[Sync]   Feed ${feed.name} returned ${rawEvents.length} events`);

      const stamped: CalendarEvent[] = rawEvents.map(ev => ({
        id:         `${feed.id}_${ev.externalId || Math.random()}`,
        title:      ev.title || "(No title)",
        date:       ev.date || "",
        time:       ev.time || "00:00",
        endTime:    ev.endTime,
        allDay:     ev.allDay || false,
        memberId:   feed.memberId,
        calendarId: feed.id,
        reminder:   ev.reminder || "30",
        location:   ev.location,
        notes:      ev.notes,
        source:     feed.type,
        externalId: ev.externalId || null,
      }));

      allEvents.push(...stamped);
      // Feeds from the Zustand+Immer store are frozen — mutating `feed.lastSynced`
      // directly throws in dev and was swallowing successful sync results. Route
      // through the store action instead.
      useAppStore.getState().updateFeed(feed.id, { lastSynced: Date.now() });
    } catch (err) {
      console.log(`[Sync] Failed to sync feed ${feed.name}:`, err);
    }
  }

  console.log(`[Sync] Finished sync: total ${allEvents.length} events across all feeds`);
  await AsyncStorage.setItem(SYNC_CACHE_KEY, JSON.stringify(allEvents));
  return allEvents;
}

/** Load cached events when offline or before first sync.
 *  JSON.parse is deferred via setImmediate to avoid blocking the main thread
 *  on large event caches during app startup. */
export async function loadCachedEvents(): Promise<CalendarEvent[]> {
  const raw = await AsyncStorage.getItem(SYNC_CACHE_KEY);
  if (!raw) return [];
  return new Promise((resolve) => {
    setImmediate(() => {
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        console.warn("[Sync] Failed to parse cached events:", err);
        resolve([]);
      }
    });
  });
}
