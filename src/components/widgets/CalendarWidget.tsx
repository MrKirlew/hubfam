import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from "react-native";
import ModalSheet from "../ModalSheet";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../../store/appStore";
import type { WidgetConfig } from "../../store/appStore";
import { pushCalendarCreate, pushCalendarDelete } from "../../services/SyncHelper";
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

function getTargetDate(config: WidgetConfig): string {
  const now = new Date();
  if (config.type === "calendar-tomorrow") { now.setDate(now.getDate() + 1); return fmtDate(now); }
  if (config.type === "calendar-date" && config.date) return config.date;
  return fmtDate(now);
}

function getTitle(config: WidgetConfig): string {
  if (config.type === "calendar-tomorrow") return "Tomorrow";
  if (config.type === "calendar-date" && config.date) {
    const d = new Date(config.date + "T00:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }
  return "Today";
}

export default function CalendarWidget({ config, compact }: { config: WidgetConfig; compact?: boolean }) {
  const events = useAppStore(s => s.events);
  const members = useAppStore(s => s.members);
  const addEvent = useAppStore(s => s.addEvent);
  const removeEvent = useAppStore(s => s.removeEvent);

  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const t = useTheme();
  const st = useMemo(() => getStyles(t), [t]);

  const targetDate = getTargetDate(config);
  const title = getTitle(config);

  const filtered = events
    .filter(e => e.date === targetDate)
    .filter(e => !config.memberId || e.memberId === config.memberId || e.memberId === null)
    .sort((a, b) => {
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return a.time.localeCompare(b.time);
    });

  const getMemberColor = (memberId: string | null): string => {
    if (!memberId) return t.accent;
    return members.find(m => m.id === memberId)?.color || t.accent;
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    const newEvent = {
      id: `manual_${Date.now()}`, title: newTitle.trim(), date: targetDate,
      time: "09:00", allDay: true, memberId: null, calendarId: "manual",
      reminder: "0", source: "manual" as const, externalId: null,
    };
    addEvent(newEvent);
    pushCalendarCreate(newEvent);
    setNewTitle("");
    setShowAdd(false);
  };

  const handleDeleteSelected = () => {
    const manualSelected = filtered.filter(e => selected.has(e.id) && e.source === "manual");
    if (manualSelected.length === 0) {
      Alert.alert("Cannot Delete", "Only manually created events can be deleted.");
      return;
    }
    Alert.alert("Delete Events", `Remove ${manualSelected.length} selected event(s)?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => {
        manualSelected.forEach(e => {
          pushCalendarDelete(e);
          removeEvent(e.id);
        });
        setSelected(new Set());
      }},
    ]);
  };

  const maxItems = compact ? 3 : filtered.length;

  return (
    <View style={st.container}>
      <View style={st.header}>
        <Text style={[st.title, compact && { fontSize: 14 }]}>{title}</Text>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          {selected.size > 0 && (
            <TouchableOpacity onPress={handleDeleteSelected}>
              <Ionicons name="trash-outline" size={16} color={t.error} />
            </TouchableOpacity>
          )}
          {!compact && (
            <TouchableOpacity onPress={() => setShowAdd(!showAdd)}>
              <Ionicons name="add-circle-outline" size={18} color={t.accent} />
            </TouchableOpacity>
          )}
          <Text style={st.count}>{filtered.length}</Text>
        </View>
      </View>

      <ScrollView style={st.list} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {filtered.length === 0 ? (
          <Text style={[st.empty, compact && { fontSize: 11, marginTop: 8 }]}>No events</Text>
        ) : (
          filtered.slice(0, maxItems).map(e => (
            <TouchableOpacity
              key={e.id}
              style={[st.eventRow, compact && { paddingVertical: 4 }, selected.has(e.id) && st.selectedRow]}
              onLongPress={() => toggleSelect(e.id)}
              activeOpacity={0.7}
            >
              <View style={[st.dot, { backgroundColor: getMemberColor(e.memberId) }]} />
              <View style={st.eventInfo}>
                <Text style={[st.eventTitle, compact && { fontSize: 11 }]} numberOfLines={1}>{e.title}</Text>
                {!compact && (
                  <Text style={st.eventTime}>
                    {e.allDay ? "All day" : formatTime(e.time)}
                    {e.location ? ` · ${e.location}` : ""}
                  </Text>
                )}
              </View>
              {selected.has(e.id) && <Ionicons name="checkmark-circle" size={16} color={t.accent} />}
            </TouchableOpacity>
          ))
        )}
        {filtered.length > maxItems && (
          <Text style={{ fontSize: 10, color: t.textFaint, paddingTop: 2 }}>+{filtered.length - maxItems} more</Text>
        )}
      </ScrollView>

      {/* Add event modal — keyboard-safe */}
      <ModalSheet visible={showAdd} onClose={() => { setShowAdd(false); setNewTitle(""); }} maxWidth={400}>
        <Text style={st.addSheetTitle}>Add Event — {title}</Text>
        <TextInput
          style={st.addSheetInput}
          placeholder="Event name..."
          placeholderTextColor={t.textFaint}
          value={newTitle}
          onChangeText={setNewTitle}
          onSubmitEditing={handleAdd}
          returnKeyType="done"
          autoFocus
        />
        <View style={st.addSheetActions}>
          <TouchableOpacity style={st.addSheetCancel} onPress={() => { setShowAdd(false); setNewTitle(""); }}>
            <Text style={st.addSheetCancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[st.addSheetBtn, !newTitle.trim() && { opacity: 0.4 }]}
            onPress={handleAdd}
          >
            <Ionicons name="calendar" size={18} color={t.textOnAccent} />
            <Text style={st.addSheetBtnText}>Add Event</Text>
          </TouchableOpacity>
        </View>
      </ModalSheet>
    </View>
  );
}

function getStyles(t: Theme) {
  return StyleSheet.create({
    container:   { flex: 1 },
    header:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
    title:       { fontSize: 18, fontWeight: "700", color: t.text },
    count:       { fontSize: 12, color: t.textSub },
    list:        { flex: 1 },
    empty:       { fontSize: 14, color: t.textFaint, textAlign: "center", marginTop: 24 },
    eventRow:    { flexDirection: "row", alignItems: "center", paddingVertical: 8,
                   borderBottomWidth: 1, borderBottomColor: t.divider },
    selectedRow: { backgroundColor: t.accentBg, borderRadius: 8 },
    dot:         { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
    eventInfo:   { flex: 1 },
    eventTitle:  { fontSize: 14, fontWeight: "500", color: t.text },
    eventTime:   { fontSize: 12, color: t.textSub, marginTop: 2 },
    backdrop:    { flex: 1, backgroundColor: t.modalBd, justifyContent: "center", alignItems: "center" },
    addSheet:    { width: "85%", maxWidth: 400, backgroundColor: t.modal, borderRadius: 16,
                   padding: 20, borderWidth: 1, borderColor: t.cardBorder },
    addSheetTitle: { fontSize: 16, fontWeight: "700", color: t.text, marginBottom: 14 },
    addSheetInput: { fontSize: 15, color: t.text, backgroundColor: t.input, borderRadius: 10,
                     paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: t.inputBorder },
    addSheetActions: { flexDirection: "row", gap: 10, marginTop: 16 },
    addSheetCancel: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center",
                      backgroundColor: t.input },
    addSheetCancelText: { fontSize: 14, fontWeight: "600", color: t.textSub },
    addSheetBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center",
                   flexDirection: "row", justifyContent: "center", gap: 6, backgroundColor: t.accent },
    addSheetBtnText: { fontSize: 14, fontWeight: "600", color: t.textOnAccent },
  });
}
