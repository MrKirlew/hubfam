import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../../store/appStore";
import type { WidgetConfig } from "../../store/appStore";
import { useTheme } from "../../hooks/useTheme";
import type { Theme } from "../../theme";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12} ${period}` : `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function getMonthGrid(year: number, month: number): (number | null)[][] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

export default function MonthCalendarWidget({ config, compact }: { config: WidgetConfig; compact?: boolean }) {
  const events = useAppStore(s => s.events);
  const members = useAppStore(s => s.members);
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const t = useTheme();
  const s = useMemo(() => getStyles(t), [t]);

  const weeks = getMonthGrid(viewYear, viewMonth);
  const monthName = new Date(viewYear, viewMonth).toLocaleString("en-US", { month: compact ? "short" : "long" });
  const todayStr = fmtDate(today);

  const getEventsForDay = (day: number) => {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return events
      .filter(e => e.date === dateStr)
      .filter(e => !config.memberId || e.memberId === config.memberId || e.memberId === null);
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
    setSelectedDay(null);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
    setSelectedDay(null);
  };

  const selectedEvents = selectedDay ? getEventsForDay(selectedDay) : [];
  const getMemberColor = (memberId: string | null): string => {
    if (!memberId) return t.accent;
    return members.find(m => m.id === memberId)?.color || t.accent;
  };

  const fontSize = compact ? 9 : 12;

  return (
    <View style={s.container}>
      {/* Month header */}
      <View style={s.header}>
        <TouchableOpacity onPress={prevMonth} style={s.navBtn}>
          <Ionicons name="chevron-back" size={compact ? 14 : 18} color={t.textSub} />
        </TouchableOpacity>
        <Text style={[s.monthTitle, compact && { fontSize: 12 }]}>
          {monthName} {viewYear}
        </Text>
        <TouchableOpacity onPress={nextMonth} style={s.navBtn}>
          <Ionicons name="chevron-forward" size={compact ? 14 : 18} color={t.textSub} />
        </TouchableOpacity>
      </View>

      {/* Day labels */}
      <View style={s.row}>
        {DAY_LABELS.map((d, i) => (
          <View key={i} style={s.cell}>
            <Text style={[s.dayLabel, { fontSize: compact ? 8 : 10 }]}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Calendar grid */}
      <View style={s.gridContainer}>
        {weeks.map((week, wi) => (
          <View key={wi} style={s.weekRow}>
            {week.map((day, di) => {
              if (day === null) return <View key={di} style={s.cell} />;
              const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isToday = dateStr === todayStr;
              const isSelected = day === selectedDay;
              const eventCount = getEventsForDay(day).length;
              return (
                <TouchableOpacity
                  key={di}
                  style={[s.cell, isToday && s.todayCell, isSelected && s.selectedCell]}
                  onPress={() => setSelectedDay(day === selectedDay ? null : day)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.dayNum, { fontSize }, isToday && s.todayNum, isSelected && s.selectedNum]}>
                    {day}
                  </Text>
                  {eventCount > 0 && !compact && (
                    <View style={s.dotRow}>
                      {Array(Math.min(eventCount, 3)).fill(0).map((_, i) => (
                        <View key={i} style={s.eventDot} />
                      ))}
                    </View>
                  )}
                  {eventCount > 0 && compact && (
                    <View style={[s.eventDot, { alignSelf: "center" }]} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      {/* Selected day events */}
      {!compact && selectedDay !== null && (
        <ScrollView style={s.eventList} nestedScrollEnabled>
          {selectedEvents.length === 0 ? (
            <Text style={s.noEvents}>No events on {monthName} {selectedDay}</Text>
          ) : (
            selectedEvents.map(e => (
              <View key={e.id} style={s.eventRow}>
                <View style={[s.eDot, { backgroundColor: getMemberColor(e.memberId) }]} />
                <Text style={s.eTitle} numberOfLines={1}>{e.title}</Text>
                <Text style={s.eTime}>{e.allDay ? "All day" : formatTime(e.time)}</Text>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

function getStyles(t: Theme) {
  return StyleSheet.create({
    container:     { flex: 1 },
    header:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
    monthTitle:    { fontSize: 14, fontWeight: "700", color: t.text },
    navBtn:        { padding: 4 },
    row:           { flexDirection: "row" },
    cell:          { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 1 },
    weekRow:       { flexDirection: "row", flex: 1 },
    gridContainer: { flex: 1 },
    todayCell:     { backgroundColor: t.accentBg, borderRadius: 4 },
    selectedCell:  { backgroundColor: t.accent + "4D", borderRadius: 4 },
    dayLabel:      { fontWeight: "600", color: t.textFaint, textAlign: "center" },
    dayNum:        { fontWeight: "500", textAlign: "center", color: t.text },
    todayNum:      { color: t.accent, fontWeight: "700" },
    selectedNum:   { color: t.textOnAccent, fontWeight: "700" },
    dotRow:        { flexDirection: "row", gap: 1, marginTop: 1 },
    eventDot:      { width: 3, height: 3, borderRadius: 2, backgroundColor: t.accent },
    eventList:     { flex: 1, marginTop: 4, borderTopWidth: 1, borderTopColor: t.divider, paddingTop: 4 },
    noEvents:      { fontSize: 10, color: t.textFaint, textAlign: "center", paddingVertical: 4 },
    eventRow:      { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 3 },
    eDot:          { width: 5, height: 5, borderRadius: 3 },
    eTitle:        { flex: 1, fontSize: 10, color: t.text },
    eTime:         { fontSize: 9, color: t.textSub },
  });
}
