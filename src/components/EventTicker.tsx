import React, { useEffect, useRef, useState, useMemo } from "react";
import { View, Text, StyleSheet, Animated, Easing } from "react-native";
import { useAppStore } from "../store/appStore";
import { useTheme } from "../hooks/useTheme";
import type { Theme } from "../theme";

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export default function EventTicker() {
  const events = useAppStore(s => s.events);
  const today = fmtDate(new Date());
  const scrollX = useRef(new Animated.Value(0)).current;
  const [blink, setBlink] = useState(true);
  const t = useTheme();
  const s = useMemo(() => getStyles(t), [t]);

  const todayEvents = events
    .filter(e => e.date === today)
    .sort((a, b) => a.time.localeCompare(b.time));

  useEffect(() => {
    if (todayEvents.length >= 3) {
      const timer = setInterval(() => setBlink(b => !b), 800);
      return () => clearInterval(timer);
    }
  }, [todayEvents.length]);

  useEffect(() => {
    if (todayEvents.length === 0) return;
    const textWidth = todayEvents.length * 250;
    scrollX.setValue(400);
    const anim = Animated.loop(
      Animated.timing(scrollX, {
        toValue: -textWidth,
        duration: todayEvents.length * 6000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [todayEvents.length, scrollX]);

  if (todayEvents.length === 0) return null;

  const tickerText = todayEvents
    .map(e => `${e.allDay ? "All day" : formatTime(e.time)} — ${e.title}`)
    .join("     \u2022     ");

  const isImportant = todayEvents.length >= 3;

  return (
    <View style={[s.container, isImportant && blink && s.importantBg]} accessibilityRole="text" accessibilityLabel={`Today's events: ${tickerText}`}>
      {isImportant && (
        <Text style={s.urgentDot}>{blink ? "\u26A0" : " "}</Text>
      )}
      <View style={s.scrollArea}>
        <Animated.Text
          style={[s.tickerText, { transform: [{ translateX: scrollX }] }]}
          numberOfLines={1}
        >
          {tickerText}
        </Animated.Text>
      </View>
    </View>
  );
}

function getStyles(t: Theme) {
  return StyleSheet.create({
    container:    { flexDirection: "row", alignItems: "center", marginHorizontal: 8,
                    paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8,
                    backgroundColor: t.isDark ? "rgba(255,255,255,.03)" : "rgba(10,32,48,.03)", overflow: "hidden" },
    importantBg:  { backgroundColor: t.warning + "14" },
    urgentDot:    { fontSize: 12, marginRight: 6 },
    scrollArea:   { flex: 1, overflow: "hidden", height: 18 },
    tickerText:   { fontSize: 12, color: t.textSub, position: "absolute" },
  });
}
