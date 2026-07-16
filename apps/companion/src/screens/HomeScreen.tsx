import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, Switch, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCompanionStore } from "../store/companionStore";
import { sendMessage } from "../services/CompanionTransportService";

type Sched = { label: string; at: number } | null;

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
  const [sched, setSched] = useState<Sched>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const onSend = useCallback(
    async (kind: "note" | "alert") => {
      if (!text.trim()) return;
      setBusy(true);
      setSent(false);
      try {
        await sendMessage(text.trim(), { kind, loud, scheduledFor: sched?.at ?? null });
        setText("");
        setLoud(false);
        setSched(null);
        setSent(true);
        setTimeout(() => setSent(false), 2500);
      } catch (e: any) {
        Alert.alert("Couldn't send", e?.message ?? String(e));
      } finally {
        setBusy(false);
      }
    },
    [text, loud, sched],
  );

  const dot = connection === "offline" ? "#f87171" : "#34d399";
  const label = connection === "ble" ? "Bluetooth" : connection === "cloud" ? "Online" : "Connecting…";
  const disabled = busy || !text.trim();

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

        <Text style={styles.optLabel}>Schedule</Text>
        <View style={styles.chips}>
          <TouchableOpacity style={[styles.chip, !sched && styles.chipActive]} onPress={() => setSched(null)}>
            <Text style={[styles.chipText, !sched && styles.chipTextActive]}>Now</Text>
          </TouchableOpacity>
          {presets().map((p) => (
            <TouchableOpacity
              key={p.label}
              style={[styles.chip, sched?.label === p.label && styles.chipActive]}
              onPress={() => setSched(p)}
            >
              <Text style={[styles.chipText, sched?.label === p.label && styles.chipTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {sched && <Text style={styles.schedNote}>Will deliver {fmt(sched.at)}</Text>}
        {sent && <Text style={styles.sentMsg}>✓ {sched ? "Scheduled" : "Sent"} to the hub</Text>}

        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.primaryBtn, disabled && styles.disabled]}
            disabled={disabled}
            onPress={() => onSend("note")}
            accessibilityRole="button"
            accessibilityLabel="Send note"
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{sched ? "Schedule note" : "Send note"}</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.alertBtn, disabled && styles.disabled]}
            disabled={disabled}
            onPress={() => onSend("alert")}
            accessibilityRole="button"
            accessibilityLabel="Send alert"
          >
            <Text style={styles.btnText}>{sched ? "Schedule alert" : "Send alert"}</Text>
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
  sentMsg: { color: "#34d399", fontSize: 14, fontWeight: "600" },
  row: { flexDirection: "row", gap: 12, marginTop: 4 },
  primaryBtn: { flex: 1, backgroundColor: "#60a5fa", borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  alertBtn: { flex: 1, backgroundColor: "#f87171", borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.45 },
});
