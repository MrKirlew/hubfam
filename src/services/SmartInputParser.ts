/**
 * services/SmartInputParser.ts
 *
 * Natural-language parser for the QuickAddBar. Takes freeform text like
 * "Soccer practice every Tuesday 4pm — remind me 30min before and add to Kids list"
 * and extracts intents (event / reminder / task), date, time, recurrence,
 * reminder offset, assigned member, target list/calendar, and location.
 *
 * Pure, synchronous, framework-free. No RN imports, no store access — context
 * is injected so the module is trivially unit-testable.
 */

import { en as chronoEn } from "chrono-node";
import type { TaskRecurrence, Member, TodoList, CalendarFeed } from "../store/appStore";

// ── Types ─────────────────────────────────────────────────────────────────────

export type QuickAddSegment = "calendar" | "list" | "reminder";
export type SmartIntent = "event" | "reminder" | "task";

export interface ParseContext {
  now:            Date;
  members:        Pick<Member, "id" | "name" | "initials">[];
  lists:          Pick<TodoList, "id" | "name">[];
  calendars:      Pick<CalendarFeed, "id" | "name">[];
  defaultSegment: QuickAddSegment;
}

export interface ParsedFields {
  title:               string;
  date?:               string;        // YYYY-MM-DD
  time?:               string;        // HH:MM (24h)
  endTime?:            string;
  allDay?:             boolean;
  recurrence?:         TaskRecurrence;
  recurrenceDays?:     number[];      // 0=Sun..6=Sat
  recurrenceInterval?: number;
  reminderOffsetMin?:  number;
  memberId?:           string | null;
  listId?:             string | null;
  calendarId?:         string | null;   // parser detects at most one; modal may upgrade to calendarIds
  calendarIds?:        string[];        // user may target multiple calendars from the modal
  location?:           string;
  notes?:              string;
}

export type ParsedFieldKey = keyof ParsedFields;

export interface SmartParseResult {
  originalText:  string;
  intents:       SmartIntent[];
  fields:        ParsedFields;
  missingFields: ParsedFieldKey[];
  confidence:    number;      // 0..1
  warnings:      string[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const WEEKDAY_MAP: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

// Verbs where a following name is the OBJECT, not the assignee.
// e.g. "pick up Alice from school" — Alice is picked up, not assigning.
const OBJECT_VERBS = [
  "pick up", "pickup", "drop off", "dropoff",
  "call", "text", "email", "meet", "take", "drive",
  "visit", "see", "remind",
];

const TASK_VERBS = /\b(buy|pick up|grab|do|finish|call|email|text|order|wash|clean|fold|unload|load)\b/i;
const REMIND_PHRASE = /\bremind\b/i;

// ── Entry point ───────────────────────────────────────────────────────────────

export function parseSmartInput(rawText: string, ctx: ParseContext): SmartParseResult {
  const original = rawText;
  const text = rawText.trim();

  if (!text) {
    return emptyResult(original, ctx);
  }

  const warnings: string[] = [];
  const fields: ParsedFields = { title: text };

  // Track spans to remove from the title. Each is [startIdx, endIdx) against `text`.
  const consumed: [number, number][] = [];

  // 1. Recurrence (run first so chrono doesn't try to pin "every Tuesday" to one date)
  extractRecurrence(text, fields, consumed);

  // 2. Reminder offset
  extractReminderOffset(text, fields, consumed);

  // 3. Dates/times via chrono
  extractDateTime(text, ctx.now, fields, consumed, warnings);

  // 4. Member assignee
  extractMember(text, ctx, fields, consumed);

  // 5. List hint
  extractListHint(text, ctx, fields, consumed);

  // 6. Calendar hint
  extractCalendarHint(text, ctx, fields, consumed);

  // 7. Location (only attempt if we haven't already consumed the "at" span via chrono)
  extractLocation(text, fields, consumed);

  // 8. Build clean title
  fields.title = buildTitle(text, consumed);

  // Intent inference
  const intents = inferIntents(text, fields, ctx);

  // Missing fields per active intent
  const missingFields = computeMissing(intents, fields, ctx);

  // Confidence
  const confidence = computeConfidence(fields, text);

  return {
    originalText: original,
    intents,
    fields,
    missingFields,
    confidence,
    warnings,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyResult(original: string, ctx: ParseContext): SmartParseResult {
  return {
    originalText: original,
    intents: [intentForSegment(ctx.defaultSegment)],
    fields: { title: "" },
    missingFields: [],
    confidence: 0,
    warnings: [],
  };
}

export function intentForSegment(seg: QuickAddSegment): SmartIntent {
  return seg === "calendar" ? "event" : seg === "reminder" ? "reminder" : "task";
}

// Recurrence -------------------------------------------------------------------

function extractRecurrence(text: string, f: ParsedFields, consumed: [number, number][]): void {
  // "every weekday" / "every weekdays"
  let m = /\bevery\s+(weekdays?)\b/i.exec(text);
  if (m) {
    f.recurrence = "weekly";
    f.recurrenceDays = [1, 2, 3, 4, 5];
    consumed.push([m.index, m.index + m[0].length]);
    return;
  }
  // "every weekend"
  m = /\bevery\s+(weekends?)\b/i.exec(text);
  if (m) {
    f.recurrence = "weekends";
    consumed.push([m.index, m.index + m[0].length]);
    return;
  }
  // "every Monday", "every Tue and Thu", "every Mon, Wed, Fri"
  const weekdayList = /\bevery\s+((?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*)(?:\s*(?:,|and|&)\s*(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*)*)\b/i;
  m = weekdayList.exec(text);
  if (m) {
    const days = parseWeekdayList(m[1]);
    if (days.length) {
      f.recurrence = "weekly";
      f.recurrenceDays = days;
      consumed.push([m.index, m.index + m[0].length]);
      return;
    }
  }
  // "every day" / "every morning" / "every night" / "daily"
  m = /\bevery\s+(day|morning|evening|night)\b|\bdaily\b/i.exec(text);
  if (m) {
    f.recurrence = "daily";
    consumed.push([m.index, m.index + m[0].length]);
    return;
  }
  // "every week" / "weekly"
  m = /\bevery\s+week\b|\bweekly\b/i.exec(text);
  if (m) {
    f.recurrence = "weekly";
    consumed.push([m.index, m.index + m[0].length]);
    return;
  }
  // "every month" / "monthly"
  m = /\bevery\s+month\b|\bmonthly\b/i.exec(text);
  if (m) {
    f.recurrence = "monthly";
    consumed.push([m.index, m.index + m[0].length]);
  }
}

function parseWeekdayList(listStr: string): number[] {
  const days: number[] = [];
  const tokens = listStr.split(/\s*(?:,|and|&)\s*/i);
  for (const tok of tokens) {
    const key = tok.trim().toLowerCase();
    if (key in WEEKDAY_MAP && !days.includes(WEEKDAY_MAP[key])) {
      days.push(WEEKDAY_MAP[key]);
    }
  }
  return days.sort((a, b) => a - b);
}

// Reminder offset --------------------------------------------------------------

function extractReminderOffset(text: string, f: ParsedFields, consumed: [number, number][]): void {
  // "remind me 30 min before" / "remind 1 hour prior" / "remind me 15min"
  const re = /\bremind(?:\s+me)?\s+(\d+)\s*(min(?:ute)?s?|h(?:our)?s?|hrs?)\s*(?:before|prior|earlier)?/i;
  const m = re.exec(text);
  if (m) {
    const n = parseInt(m[1], 10);
    const unit = m[2].toLowerCase();
    const mins = unit.startsWith("h") ? n * 60 : n;
    f.reminderOffsetMin = mins;
    consumed.push([m.index, m.index + m[0].length]);
  }
}

// Date/time via chrono ---------------------------------------------------------

function extractDateTime(
  text: string,
  now: Date,
  f: ParsedFields,
  consumed: [number, number][],
  warnings: string[],
): void {
  // Mask already-consumed spans so chrono doesn't try to re-parse "every Tuesday"
  // as a single date. Replace with spaces to preserve indices.
  const masked = maskSpans(text, consumed);
  const results = chronoEn.parse(masked, now, { forwardDate: true });
  if (results.length === 0) return;

  const r = results[0];
  const startDate = r.start.date();
  f.date = fmtDate(startDate);
  const hasTime = r.start.isCertain("hour");
  if (hasTime) {
    f.time = fmtTime(startDate);
    f.allDay = false;
  } else {
    f.allDay = true;
  }
  if (r.end) {
    const endDate = r.end.date();
    if (r.end.isCertain("hour")) f.endTime = fmtTime(endDate);
  }

  // Warning: past date (ignore if same day but time already passed — still "today")
  const sameDay = fmtDate(now) === f.date;
  if (!sameDay && startDate.getTime() < now.getTime()) {
    warnings.push("date in past");
  }

  consumed.push([r.index, r.index + r.text.length]);
}

function maskSpans(text: string, spans: [number, number][]): string {
  if (!spans.length) return text;
  const chars = text.split("");
  for (const [a, b] of spans) {
    for (let i = a; i < b && i < chars.length; i++) chars[i] = " ";
  }
  return chars.join("");
}

// Member detection -------------------------------------------------------------

function extractMember(text: string, ctx: ParseContext, f: ParsedFields, consumed: [number, number][]): void {
  if (ctx.members.length === 0) return;

  // 1. Explicit @mention — always wins.
  for (const m of ctx.members) {
    const re = new RegExp(`@${escapeRe(m.name)}\\b`, "i");
    const hit = re.exec(text);
    if (hit) {
      f.memberId = m.id;
      consumed.push([hit.index, hit.index + hit[0].length]);
      return;
    }
  }

  // 2. "for <Name>" — explicit assignment.
  for (const m of ctx.members) {
    const re = new RegExp(`\\bfor\\s+${escapeRe(m.name)}\\b`, "i");
    const hit = re.exec(text);
    if (hit) {
      f.memberId = m.id;
      consumed.push([hit.index, hit.index + hit[0].length]);
      return;
    }
  }

  // 3. Bare name/initials — only assign if NOT the direct object of an object-verb.
  const candidates: { memberId: string; index: number; length: number }[] = [];
  for (const m of ctx.members) {
    for (const needle of [m.name, m.initials]) {
      if (!needle) continue;
      const re = new RegExp(`\\b${escapeRe(needle)}\\b`, "gi");
      let hit: RegExpExecArray | null;
      while ((hit = re.exec(text)) !== null) {
        // Skip if preceded by an object-verb (Alice is the object, not the assignee).
        const before = text.slice(0, hit.index).toLowerCase();
        const isObject = OBJECT_VERBS.some(v => {
          const pattern = new RegExp(`\\b${escapeRe(v)}\\s*$`);
          return pattern.test(before.trimEnd() + " ");
        });
        if (isObject) continue;
        candidates.push({ memberId: m.id, index: hit.index, length: hit[0].length });
      }
    }
  }

  if (candidates.length === 0) return;

  const uniqueMembers = new Set(candidates.map(c => c.memberId));
  if (uniqueMembers.size > 1) {
    // Ambiguous — force modal to clarify.
    f.memberId = undefined;
    return;
  }

  const pick = candidates[0];
  f.memberId = pick.memberId;
  consumed.push([pick.index, pick.index + pick.length]);
}

// List hint --------------------------------------------------------------------

function extractListHint(text: string, ctx: ParseContext, f: ParsedFields, consumed: [number, number][]): void {
  if (ctx.lists.length === 0) return;

  // "#<name>"
  for (const l of ctx.lists) {
    const re = new RegExp(`#${escapeRe(l.name)}\\b`, "i");
    const hit = re.exec(text);
    if (hit) {
      f.listId = l.id;
      consumed.push([hit.index, hit.index + hit[0].length]);
      return;
    }
  }

  // "add (to|in) (the )?<name>( list)?" — we match just the "<name>( list)?" portion
  // so "add eggs to groceries list" consumes "to groceries list".
  for (const l of ctx.lists) {
    const re = new RegExp(`\\b(?:add\\s+\\w+\\s+)?(?:to|in|on)\\s+(?:the\\s+)?${escapeRe(l.name)}(?:\\s+list)?\\b`, "i");
    const hit = re.exec(text);
    if (hit) {
      f.listId = l.id;
      consumed.push([hit.index, hit.index + hit[0].length]);
      return;
    }
  }
}

// Calendar hint ----------------------------------------------------------------

function extractCalendarHint(text: string, ctx: ParseContext, f: ParsedFields, consumed: [number, number][]): void {
  if (ctx.calendars.length === 0) return;
  for (const c of ctx.calendars) {
    const re = new RegExp(`\\bon\\s+(?:the\\s+)?${escapeRe(c.name)}(?:\\s+calendar)?\\b`, "i");
    const hit = re.exec(text);
    if (hit) {
      f.calendarId = c.id;
      consumed.push([hit.index, hit.index + hit[0].length]);
      return;
    }
  }
}

// Location ---------------------------------------------------------------------

function extractLocation(text: string, f: ParsedFields, consumed: [number, number][]): void {
  // Only match "at <Capitalized Word(s)>" and make sure we don't overlap with
  // a consumed span (chrono may have taken "at 7pm").
  const re = /\bat\s+([A-Z][\w'&]*(?:\s+[A-Z][\w'&]*){0,3})\b/g;
  let hit: RegExpExecArray | null;
  while ((hit = re.exec(text)) !== null) {
    const a = hit.index;
    const b = hit.index + hit[0].length;
    if (overlapsAny(a, b, consumed)) continue;
    f.location = hit[1].trim();
    consumed.push([a, b]);
    return;
  }
}

function overlapsAny(a: number, b: number, spans: [number, number][]): boolean {
  for (const [sa, sb] of spans) {
    if (a < sb && b > sa) return true;
  }
  return false;
}

// Title construction -----------------------------------------------------------

function buildTitle(text: string, spans: [number, number][]): string {
  if (!spans.length) return text.trim();
  const sorted = spans.slice().sort((x, y) => x[0] - y[0]);
  let out = "";
  let cursor = 0;
  for (const [a, b] of sorted) {
    if (a > cursor) out += text.slice(cursor, a);
    cursor = Math.max(cursor, b);
  }
  if (cursor < text.length) out += text.slice(cursor);
  // Collapse whitespace, trim, strip dangling connectors/punctuation.
  out = out.replace(/\s+/g, " ").trim();
  out = out.replace(/^[,\-—.:;\s]+|[,\-—.:;\s]+$/g, "").trim();
  // Strip leading "and" / "to" left behind after consuming phrases.
  out = out.replace(/^(and|to)\s+/i, "").trim();
  return out || text.trim();
}

// Intent inference -------------------------------------------------------------

function inferIntents(text: string, f: ParsedFields, ctx: ParseContext): SmartIntent[] {
  const set = new Set<SmartIntent>();
  set.add(intentForSegment(ctx.defaultSegment));

  const hasRemind = REMIND_PHRASE.test(text) || f.reminderOffsetMin != null;
  const hasOffset = f.reminderOffsetMin != null;
  const hasWhen = !!f.date || !!f.recurrence;

  // An event gets added when a time/date/recurrence is present AND either:
  //   - there's no reminder phrase at all (plain calendar entry), OR
  //   - the reminder has a "X before" offset (reminder is relative to a separate event).
  // "Remind me to take meds at 8am every day" is a single reminder, not event+reminder.
  if (hasWhen && (!hasRemind || hasOffset)) set.add("event");
  if (hasRemind) set.add("reminder");
  if (TASK_VERBS.test(text) || f.listId) set.add("task");

  return Array.from(set);
}

// Missing fields ---------------------------------------------------------------

function computeMissing(intents: SmartIntent[], f: ParsedFields, ctx: ParseContext): ParsedFieldKey[] {
  const missing = new Set<ParsedFieldKey>();

  if (intents.includes("event")) {
    if (!f.date) missing.add("date");
    if (!f.allDay && !f.time) missing.add("time");
    const hasCalendar = !!f.calendarId || (f.calendarIds && f.calendarIds.length > 0);
    if (ctx.calendars.length > 1 && !hasCalendar) missing.add("calendarId");
  }
  if (intents.includes("reminder")) {
    if (!f.date) missing.add("date");
    if (!f.time) missing.add("time");
    if (f.reminderOffsetMin == null) missing.add("reminderOffsetMin");
  }
  if (intents.includes("task")) {
    if (ctx.lists.length > 1 && !f.listId) missing.add("listId");
    if (ctx.lists.length === 0) missing.add("listId"); // nothing to pick from — user must create
  }

  // Ambiguous member detection surfaces this too (memberId === undefined after scan
  // AND the raw text contained a member-looking token that was rejected).
  // Keep memberId optional in general — not auto-required.

  return Array.from(missing);
}

// Confidence -------------------------------------------------------------------

function computeConfidence(f: ParsedFields, _text: string): number {
  let c = 0;
  if (f.date || f.time) c += 0.40;
  if (f.recurrence) c += 0.20;
  if (f.memberId) c += 0.10;
  if (f.listId || f.calendarId) c += 0.20;
  if (f.reminderOffsetMin != null) c += 0.10;
  return Math.min(1, c);
}

// Formatting helpers -----------------------------------------------------------

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
