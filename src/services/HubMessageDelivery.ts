import { useAppStore } from "../store/appStore";
import { playHubSound } from "./HubSound";
import type { HubMessage } from "@familyhub/shared";

// Fire keys whose sound/overlay effects have already run. One-shot messages use
// their id; weekly-repeat messages use one key per occurrence (id@date) so they
// re-fire each scheduled day. Module-scoped, re-seeded on start via
// initHubDelivery so a restart doesn't replay old occurrences.
const fired = new Set<string>();

// An occurrence fires if "now" lands within this window after its scheduled
// time — wide enough that the 30s check tick can't step over it.
const REPEAT_FIRE_WINDOW_MS = 90_000;

function isActive(m: HubMessage, now: number): boolean {
  return m.scheduledFor == null || m.scheduledFor <= now;
}

/** Today's occurrence timestamp for a repeat message, or null if today isn't a scheduled day / time is malformed. */
function todaysOccurrence(m: HubMessage, now: number): number | null {
  if (!m.repeat) return null;
  const d = new Date(now);
  if (!m.repeat.days.includes(d.getDay())) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(m.repeat.time);
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh > 23 || mm > 59) return null;
  d.setHours(hh, mm, 0, 0);
  return d.getTime();
}

function occurrenceKey(m: HubMessage, occurrence: number): string {
  return `${m.id}@${new Date(occurrence).toDateString()}`;
}

function fireEffects(m: HubMessage, key: string): void {
  if (fired.has(key)) return;
  fired.add(key);
  const store = useAppStore.getState();
  if (m.kind === "alert") store.setActiveAlertMessage(m);
  if (m.kind === "alert" || m.loud)
    playHubSound(m.kind === "alert" ? "alert" : "loud", { volume: m.soundVolume, seconds: m.soundSeconds });
}

/** A message arrived from a phone: store it, and fire effects if it's due now. */
export function deliverMessage(m: HubMessage): void {
  useAppStore.getState().addHubMessage(m);
  // Weekly-repeat messages sit on the board and only fire at their scheduled
  // occurrences (handled by the tick) — never on arrival.
  if (m.repeat) return;
  if (isActive(m, Date.now())) fireEffects(m, m.id);
}

/** On startup, mark already-active messages/occurrences as fired so a restart doesn't replay them. */
export function initHubDelivery(): void {
  const now = Date.now();
  for (const m of useAppStore.getState().hubMessages) {
    if (m.repeat) {
      const occ = todaysOccurrence(m, now);
      if (occ != null && occ <= now) fired.add(occurrenceKey(m, occ));
    } else if (isActive(m, now)) {
      fired.add(m.id);
    }
  }
}

/** Timer tick: activate scheduled messages / weekly occurrences whose time has arrived. */
export function checkScheduledMessages(): void {
  const now = Date.now();
  for (const m of useAppStore.getState().hubMessages) {
    if (m.repeat) {
      const occ = todaysOccurrence(m, now);
      if (occ != null && now >= occ && now < occ + REPEAT_FIRE_WINDOW_MS) fireEffects(m, occurrenceKey(m, occ));
    } else if (!fired.has(m.id) && isActive(m, now)) {
      fireEffects(m, m.id);
    }
  }
}