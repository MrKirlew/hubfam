import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCompanionStore } from "../store/companionStore";
import { sendMessage } from "../services/CompanionTransportService";

export default function HomeScreen() {
  const connection = useCompanionStore((s) => s.connection);
  const memberName = useCompanionStore((s) => s.memberName);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const onSend = useCallback(
    async (kind: "note" | "alert") => {
      if (!text.trim()) return;
      setBusy(true);
      setSent(false);
      try {
        await sendMessage(text.trim(), kind);
        setText("");
        setSent(true);
        setTimeout(() => setSent(false), 2500);
      } catch (e: any) {
        Alert.alert("Couldn't send", e?.message ?? String(e));
      } finally {
        setBusy(false);
      }
    },
    [text],
  );

  const dot = connection === "offline" ? "#f87171" : "#34d399";
  const label = connection === "ble" ? "Bluetooth" : connection === "cloud" ? "Online" : "Connecting…";

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

      <View style={styles.body}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Type a message for the hub…"
          placeholderTextColor="#5b6478"
          multiline
        />
        {sent && <Text style={styles.sentMsg}>✓ Sent to the hub</Text>}
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.primaryBtn, (busy || !text.trim()) && styles.disabled]}
            disabled={busy || !text.trim()}
            onPress={() => onSend("note")}
            accessibilityRole="button"
            accessibilityLabel="Send note"
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Send note</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.alertBtn, (busy || !text.trim()) && styles.disabled]}
            disabled={busy || !text.trim()}
            onPress={() => onSend("alert")}
            accessibilityRole="button"
            accessibilityLabel="Send alert"
          >
            <Text style={styles.btnText}>Send alert</Text>
          </TouchableOpacity>
        </View>
      </View>
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
    minHeight: 120,
    textAlignVertical: "top",
  },
  sentMsg: { color: "#34d399", fontSize: 14, fontWeight: "600" },
  row: { flexDirection: "row", gap: 12 },
  primaryBtn: { flex: 1, backgroundColor: "#60a5fa", borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  alertBtn: { flex: 1, backgroundColor: "#f87171", borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.45 },
});
