/**
 * CalendarScreen.tsx — Weekly calendar with member filtering
 *
 * Shows a 7-day strip, event list for selected day,
 * and filter chips to show/hide events by member.
 */

import React, { useState, useMemo, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../store/appStore";
import { performSync } from "../services/SyncOrchestrator";
import { useTheme } from "../hooks/useTheme";
import type { Theme } from "../theme";

const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

function getWeekDays(baseDate: Date): Date[] {
  const days: Date[] = [];
  const start = new Date(baseDate);
  start.setDate(start.getDate() - start.getDay());
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

export default function CalendarScreen() {
  const t = useTheme();
  const s = useMemo(() => getStyles(t), [t]);

  const members   = useAppStore(s2 => s2.members);
  const events    = useAppStore(s2 => s2.events);
  const isSyncing = useAppStore(s2 => s2.isSyncing);

  const onRefresh = useCallback(() => { performSync(); }, []);

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekOffset, setWeekOffset] = useState(0);
  const [enabledMembers, setEnabledMembers] = useState<Set<string>>(new Set(["all", ...members.map(m => m.id)]));

  const baseDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const weekDays = useMemo(() => getWeekDays(baseDate), [baseDate]);
  const today = fmt(new Date());
  const selected = fmt(selectedDate);

  console.log(`[CalendarScreen] Store has ${events.length} events. Selected day: ${selected}. Filter includes: ${Array.from(enabledMembers).join(",")}`);

  const toggleMember = (id: string) => {
    setEnabledMembers(prev => {
      const next = new Set(prev);
      if (id === "all") {
        if (next.has("all")) {
          next.clear();
        } else {
          next.add("all");
          members.forEach(m => next.add(m.id));
        }
      } else {
        if (next.has(id)) next.delete(id); else next.add(id);
        if (members.every(m => next.has(m.id))) next.add("all");
        else next.delete("all");
      }
      return next;
    });
  };

  const dayEvents = events
    .filter(e => e.date === selected)
    .filter(e => e.memberId === null || enabledMembers.has(e.memberId))
    .sort((a, b) => {
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return a.time.localeCompare(b.time);
    });

  const getMember = (id: string | null) => members.find(m => m.id === id);

  // Count events per day for dots
  const eventCountByDay = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const ev of events) {
      if (ev.memberId === null || enabledMembers.has(ev.memberId)) {
        counts[ev.date] = (counts[ev.date] || 0) + 1;
      }
    }
    return counts;
  }, [events, enabledMembers]);

  return (
    <SafeAreaView style={s.container}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={isSyncing} onRefresh={onRefresh} tintColor={t.accent} colors={[t.accent]} />}
      >

        {/* Header */}
        <View style={s.headerRow}>
          <Text style={s.header}>Calendar</Text>
          <Text style={s.monthLabel}>
            {MONTH_NAMES[baseDate.getMonth()]} {baseDate.getFullYear()}
          </Text>
        </View>

        {/* Week navigation */}
        <View style={s.weekNav}>
          <TouchableOpacity onPress={() => setWeekOffset(w => w - 1)} style={s.navBtn}>
            <Ionicons name="chevron-back" size={20} color={t.accent} />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => { setWeekOffset(0); setSelectedDate(new Date()); }} style={s.todayBtn}>
            <Text style={s.todayBtnText}>Today</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setWeekOffset(w => w + 1)} style={s.navBtn}>
            <Ionicons name="chevron-forward" size={20} color={t.accent} />
          </TouchableOpacity>
        </View>

        {/* Day strip */}
        <View style={s.dayStrip}>
          {weekDays.map(d => {
            const ds = fmt(d);
            const isToday = ds === today;
            const isSelected = ds === selected;
            const evCount = eventCountByDay[ds] || 0;
            return (
              <TouchableOpacity
                key={ds}
                style={[
                  s.dayCell,
                  isSelected && s.dayCellSelected,
                  isToday && !isSelected && s.dayCellToday,
                ]}
                onPress={() => setSelectedDate(d)}
              >
                <Text style={[s.dayName, isSelected && s.dayTextSelected]}>
                  {DAY_NAMES[d.getDay()]}
                </Text>
                <Text style={[s.dayNum, isSelected && s.dayTextSelected, isToday && s.dayNumToday]}>
                  {d.getDate()}
                </Text>
                {evCount > 0 && (
                  <View style={[s.dayDots]}>
                    {Array.from({ length: Math.min(evCount, 3) }).map((_, i) => (
                      <View key={i} style={[s.dayDot, isSelected && { backgroundColor: t.textOnAccent }]} />
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Member filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll} contentContainerStyle={s.filterRow}>
          <TouchableOpacity
            style={[s.filterChip, enabledMembers.has("all") && s.filterChipActive]}
            onPress={() => toggleMember("all")}
          >
            <Text style={[s.filterChipText, enabledMembers.has("all") && s.filterChipTextActive]}>All</Text>
          </TouchableOpacity>
          {members.map(m => (
            <TouchableOpacity
              key={m.id}
              style={[
                s.filterChip,
                enabledMembers.has(m.id) && { backgroundColor: m.color + "22", borderColor: m.color + "55" },
              ]}
              onPress={() => toggleMember(m.id)}
            >
              <View style={[s.filterDot, { backgroundColor: m.color }]} />
              <Text style={[s.filterChipText, enabledMembers.has(m.id) && { color: m.color }]}>{m.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Events for selected day */}
        <Text style={s.sectionTitle}>
          {selected === today ? "Today" : selected === fmt(new Date(Date.now() + 86400000)) ? "Tomorrow" : selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </Text>

        <View style={s.card}>
          {dayEvents.length === 0 ? (
            <View style={s.emptyRow}>
              <Ionicons name="calendar-outline" size={20} color={t.textFaint} />
              <Text style={s.emptyText}>No events scheduled</Text>
            </View>
          ) : (
            dayEvents.map((ev, i) => {
              const member = getMember(ev.memberId);
              const color = member?.color || t.warning;
              return (
                <View key={ev.id} style={[s.eventRow, i < dayEvents.length - 1 && s.rowBorder]}>
                  <View style={[s.timeBadge, { backgroundColor: color + "18", borderColor: color + "44" }]}>
                    <Text style={[s.timeText, { color }]}>{ev.allDay ? "ALL\nDAY" : ev.time}</Text>
                  </View>
                  <View style={s.eventInfo}>
                    <Text style={s.eventTitle}>{ev.title}</Text>
                    <Text style={s.eventMeta}>
                      {member ? member.name : "Family"}
                      {ev.location ? ` · ${ev.location}` : ""}
                    </Text>
                  </View>
                  {ev.reminder && (
                    <View style={s.reminderBadge}>
                      <Ionicons name="notifications-outline" size={12} color={t.textFaint} />
                      <Text style={s.reminderText}>{ev.reminder}m</Text>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

function getStyles(t: Theme) {
  return StyleSheet.create({
    container:    { flex: 1, backgroundColor: t.bg },
    scroll:       { padding: 24, paddingBottom: 40 },

    headerRow:    { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 },
    header:       { fontSize: 28, fontWeight: "700", color: t.text },
    monthLabel:   { fontSize: 15, color: t.textSub, fontWeight: "500" },

    weekNav:      { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 16, marginBottom: 16 },
    navBtn:       { padding: 8 },
    todayBtn:     { backgroundColor: t.accentBg, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 6 },
    todayBtnText: { color: t.accent, fontSize: 13, fontWeight: "600" },

    dayStrip:     { flexDirection: "row", gap: 6, marginBottom: 16 },
    dayCell:      { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 12,
                    backgroundColor: t.card, gap: 2 },
    dayCellSelected: { backgroundColor: t.accent },
    dayCellToday:    { borderWidth: 1, borderColor: t.accent },
    dayName:      { fontSize: 11, color: t.textSub, fontWeight: "500" },
    dayNum:       { fontSize: 18, fontWeight: "700", color: t.text },
    dayNumToday:  { color: t.accent },
    dayTextSelected: { color: t.textOnAccent },
    dayDots:      { flexDirection: "row", gap: 3, marginTop: 2 },
    dayDot:       { width: 4, height: 4, borderRadius: 2, backgroundColor: t.accent },

    filterScroll: { marginBottom: 16, flexGrow: 0 },
    filterRow:    { gap: 8, paddingRight: 8 },
    filterChip:   { flexDirection: "row", alignItems: "center", gap: 6,
                    backgroundColor: t.input, borderWidth: 1,
                    borderColor: t.cardBorder, borderRadius: 20,
                    paddingHorizontal: 14, paddingVertical: 6 },
    filterChipActive:     { backgroundColor: t.accentBg, borderColor: t.accent + "4D" },
    filterChipText:       { fontSize: 13, color: t.textSub, fontWeight: "500" },
    filterChipTextActive: { color: t.accent },
    filterDot:    { width: 8, height: 8, borderRadius: 4 },

    sectionTitle: { fontSize: 13, fontWeight: "600", color: t.textSub,
                    letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 },

    card:         { backgroundColor: t.input, borderWidth: 1,
                    borderColor: t.cardBorder, borderRadius: 16, overflow: "hidden", marginBottom: 16 },

    eventRow:     { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
    rowBorder:    { borderBottomWidth: 1, borderBottomColor: t.cardBorder },
    timeBadge:    { width: 54, height: 44, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
    timeText:     { fontSize: 13, fontWeight: "700", textAlign: "center" },
    eventInfo:    { flex: 1 },
    eventTitle:   { fontSize: 15, fontWeight: "600", color: t.text },
    eventMeta:    { fontSize: 12, color: t.textSub, marginTop: 2 },

    reminderBadge:{ flexDirection: "row", alignItems: "center", gap: 3 },
    reminderText: { fontSize: 11, color: t.textFaint },

    emptyRow:     { flexDirection: "row", alignItems: "center", padding: 24, gap: 10, justifyContent: "center" },
    emptyText:    { fontSize: 14, color: t.textFaint },
  });
}
