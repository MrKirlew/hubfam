/**
 * SmartClarifyModal — post-parse clarifier for QuickAddBar smart input.
 *
 * Shown when natural-language parsing detected multiple intents or couldn't
 * fully specify the entity. Displays parsed summary + pre-filled form; the
 * user toggles which of event/reminder/task to create and fills any missing
 * required fields. One Create tap then creates every selected entity.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Switch,
  AccessibilityInfo, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ModalSheet from "./ModalSheet";
import { useTheme } from "../hooks/useTheme";
import type { Theme } from "../theme";
import type {
  SmartParseResult, SmartIntent, ParsedFields, ParsedFieldKey,
} from "../services/SmartInputParser";
import type { TaskRecurrence, Member, TodoList, CalendarFeed } from "../store/appStore";

interface Props {
  visible:   boolean;
  onClose:   () => void;
  parse:     SmartParseResult | null;
  members:   Pick<Member, "id" | "name" | "initials" | "color">[];
  lists:     Pick<TodoList, "id" | "name" | "icon">[];
  calendars: Pick<CalendarFeed, "id" | "name" | "color">[];
  onConfirm: (sel: { intents: SmartIntent[]; fields: ParsedFields }) => void;
}

const INTENT_META: Record<SmartIntent, { label: string; icon: string }> = {
  event:    { label: "Event",    icon: "calendar-outline" },
  reminder: { label: "Reminder", icon: "alarm-outline" },
  task:     { label: "Task",     icon: "list-outline" },
};

const RECURRENCE_OPTIONS: { key: TaskRecurrence; label: string }[] = [
  { key: "none",     label: "Once" },
  { key: "daily",    label: "Daily" },
  { key: "weekly",   label: "Weekly" },
  { key: "weekends", label: "Weekends" },
  { key: "monthly",  label: "Monthly" },
];

const REMINDER_PRESETS = [0, 5, 15, 30, 60, 1440]; // minutes; 1440 = 1 day

export default function SmartClarifyModal({
  visible, onClose, parse, members, lists, calendars, onConfirm,
}: Props) {
  const t = useTheme();
  const st = useMemo(() => getStyles(t), [t]);

  const [intents, setIntents]     = useState<SmartIntent[]>([]);
  const [fields, setFields]       = useState<ParsedFields>({ title: "" });
  const [missing, setMissing]     = useState<ParsedFieldKey[]>([]);
  const [showMore, setShowMore]   = useState(false);

  useEffect(() => {
    if (!visible || !parse) return;
    setIntents(parse.intents);
    const seed: ParsedFields = { ...parse.fields };
    // Seed calendarIds from parser's single calendarId, else auto-select the lone calendar.
    const needsCal = parse.intents.includes("event") || parse.intents.includes("reminder");
    if (needsCal) {
      if (seed.calendarId && !seed.calendarIds) {
        seed.calendarIds = [seed.calendarId];
      } else if (!seed.calendarIds && calendars.length === 1) {
        seed.calendarIds = [calendars[0].id];
      } else if (!seed.calendarIds) {
        seed.calendarIds = [];
      }
    }
    if (parse.intents.includes("task") && !seed.listId && lists.length === 1) {
      seed.listId = lists[0].id;
    }
    if (seed.reminderOffsetMin == null && parse.intents.includes("reminder")) {
      seed.reminderOffsetMin = 15;
    }
    setFields(seed);
    setMissing(parse.missingFields);

    const summary = summaryOf(seed, parse.intents);
    AccessibilityInfo.announceForAccessibility(`Parsed: ${summary}. Review and confirm.`);
  }, [visible, parse, calendars, lists]);

  if (!parse) return null;

  const toggleIntent = (i: SmartIntent) => {
    setIntents(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);
  };

  const setField = <K extends ParsedFieldKey>(key: K, val: ParsedFields[K]) => {
    setFields(f => ({ ...f, [key]: val }));
    setMissing(m => m.filter(k => k !== key));
  };

  const isMissing = (k: ParsedFieldKey) => missing.includes(k);

  const canCreate = intents.length > 0 && fields.title.trim().length > 0
    && computeStillMissing(intents, fields, { lists: lists.length, calendars: calendars.length }).length === 0;

  const handleCreate = () => {
    if (!canCreate) return;
    onConfirm({ intents, fields });
  };

  const wantEvent    = intents.includes("event");
  const wantReminder = intents.includes("reminder");
  const wantTask     = intents.includes("task");

  return (
    <ModalSheet visible={visible} onClose={onClose}>
      <Text
        style={st.summary}
        accessibilityLiveRegion="polite"
        accessibilityLabel={`Parsed: ${summaryOf(fields, intents)}`}
      >
        {summaryOf(fields, intents)}
      </Text>

      <Text style={st.sectionLabel}>Create</Text>
      <View style={st.chipRow}>
        {(Object.keys(INTENT_META) as SmartIntent[]).map(i => {
          const on = intents.includes(i);
          return (
            <TouchableOpacity
              key={i}
              style={[st.chip, on && st.chipOn]}
              onPress={() => toggleIntent(i)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={INTENT_META[i].label}
            >
              <Ionicons name={INTENT_META[i].icon as any} size={14} color={on ? t.accent : t.textFaint} />
              <Text style={[st.chipLabel, on && { color: t.accent }]}>{INTENT_META[i].label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={st.sectionLabel}>Title</Text>
      <TextInput
        style={[st.input, fields.title.trim() === "" && st.inputRequired]}
        value={fields.title}
        onChangeText={v => setField("title", v)}
        placeholder="What?"
        placeholderTextColor={t.textFaint}
        accessibilityLabel="Title"
      />

      {(wantEvent || wantReminder) && (
        <>
          <Text style={st.sectionLabel}>When</Text>
          <View style={st.chipRow}>
            {datePresets(parse.originalText).map(p => (
              <TouchableOpacity
                key={p.label}
                style={[st.chip, fields.date === p.value && st.chipOn]}
                onPress={() => setField("date", p.value)}
                accessibilityRole="button"
                accessibilityLabel={p.label}
                accessibilityState={{ selected: fields.date === p.value }}
              >
                <Text style={[st.chipLabel, fields.date === p.value && { color: t.accent }]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={st.row}>
            <TextInput
              style={[st.inputFlex, isMissing("date") && st.inputRequired]}
              value={fields.date || ""}
              onChangeText={v => setField("date", v)}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={t.textFaint}
              accessibilityLabel="Date"
              accessibilityState={{ disabled: false }}
            />
            {!fields.allDay && (
              <TextInput
                style={[st.inputFlex, isMissing("time") && st.inputRequired]}
                value={fields.time || ""}
                onChangeText={v => setField("time", v)}
                placeholder="HH:MM"
                placeholderTextColor={t.textFaint}
                accessibilityLabel="Time"
              />
            )}
          </View>
          <View style={st.switchRow}>
            <Text style={st.switchLabel}>All day</Text>
            <Switch
              value={!!fields.allDay}
              onValueChange={v => setField("allDay", v)}
              accessibilityLabel="All day"
            />
          </View>

          <Text style={st.sectionLabel}>Repeat</Text>
          <View style={st.chipRow}>
            {RECURRENCE_OPTIONS.map(o => {
              const on = (fields.recurrence ?? "none") === o.key;
              return (
                <TouchableOpacity
                  key={o.key}
                  style={[st.chip, on && st.chipOn]}
                  onPress={() => setField("recurrence", o.key === "none" ? undefined : o.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`Repeat ${o.label}`}
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[st.chipLabel, on && { color: t.accent }]}>{o.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {fields.recurrenceDays && fields.recurrenceDays.length > 0 && (
            <Text style={st.hint}>Days: {fields.recurrenceDays.map(dayName).join(", ")}</Text>
          )}
        </>
      )}

      {wantReminder && (
        <>
          <Text style={st.sectionLabel}>Remind</Text>
          <View style={st.chipRow}>
            {REMINDER_PRESETS.map(mins => {
              const on = fields.reminderOffsetMin === mins;
              return (
                <TouchableOpacity
                  key={mins}
                  style={[st.chip, on && st.chipOn, isMissing("reminderOffsetMin") && !on && st.chipRequired]}
                  onPress={() => setField("reminderOffsetMin", mins)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remind ${formatOffset(mins)}`}
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[st.chipLabel, on && { color: t.accent }]}>{formatOffset(mins)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {wantTask && lists.length > 0 && (
        <>
          <Text style={st.sectionLabel}>List</Text>
          <View style={st.chipRow}>
            {lists.map(l => {
              const on = fields.listId === l.id;
              return (
                <TouchableOpacity
                  key={l.id}
                  style={[st.chip, on && st.chipOn, isMissing("listId") && !on && st.chipRequired]}
                  onPress={() => setField("listId", l.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Add to ${l.name}`}
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[st.chipLabel, on && { color: t.accent }]}>{l.icon} {l.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {(wantEvent || wantReminder) && calendars.length > 0 && (
        <>
          <Text style={st.sectionLabel}>Calendar (pick one or more)</Text>
          <View style={st.chipRow}>
            {(() => {
              const selected = fields.calendarIds ?? [];
              const allOn = selected.length === calendars.length && calendars.length > 1;
              const toggleAll = () => {
                setField("calendarIds", allOn ? [] : calendars.map(c => c.id));
              };
              const toggleOne = (id: string, name: string) => {
                // "Family – Family" (or similar doubled-name) is treated as an alias for All.
                if (isFamilyAllAlias(name)) {
                  setField("calendarIds", allOn ? [] : calendars.map(c => c.id));
                  return;
                }
                const next = selected.includes(id)
                  ? selected.filter(x => x !== id)
                  : [...selected, id];
                setField("calendarIds", next);
              };
              return (
                <>
                  {calendars.length > 1 && (
                    <TouchableOpacity
                      style={[st.chip, allOn && st.chipOn, isMissing("calendarId") && !allOn && selected.length === 0 && st.chipRequired]}
                      onPress={toggleAll}
                      accessibilityRole="checkbox"
                      accessibilityLabel="All calendars"
                      accessibilityState={{ checked: allOn }}
                    >
                      <Text style={[st.chipLabel, allOn && { color: t.accent }]}>All</Text>
                    </TouchableOpacity>
                  )}
                  {calendars.map(c => {
                    const on = isFamilyAllAlias(c.name) ? allOn : selected.includes(c.id);
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[st.chip, on && st.chipOn, isMissing("calendarId") && !on && selected.length === 0 && st.chipRequired]}
                        onPress={() => toggleOne(c.id, c.name)}
                        accessibilityRole="checkbox"
                        accessibilityLabel={isFamilyAllAlias(c.name) ? `${c.name} (selects all calendars)` : `Use ${c.name} calendar`}
                        accessibilityState={{ checked: on }}
                      >
                        <Text style={[st.chipLabel, on && { color: t.accent }]}>{c.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </>
              );
            })()}
          </View>
        </>
      )}

      {members.length > 0 && (
        <>
          <Text style={st.sectionLabel}>For (optional)</Text>
          <View style={st.chipRow}>
            <TouchableOpacity
              style={[st.chip, !fields.memberId && st.chipOn]}
              onPress={() => setField("memberId", null)}
              accessibilityRole="button"
              accessibilityLabel="Everyone"
              accessibilityState={{ selected: !fields.memberId }}
            >
              <Text style={[st.chipLabel, !fields.memberId && { color: t.accent }]}>All</Text>
            </TouchableOpacity>
            {members.map(m => {
              const on = fields.memberId === m.id;
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[st.chip, on && { borderColor: m.color, backgroundColor: m.color + "20" }]}
                  onPress={() => setField("memberId", m.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Assign to ${m.name}`}
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[st.chipLabel, on && { color: m.color }]}>{m.initials}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      <TouchableOpacity onPress={() => setShowMore(v => !v)} style={st.moreBtn} accessibilityRole="button" accessibilityLabel={showMore ? "Hide more options" : "Show more options"}>
        <Text style={st.moreLabel}>{showMore ? "− Hide" : "+ More"}</Text>
      </TouchableOpacity>

      {showMore && (
        <>
          <Text style={st.sectionLabel}>Location</Text>
          <TextInput
            style={st.input}
            value={fields.location || ""}
            onChangeText={v => setField("location", v || undefined)}
            placeholder="Where?"
            placeholderTextColor={t.textFaint}
            accessibilityLabel="Location"
          />
          <Text style={st.sectionLabel}>Notes</Text>
          <TextInput
            style={[st.input, st.notes]}
            value={fields.notes || ""}
            onChangeText={v => setField("notes", v || undefined)}
            placeholder="Details…"
            placeholderTextColor={t.textFaint}
            multiline
            accessibilityLabel="Notes"
          />
        </>
      )}

      {parse.warnings.length > 0 && (
        <View style={st.warnBox}>
          {parse.warnings.map((w, i) => (
            <Text key={i} style={st.warnText}>⚠︎ {w}</Text>
          ))}
        </View>
      )}

      <View style={st.footer}>
        <TouchableOpacity style={st.cancelBtn} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cancel">
          <Text style={st.cancelLabel}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[st.createBtn, !canCreate && st.createBtnDisabled]}
          onPress={handleCreate}
          disabled={!canCreate}
          accessibilityRole="button"
          accessibilityLabel="Create"
          accessibilityState={{ disabled: !canCreate }}
        >
          <Text style={st.createLabel}>Create</Text>
        </TouchableOpacity>
      </View>
    </ModalSheet>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function summaryOf(f: ParsedFields, intents: SmartIntent[]): string {
  const parts: string[] = [];
  if (f.title) parts.push(f.title);
  if (f.date) parts.push(friendlyDate(f.date));
  if (f.time && !f.allDay) parts.push(friendlyTime(f.time));
  if (f.allDay && f.date) parts.push("all day");
  if (f.recurrence) parts.push(`repeats ${f.recurrence}`);
  if (f.reminderOffsetMin != null) parts.push(`remind ${formatOffset(f.reminderOffsetMin)}`);
  const kindLabel = intents.map(i => INTENT_META[i].label).join(" + ") || "Task";
  return `${kindLabel}: ${parts.join(" · ") || "(empty)"}`;
}

function datePresets(_originalText: string): { label: string; value: string }[] {
  const now = new Date();
  const today = offsetDate(now, 0);
  const tomorrow = offsetDate(now, 1);
  const nextMon = nextWeekday(now, 1);
  const sat = nextWeekday(now, 6);
  return [
    { label: "Today",        value: fmtDate(today) },
    { label: "Tomorrow",     value: fmtDate(tomorrow) },
    { label: "Saturday",     value: fmtDate(sat) },
    { label: "Next Monday",  value: fmtDate(nextMon) },
  ];
}

function offsetDate(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function nextWeekday(base: Date, weekday: number): Date {
  const d = new Date(base);
  const diff = (weekday - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d;
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function friendlyDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function friendlyTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(n => parseInt(n, 10));
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatOffset(mins: number): string {
  if (mins === 0) return "At time";
  if (mins < 60) return `${mins} min`;
  if (mins < 1440) return `${Math.round(mins / 60)} hr`;
  return `${Math.round(mins / 1440)} day`;
}

function dayName(n: number): string {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][n] || "";
}

// The Google account's "primary" calendar is often named like "Family – Family" where the
// account label and the calendar name are the same word. Users treat that row as shorthand
// for "all calendars," so clicking it selects everything rather than a single feed.
function isFamilyAllAlias(name: string): boolean {
  return /^\s*([a-z]+)\s*[-–—]\s*\1\s*$/i.test(name);
}

function computeStillMissing(
  intents: SmartIntent[],
  f: ParsedFields,
  counts: { lists: number; calendars: number },
): ParsedFieldKey[] {
  const missing: ParsedFieldKey[] = [];
  if (intents.includes("event")) {
    if (!f.date) missing.push("date");
    if (!f.allDay && !f.time) missing.push("time");
    const hasCal = (f.calendarIds && f.calendarIds.length > 0) || !!f.calendarId;
    if (counts.calendars > 1 && !hasCal) missing.push("calendarId");
  }
  if (intents.includes("reminder")) {
    if (!f.date) missing.push("date");
    if (!f.time) missing.push("time");
    if (f.reminderOffsetMin == null) missing.push("reminderOffsetMin");
  }
  if (intents.includes("task")) {
    if (counts.lists > 1 && !f.listId) missing.push("listId");
    if (counts.lists === 0) missing.push("listId");
  }
  return missing;
}

// ── Styles ────────────────────────────────────────────────────────────────────

function getStyles(t: Theme) {
  return StyleSheet.create({
    summary:       { fontSize: 13, color: t.textSub, marginBottom: 14, fontStyle: "italic" },
    sectionLabel:  { fontSize: 11, fontWeight: "700", color: t.textFaint, letterSpacing: 0.5, textTransform: "uppercase", marginTop: 10, marginBottom: 6 },
    chipRow:       { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    chip:          { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 14, backgroundColor: t.input, borderWidth: 1, borderColor: t.inputBorder, minHeight: 32 },
    chipOn:        { backgroundColor: t.accentBg, borderColor: t.accent + "66" },
    chipRequired:  { borderColor: t.error + "88", borderWidth: 1 },
    chipLabel:     { fontSize: 12, fontWeight: "500", color: t.textFaint },
    input:         { fontSize: 14, color: t.text, backgroundColor: t.input, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: t.inputBorder, minHeight: 40 },
    inputFlex:     { flex: 1, fontSize: 14, color: t.text, backgroundColor: t.input, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: t.inputBorder, minHeight: 40 },
    inputRequired: { borderColor: t.error, borderWidth: 1 },
    notes:         { minHeight: 60, textAlignVertical: "top", paddingTop: 10 },
    row:           { flexDirection: "row", gap: 8, marginTop: 6 },
    switchRow:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
    switchLabel:   { fontSize: 13, color: t.text },
    hint:          { fontSize: 11, color: t.textFaint, marginTop: 4 },
    moreBtn:       { paddingVertical: 10, alignItems: "center" },
    moreLabel:     { fontSize: 12, color: t.accent, fontWeight: "600" },
    warnBox:       { backgroundColor: t.warning + "22", padding: 8, borderRadius: 8, marginTop: 10 },
    warnText:      { fontSize: 12, color: t.warning },
    footer:        { flexDirection: "row", gap: 8, marginTop: 16 },
    cancelBtn:     { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: t.cardBorder, alignItems: "center", minHeight: 44 },
    cancelLabel:   { fontSize: 14, color: t.textSub, fontWeight: "600" },
    createBtn:     { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: t.accent, alignItems: "center", minHeight: 44 },
    createBtnDisabled: { opacity: 0.4 },
    createLabel:   { fontSize: 14, color: t.textOnAccent, fontWeight: "700" },
  });
}

// suppress unused import warning on RN-only platform tokens
void Platform;
