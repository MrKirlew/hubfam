import React, { useEffect, useState, useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useAppStore } from "../../store/appStore";
import { useTheme } from "../../hooks/useTheme";
import type { Theme } from "../../theme";

export default function ClockWidget({ compact }: { compact?: boolean }) {
  const [now, setNow] = useState(new Date());
  const t = useTheme();
  const s = useMemo(() => getStyles(t), [t]);
  const hubName = useAppStore(s => s.hubName);
  const activeProfile = useAppStore(s => s.activeProfile);
  const members = useAppStore(s => s.members);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const activeName = activeProfile === "all"
    ? "Family"
    : members.find(m => m.id === activeProfile)?.name || "";

  if (compact) {
    return (
      <View style={s.container} accessibilityRole="text" accessibilityLabel={`${timeStr}, ${dateStr}`} accessibilityLiveRegion="polite">
        <Text style={s.timeCompact}>{timeStr}</Text>
        <Text style={s.dateCompact}>{dateStr}</Text>
      </View>
    );
  }

  return (
    <View style={s.container} accessibilityRole="text" accessibilityLabel={`${timeStr}, ${dateStr}. ${greeting}${activeName ? `, ${activeName}` : ""}. ${hubName}`} accessibilityLiveRegion="polite">
      <Text style={s.time}>{timeStr}</Text>
      <Text style={s.date}>{dateStr}</Text>
      <Text style={s.greeting}>{greeting}{activeName ? `, ${activeName}` : ""}</Text>
      <Text style={s.hub}>{hubName}</Text>
    </View>
  );
}

function getStyles(t: Theme) {
  return StyleSheet.create({
    container:    { flex: 1, alignItems: "center", justifyContent: "center" },
    time:         { fontSize: 48, fontWeight: "700", color: t.text, letterSpacing: -2 },
    date:         { fontSize: 14, color: t.textSub, marginTop: 4 },
    greeting:     { fontSize: 16, color: t.text, marginTop: 12 },
    hub:          { fontSize: 11, color: t.textFaint, marginTop: 6 },
    timeCompact:  { fontSize: 24, fontWeight: "700", color: t.text, textAlign: "center" },
    dateCompact:  { fontSize: 11, color: t.textSub, textAlign: "center", marginTop: 2 },
  });
}
