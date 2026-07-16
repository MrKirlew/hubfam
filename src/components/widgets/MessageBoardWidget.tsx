import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../../store/appStore";
import { useTheme } from "../../hooks/useTheme";
import type { Theme } from "../../theme";
import { stopHubSound } from "../../services/HubSound";

function timeAgo(ts: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Dashboard widget: sticky-note board of messages sent from family phones. */
export default function MessageBoardWidget() {
  const t = useTheme();
  const s = useMemo(() => getStyles(t), [t]);
  const messages = useAppStore((st) => st.hubMessages);
  const dismiss = useAppStore((st) => st.dismissHubMessage);
  const now = Date.now();
  const visible = messages.filter(
    (m) => (!m.expiresAt || m.expiresAt > now) && (m.scheduledFor == null || m.scheduledFor <= now),
  );

  if (visible.length === 0) {
    return (
      <View style={s.empty}>
        <Ionicons name="chatbubbles-outline" size={28} color={t.textFaint} />
        <Text style={s.emptyText}>No messages yet</Text>
        <Text style={s.emptySub}>Notes and lists sent from phones appear here</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
      {visible.map((m) => (
        <View
          key={m.id}
          style={[
            s.card,
            m.kind === "alert" ? s.alertCard : null,
            m.color ? { borderLeftColor: m.color, borderLeftWidth: 4 } : null,
          ]}
          accessible
          accessibilityLabel={`Message from ${m.from === "hub" ? "Family Hub" : m.from}: ${m.title ? m.title + ". " : ""}${m.body}`}
        >
          <View style={s.cardHeader}>
            {m.kind === "alert" && <Ionicons name="alert-circle" size={16} color={t.error} style={s.alertIcon} />}
            <Text style={s.title} numberOfLines={1}>
              {m.title || (m.from === "hub" ? "Family Hub" : m.from)}
            </Text>
            <TouchableOpacity
              onPress={() => {
                stopHubSound(); // dismissing a beeping message silences it
                dismiss(m.id);
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Dismiss message"
            >
              <Ionicons name="close" size={16} color={t.textFaint} />
            </TouchableOpacity>
          </View>
          <Text style={s.body}>{m.body}</Text>
          <Text style={s.meta}>
            {m.from === "hub" ? "Family Hub" : m.from} · {timeAgo(m.ts, now)}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

function getStyles(t: Theme) {
  return StyleSheet.create({
    list: { paddingVertical: 4, gap: 8 },
    card: {
      backgroundColor: t.toolbar,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.cardBorder,
      padding: 12,
    },
    alertCard: { borderColor: t.error, backgroundColor: t.accentBg },
    alertIcon: { marginRight: 6 },
    cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
    title: { flex: 1, color: t.text, fontSize: 15, fontWeight: "700" },
    body: { color: t.textSub, fontSize: 14, lineHeight: 19 },
    meta: { color: t.textFaint, fontSize: 11, marginTop: 6 },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16 },
    emptyText: { color: t.textSub, fontSize: 15, fontWeight: "600", marginTop: 8 },
    emptySub: { color: t.textFaint, fontSize: 12, textAlign: "center", marginTop: 4 },
  });
}
