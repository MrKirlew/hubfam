import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../../store/appStore";
import type { WidgetConfig } from "../../store/appStore";
import { useTheme } from "../../hooks/useTheme";
import type { Theme } from "../../theme";

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${hour12} ${period}` : `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export default function CalendarListWidget({ config }: { config: WidgetConfig }) {
  const events = useAppStore(s => s.events);
  const members = useAppStore(s => s.members);
  const lists = useAppStore(s => s.lists);
  const toggleTodoItem = useAppStore(s => s.toggleTodoItem);
  const t = useTheme();
  const s = useMemo(() => getStyles(t), [t]);

  const today = fmtDate(new Date());
  const todayEvents = events
    .filter(e => e.date === today)
    .filter(e => !config.memberId || e.memberId === config.memberId || e.memberId === null)
    .sort((a, b) => {
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return a.time.localeCompare(b.time);
    });

  const list = config.listId ? lists.find(l => l.id === config.listId) : null;

  const getMemberColor = (memberId: string | null): string => {
    if (!memberId) return t.accent;
    return members.find(m => m.id === memberId)?.color || t.accent;
  };

  return (
    <View style={s.container}>
      <ScrollView style={s.scroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {/* Calendar section */}
        <View style={s.sectionHeader}>
          <Ionicons name="calendar-outline" size={16} color={t.accent} />
          <Text style={s.sectionTitle}>Today</Text>
          <Text style={s.sectionCount}>{todayEvents.length}</Text>
        </View>
        {todayEvents.length === 0 ? (
          <Text style={s.empty}>No events today</Text>
        ) : (
          todayEvents.slice(0, 5).map(e => (
            <View key={e.id} style={s.eventRow}>
              <View style={[s.dot, { backgroundColor: getMemberColor(e.memberId) }]} />
              <View style={s.eventInfo}>
                <Text style={s.eventTitle} numberOfLines={1}>{e.title}</Text>
                <Text style={s.eventTime}>
                  {e.allDay ? "All day" : formatTime(e.time)}
                </Text>
              </View>
            </View>
          ))
        )}
        {todayEvents.length > 5 && (
          <Text style={s.moreText}>+{todayEvents.length - 5} more</Text>
        )}

        {/* Tasks section */}
        <View style={[s.sectionHeader, { marginTop: 12 }]}>
          <Ionicons name="list-outline" size={16} color={t.success} />
          <Text style={s.sectionTitle}>{list ? list.name : "Tasks"}</Text>
          {list && (
            <Text style={s.sectionCount}>
              {list.items.filter(i => !i.done).length} pending
            </Text>
          )}
        </View>
        {list ? (
          list.items.length === 0 ? (
            <Text style={s.empty}>No items</Text>
          ) : (
            list.items.map(item => (
              <TouchableOpacity
                key={item.id}
                style={s.taskRow}
                onPress={() => toggleTodoItem(list.id, item.id)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={item.done ? "checkbox" : "square-outline"}
                  size={18}
                  color={item.done ? t.success : t.textFaint}
                />
                <Text style={[s.taskText, item.done && s.taskDone]} numberOfLines={1}>
                  {item.text}
                </Text>
              </TouchableOpacity>
            ))
          )
        ) : (
          lists.length === 0 ? (
            <Text style={s.empty}>No lists yet</Text>
          ) : (
            lists.map(l => {
              const pending = l.items.filter(i => !i.done).length;
              return (
                <View key={l.id} style={s.taskRow}>
                  <Text style={{ fontSize: 16 }}>{l.icon}</Text>
                  <Text style={s.taskText}>{l.name}</Text>
                  <Text style={s.pendingBadge}>{pending}</Text>
                </View>
              );
            })
          )
        )}
      </ScrollView>
    </View>
  );
}

function getStyles(t: Theme) {
  return StyleSheet.create({
    container:     { flex: 1 },
    scroll:        { flex: 1 },
    sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8,
                     paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: t.cardBorder },
    sectionTitle:  { fontSize: 15, fontWeight: "700", color: t.text, flex: 1 },
    sectionCount:  { fontSize: 11, color: t.textSub },
    empty:         { fontSize: 13, color: t.textFaint, paddingVertical: 8, paddingLeft: 4 },
    moreText:      { fontSize: 12, color: t.textFaint, paddingVertical: 4, paddingLeft: 18 },
    eventRow:      { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
    dot:           { width: 7, height: 7, borderRadius: 4, marginRight: 8 },
    eventInfo:     { flex: 1 },
    eventTitle:    { fontSize: 13, fontWeight: "500", color: t.text },
    eventTime:     { fontSize: 11, color: t.textSub, marginTop: 1 },
    taskRow:       { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
    taskText:      { fontSize: 13, color: t.text, flex: 1 },
    taskDone:      { textDecorationLine: "line-through", color: t.textFaint },
    pendingBadge:  { fontSize: 11, color: t.textSub, backgroundColor: t.toolbar,
                     borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  });
}
