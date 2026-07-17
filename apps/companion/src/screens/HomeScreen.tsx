import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, Switch, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { MessageRepeat } from "@familyhub/shared";
import { useCompanionStore } from "../store/companionStore";
import { sendMessage } from "../services/CompanionTransportService";

type Sched = { label: string; at: number } | null;

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** 12h fields → 24h {hh, mm}, or null when out of range / not a number. */
function to24h(hour: string, minute: string, ampm: "AM" | "PM"): { hh: number; mm: number } | null {
  const h = Number(hour);
  const m = Number(minute);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 1 || h > 12 || m < 0 || m > 59) return null;
  const hh = ampm === "PM" ? (h % 12) + 12 : h % 12;
  return { hh, mm: m };
}

/** Epoch ms of the soonest future occurrence of hh:mm on one of `days` (local clock). */
function nextOccurrence(days: number[], hh: number, mm: number): number {
  const now = Date.now();
  for (let ahead = 0; ahead <= 7; ahead++) {
    const d = new Date(now + ahead * 86400e3);
    d.setHours(hh, mm, 0, 0);
    if (d.getTime() > now && days.includes(d.getDay())) return d.getTime();
  }
  return now; // unreachable with a non-empty days set
}

function dayList(days: number[]): string {
  return days.length === 7 ? "day" : [...days].sort((a, b) => a - b).map((d) => DAY_NAMES[d]).join(", ");
}

function presets(): { label: string; at: number }[] {
  const now = Date.now();
  const evening = new Date();
  evening.setHours(18, 0, 0, 0);
  if (evening.getTime() <= now) evening.setDate(evening.getDate() + 1);
  const tomorrowAm = new Date();
  tomorrowAm.setDate(tomorrowAm.getDate() + 1);
  tomorrowAm.setHours(8, 0, 0, 0);
  return [
    { label: "In 1 hour", at: now + 3600e3 },
    { label: "In 3 hours", at: now + 3 * 3600e3 },
    { label: "This evening", at: evening.getTime() },
    { label: "Tomorrow AM", at: tomorrowAm.getTime() },
  ];
}

function fmt(at: number): string {
  const d = new Date(at);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${days[d.getDay()]} ${h}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export default function HomeScreen() {
  const connection = useCompanionStore((s) => s.connection);
  const memberName = useCompanionStore((s) => s.memberName);
  const [text, setText] = useState("");
  const [loud, setLoud] = useState(false);
  const [vol, setVol] = useState(1); // hub sound volume 0–1
  const [secs, setSecs] = useState(0); // 0 = play once
  const [sched, setSched] = useState<Sched>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  // Custom schedule: any time + any set of weekdays, one-shot or repeating weekly.
  const [custom, setCustom] = useState(false);
  const [days, setDays] = useState<number[]>([]);
  const [hour, setHour] = useState("8");
  const [minute, setMinute] = useState("00");
  const [ampm, setAmpm] = useState<"AM" | "PM">("AM");
  const [weekly, setWeekly] = useState(false);

  const customTime = custom ? to24h(hour, minute, ampm) : null;
  const customReady = custom && customTime != null && days.length > 0;

  const toggleDay = (d: number) =>
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  const onSend = useCallback(
    async (kind: "note" | "alert") => {
      if (!text.trim()) return;
      let scheduledFor: number | null = sched?.at ?? null;
      let repeat: MessageRepeat | null = null;
      if (custom) {
        const t24 = to24h(hour, minute, ampm);
        if (!t24) {
          Alert.alert("Check the time", "Enter a time like 7:30 (hour 1–12, minutes 00–59).");
          return;
        }
        if (days.length === 0) {
          Alert.alert("Pick a day", "Choose at least one day of the week.");
          return;
        }
        const time = `${String(t24.hh).padStart(2, "0")}:${String(t24.mm).padStart(2, "0")}`;
        if (weekly) repeat = { days: [...days].sort((a, b) => a - b), time };
        else scheduledFor = nextOccurrence(days, t24.hh, t24.mm);
      }
      const sentLabel = scheduledFor != null || repeat ? "Scheduled" : "Sent";
      setBusy(true);
      setSent(null);
      try {
        await sendMessage(text.trim(), {
          kind,
          loud,
          soundVolume: vol < 1 ? vol : undefined,
          soundSeconds: secs > 0 ? secs : undefined,
          scheduledFor,
          repeat,
        });
        setText("");
        setLoud(false);
        setVol(1);
        setSecs(0);
        setSched(null);
        setCustom(false);
        setDays([]);
        setWeekly(false);
        setSent(sentLabel);
        setTimeout(() => setSent(null), 2500);
      } catch (e: any) {
        Alert.alert("Couldn't send", e?.message ?? String(e));
      } finally {
        setBusy(false);
      }
    },
    [text, loud, vol, secs, sched, custom, days, hour, minute, ampm, weekly],
  );

  const dot = connection === "offline" ? "#f87171" : "#34d399";
  const label = connection === "ble" ? "Bluetooth" : connection === "cloud" ? "Online" : "Connecting…";
  const disabled = busy || !text.trim() || (custom && !customReady);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Send to Family Hub</Text>
          <Text style={styles.sub}>as {memberName}</Text>
        </View>
        <View style={styles.status}>
          <View style={[styles.dot, { backgroundColor: dot }]} />
          <Text style={styles.statusText}>{label}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Type a message for the hub…"
          placeholderTextColor="#5b6478"
          multiline
        />

        <View style={styles.optRow}>
          <Text style={styles.optLabel}>🔊 Make it loud (play a sound on the hub)</Text>
          <Switch value={loud} onValueChange={setLoud} />
        </View>

        <Text style={styles.optLabel}>Hub sound — volume (loud notes &amp; alerts)</Text>
        <View style={styles.chips}>
          {[0.25, 0.5, 0.75, 1].map((v) => (
            <TouchableOpacity
              key={v}
              style={[styles.chip, vol === v && styles.chipActive]}
              onPress={() => setVol(v)}
              accessibilityRole="button"
              accessibilityLabel={`Hub sound volume ${Math.round(v * 100)} percent`}
              accessibilityState={{ selected: vol === v }}
            >
              <Text style={[styles.chipText, vol === v && styles.chipTextActive]}>{Math.round(v * 100)}%</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.optLabel}>Hub sound — beep for (until someone dismisses it)</Text>
        <View style={styles.chips}>
          {[
            { label: "Once", s: 0 },
            { label: "10s", s: 10 },
            { label: "30s", s: 30 },
            { label: "1 min", s: 60 },
          ].map((o) => (
            <TouchableOpacity
              key={o.label}
              style={[styles.chip, secs === o.s && styles.chipActive]}
              onPress={() => setSecs(o.s)}
              accessibilityRole="button"
              accessibilityLabel={`Beep ${o.label}`}
              accessibilityState={{ selected: secs === o.s }}
            >
              <Text style={[styles.chipText, secs === o.s && styles.chipTextActive]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.optLabel}>Schedule</Text>
        <View style={styles.chips}>
          <TouchableOpacity
            style={[styles.chip, !sched && !custom && styles.chipActive]}
            onPress={() => {
              setSched(null);
              setCustom(false);
            }}
          >
            <Text style={[styles.chipText, !sched && !custom && styles.chipTextActive]}>Now</Text>
          </TouchableOpacity>
          {presets().map((p) => (
            <TouchableOpacity
              key={p.label}
              style={[styles.chip, !custom && sched?.label === p.label && styles.chipActive]}
              onPress={() => {
                setSched(p);
                setCustom(false);
              }}
            >
              <Text style={[styles.chipText, !custom && sched?.label === p.label && styles.chipTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.chip, custom && styles.chipActive]}
            onPress={() => {
              setCustom(true);
              setSched(null);
            }}
            accessibilityRole="button"
            accessibilityLabel="Custom schedule"
            accessibilityState={{ selected: custom }}
          >
            <Text style={[styles.chipText, custom && styles.chipTextActive]}>Custom…</Text>
          </TouchableOpacity>
        </View>

        {custom && (
          <View style={styles.customPanel}>
            <Text style={styles.optLabel}>Days of the week</Text>
            <View style={styles.chips}>
              {DAY_LETTERS.map((letter, d) => (
                <TouchableOpacity
                  key={d}
                  style={[styles.dayChip, days.includes(d) && styles.chipActive]}
                  onPress={() => toggleDay(d)}
                  accessibilityRole="checkbox"
                  accessibilityLabel={DAY_NAMES[d]}
                  accessibilityState={{ checked: days.includes(d) }}
                >
                  <Text style={[styles.chipText, days.includes(d) && styles.chipTextActive]}>{letter}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.optLabel}>Time</Text>
            <View style={styles.timeRow}>
              <TextInput
                style={styles.timeInput}
                value={hour}
                onChangeText={setHour}
                keyboardType="number-pad"
                maxLength={2}
                accessibilityLabel="Hour"
              />
              <Text style={styles.timeColon}>:</Text>
              <TextInput
                style={styles.timeInput}
                value={minute}
                onChangeText={setMinute}
                keyboardType="number-pad"
                maxLength={2}
                accessibilityLabel="Minutes"
              />
              {(["AM", "PM"] as const).map((half) => (
                <TouchableOpacity
                  key={half}
                  style={[styles.chip, ampm === half && styles.chipActive]}
                  onPress={() => setAmpm(half)}
                  accessibilityRole="button"
                  accessibilityLabel={half}
                  accessibilityState={{ selected: ampm === half }}
                >
                  <Text style={[styles.chipText, ampm === half && styles.chipTextActive]}>{half}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.optRow}>
              <Text style={styles.optLabel}>↻ Repeat every week</Text>
              <Switch value={weekly} onValueChange={setWeekly} />
            </View>
          </View>
        )}

        {custom && customReady && (
          <Text style={styles.schedNote}>
            {weekly
              ? `Repeats every ${dayList(days)} at ${hour}:${minute.padStart(2, "0")} ${ampm} until dismissed on the hub`
              : `Will deliver ${fmt(nextOccurrence(days, customTime!.hh, customTime!.mm))}`}
          </Text>
        )}
        {!custom && sched && <Text style={styles.schedNote}>Will deliver {fmt(sched.at)}</Text>}
        {sent && <Text style={styles.sentMsg}>✓ {sent} to the hub</Text>}

        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.primaryBtn, disabled && styles.disabled]}
            disabled={disabled}
            onPress={() => onSend("note")}
            accessibilityRole="button"
            accessibilityLabel="Send note"
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{sched || custom ? "Schedule note" : "Send note"}</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.alertBtn, disabled && styles.disabled]}
            disabled={disabled}
            onPress={() => onSend("alert")}
            accessibilityRole="button"
            accessibilityLabel="Send alert"
          >
            <Text style={styles.btnText}>{sched || custom ? "Schedule alert" : "Send alert"}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#080c18" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,.06)",
  },
  title: { color: "#e8eeff", fontSize: 20, fontWeight: "800" },
  sub: { color: "rgba(232,238,255,.5)", fontSize: 13, marginTop: 2 },
  status: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  statusText: { color: "rgba(232,238,255,.6)", fontSize: 13 },
  body: { padding: 20, gap: 14 },
  input: {
    backgroundColor: "rgba(255,255,255,.06)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.08)",
    color: "#e8eeff",
    fontSize: 17,
    padding: 16,
    minHeight: 110,
    textAlignVertical: "top",
  },
  optRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  optLabel: { color: "rgba(232,238,255,.75)", fontSize: 14, flexShrink: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.12)",
    backgroundColor: "rgba(255,255,255,.05)",
  },
  chipActive: { backgroundColor: "#60a5fa", borderColor: "#60a5fa" },
  chipText: { color: "rgba(232,238,255,.7)", fontSize: 14, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  schedNote: { color: "#60a5fa", fontSize: 13 },
  customPanel: {
    backgroundColor: "rgba(255,255,255,.04)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.08)",
    padding: 14,
    gap: 12,
  },
  dayChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.12)",
    backgroundColor: "rgba(255,255,255,.05)",
  },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  timeInput: {
    backgroundColor: "rgba(255,255,255,.06)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.08)",
    color: "#e8eeff",
    fontSize: 17,
    fontWeight: "600",
    width: 56,
    textAlign: "center",
    paddingVertical: 10,
  },
  timeColon: { color: "#e8eeff", fontSize: 18, fontWeight: "700" },
  sentMsg: { color: "#34d399", fontSize: 14, fontWeight: "600" },
  row: { flexDirection: "row", gap: 12, marginTop: 4 },
  primaryBtn: { flex: 1, backgroundColor: "#60a5fa", borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  alertBtn: { flex: 1, backgroundColor: "#f87171", borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.45 },
});
