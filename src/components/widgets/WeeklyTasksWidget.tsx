import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, TextInput, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../../store/appStore";
import { useTheme } from "../../hooks/useTheme";
import type { Theme } from "../../theme";

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12} ${period}` : `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function getWeekDates(): { date: string; label: string; dayName: string; isToday: boolean }[] {
  const today = new Date();
  const days: { date: string; label: string; dayName: string; isToday: boolean }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push({
      date: fmtDate(d),
      label: String(d.getDate()),
      dayName: d.toLocaleDateString("en-US", { weekday: "short" }),
      isToday: i === 0,
    });
  }
  return days;
}

export default function WeeklyTasksWidget({ compact }: { compact?: boolean }) {
  const events = useAppStore(s => s.events);
  const lists = useAppStore(s => s.lists);
  const members = useAppStore(s => s.members);
  const addEvent = useAppStore(s => s.addEvent);
  const removeEvent = useAppStore(s => s.removeEvent);

  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [detailDate, setDetailDate] = useState<string | null>(null);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState("");

  const weekDates = getWeekDates();

  const dayCounts = weekDates.map(day => {
    const dayEvents = events.filter(e => e.date === day.date);
    const taskCount = lists.reduce((sum, l) =>
      sum + l.items.filter(i => i.dueDate === day.date && !i.done).length, 0
    );
    const hasImportant = dayEvents.length >= 3;
    return { ...day, eventCount: dayEvents.length, taskCount, hasImportant };
  });

  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const t = useTheme();
  const s = useMemo(() => getStyles(t), [t]);

  const activeDates = selectedDates.length > 0 ? selectedDates : (detailDate ? [detailDate] : []);
  const selectedEvents = events.filter(e => activeDates.includes(e.date));
  const selectedDayInfo = detailDate ? weekDates.find(d => d.date === detailDate) : null;

  const toggleSelect = (date: string) => {
    setSelectedDates(prev =>
      prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date]
    );
  };

  const handleDayTap = (date: string) => {
    if (multiSelectMode) {
      toggleSelect(date);
    } else {
      setDetailDate(date);
    }
  };

  const openSelectedDaysPopup = () => {
    if (selectedDates.length > 0) {
      setDetailDate(selectedDates[0]);
    }
  };

  const getMemberColor = (memberId: string | null): string => {
    if (!memberId) return t.accent;
    return members.find(m => m.id === memberId)?.color || t.accent;
  };

  const handleAddEvent = () => {
    if (!newEventTitle.trim()) return;
    const datesToAdd = activeDates.length > 0 ? activeDates : (detailDate ? [detailDate] : []);
    if (datesToAdd.length === 0) return;

    for (const date of datesToAdd) {
      const evt = {
        id: `manual_${Date.now()}_${date}`,
        title: newEventTitle.trim(),
        date,
        time: "09:00",
        allDay: true,
        memberId: null,
        calendarId: "manual",
        reminder: "0",
        source: "manual" as const,
        externalId: null,
      };
      addEvent(evt);
    }
    setNewEventTitle("");
    setShowAddEvent(false);
  };

  const handleDeleteEvent = (id: string, title: string) => {
    Alert.alert("Delete Event", `Remove "${title}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => removeEvent(id) },
    ]);
  };

  return (
    <View style={s.container}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={[s.title, compact && { fontSize: 14, marginBottom: 6 }]}>This Week</Text>
        {!compact && (
          <TouchableOpacity
            style={[s.multiBtn, multiSelectMode && s.multiBtnActive]}
            onPress={() => {
              if (multiSelectMode) {
                setMultiSelectMode(false);
                if (selectedDates.length > 0) openSelectedDaysPopup();
              } else {
                setMultiSelectMode(true);
                setSelectedDates([]);
              }
            }}
          >
            <Ionicons name="checkbox-outline" size={14} color={multiSelectMode ? t.accent : t.textFaint} />
            <Text style={{ fontSize: 10, color: multiSelectMode ? t.accent : t.textFaint }}>
              {multiSelectMode ? "Done" : "Select"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={s.grid}>
        {dayCounts.map(day => (
          <TouchableOpacity
            key={day.date}
            style={[
              s.dayCol,
              day.isToday && s.todayCol,
              day.hasImportant && s.importantCol,
              selectedDates.includes(day.date) && s.selectedCol,
            ]}
            onPress={() => handleDayTap(day.date)}
            onLongPress={() => { setMultiSelectMode(true); toggleSelect(day.date); }}
            activeOpacity={0.7}
          >
            <Text style={[s.dayName, compact && { fontSize: 9 }, day.isToday && s.todayText]}>
              {day.dayName}
            </Text>
            <Text style={[s.dayNum, compact && { fontSize: 14 }, day.isToday && s.todayText]}>
              {day.label}
            </Text>
            {!compact ? (
              <View style={s.counts}>
                {day.eventCount > 0 && (
                  <View style={[s.badge, { backgroundColor: t.accent + "33" }]}>
                    <Text style={[s.badgeText, { color: t.accent }]}>{day.eventCount}</Text>
                  </View>
                )}
                {day.taskCount > 0 && (
                  <View style={[s.badge, { backgroundColor: t.warning + "33" }]}>
                    <Text style={[s.badgeText, { color: t.warning }]}>{day.taskCount}</Text>
                  </View>
                )}
                {day.eventCount === 0 && day.taskCount === 0 && (
                  <Text style={s.noneText}>-</Text>
                )}
              </View>
            ) : (
              <View style={{ flexDirection: "row", gap: 2, marginTop: 2 }}>
                {day.eventCount > 0 && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: t.accent }} />}
                {day.taskCount > 0 && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: t.warning }} />}
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Action bar when days are selected */}
      {multiSelectMode && selectedDates.length > 0 && (
        <View style={s.actionBar}>
          <Text style={s.actionText}>{selectedDates.length} day{selectedDates.length > 1 ? "s" : ""} selected</Text>
          <TouchableOpacity style={s.actionBtn} onPress={openSelectedDaysPopup}>
            <Ionicons name="eye-outline" size={14} color={t.accent} />
            <Text style={s.actionBtnText}>View</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn} onPress={() => { openSelectedDaysPopup(); setShowAddEvent(true); }}>
            <Ionicons name="add-circle-outline" size={14} color={t.success} />
            <Text style={[s.actionBtnText, { color: t.success }]}>Add Event</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn} onPress={() => { setSelectedDates([]); setMultiSelectMode(false); }}>
            <Ionicons name="close-circle-outline" size={14} color={t.textSub} />
            <Text style={s.actionBtnText}>Clear</Text>
          </TouchableOpacity>
        </View>
      )}

      {!compact && !multiSelectMode && (
        <View style={s.legend}>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: t.accent }]} />
            <Text style={s.legendText}>Events</Text>
          </View>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: t.warning }]} />
            <Text style={s.legendText}>Tasks</Text>
          </View>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: t.warning, borderWidth: 1, borderColor: t.warning }]} />
            <Text style={s.legendText}>Important (3+)</Text>
          </View>
        </View>
      )}

      {/* Day detail modal */}
      <Modal visible={detailDate !== null} transparent animationType="fade" onRequestClose={() => setDetailDate(null)}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => setDetailDate(null)}>
          <View style={s.detailSheet}>
            <View style={s.detailHeader}>
              <Text style={s.detailTitle}>
                {selectedDates.length > 1
                  ? `${selectedDates.length} Days Selected`
                  : `${selectedDayInfo?.dayName}, ${selectedDayInfo?.label}`}
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity onPress={() => { setShowAddEvent(true); }}>
                  <Ionicons name="add-circle" size={24} color={t.accent} />
                </TouchableOpacity>
              </View>
            </View>
            {selectedDates.length > 1 && (
              <Text style={{ fontSize: 11, color: t.textSub, marginBottom: 8 }}>
                Adding events will add to all {selectedDates.length} selected days
              </Text>
            )}

            <ScrollView style={{ maxHeight: 250 }}>
              {selectedEvents.length === 0 ? (
                <Text style={s.noEvents}>No events this day</Text>
              ) : (
                selectedEvents.map(e => (
                  <View key={e.id} style={s.eventRow}>
                    <View style={[s.eDot, { backgroundColor: getMemberColor(e.memberId) }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.eTitle}>{e.title}</Text>
                      <Text style={s.eTime}>{e.allDay ? "All day" : formatTime(e.time)}</Text>
                    </View>
                    <TouchableOpacity onPress={() => handleDeleteEvent(e.id, e.title)}>
                      <Ionicons name="trash-outline" size={16} color={t.error} />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>

            {/* Add event inline */}
            {showAddEvent && (
              <View style={s.addRow}>
                <TextInput
                  style={s.addInput}
                  placeholder="New event..."
                  placeholderTextColor={t.textFaint}
                  value={newEventTitle}
                  onChangeText={setNewEventTitle}
                  onSubmitEditing={handleAddEvent}
                  autoFocus
                  returnKeyType="done"
                />
                <TouchableOpacity onPress={handleAddEvent}>
                  <Ionicons name="checkmark-circle" size={24} color={t.accent} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setShowAddEvent(false); setNewEventTitle(""); }}>
                  <Ionicons name="close-circle" size={24} color={t.textFaint} />
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity style={s.closeBtn} onPress={() => setDetailDate(null)}>
              <Text style={s.closeText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function getStyles(t: Theme) {
  return StyleSheet.create({
    container:    { flex: 1 },
    title:        { fontSize: 18, fontWeight: "700", color: t.text, marginBottom: 12 },
    grid:         { flexDirection: "row", gap: 4, flex: 1 },
    dayCol:       { flex: 1, alignItems: "center", backgroundColor: t.isDark ? "rgba(255,255,255,.03)" : "rgba(10,32,48,.03)",
                    borderRadius: 8, paddingVertical: 8, gap: 4 },
    todayCol:     { backgroundColor: t.accentBg, borderWidth: 1, borderColor: t.accent + "4D" },
    importantCol: { borderWidth: 1, borderColor: t.warning + "66", backgroundColor: t.warning + "0F" },
    selectedCol:  { backgroundColor: t.accent + "40", borderWidth: 1.5, borderColor: t.accent },
    dayName:      { fontSize: 11, color: t.textSub, fontWeight: "600" },
    dayNum:       { fontSize: 18, fontWeight: "700", color: t.text },
    todayText:    { color: t.accent },
    counts:       { alignItems: "center", gap: 3 },
    badge:        { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6, minWidth: 20, alignItems: "center" },
    badgeText:    { fontSize: 10, fontWeight: "700" },
    noneText:     { fontSize: 12, color: t.textFaint },
    legend:       { flexDirection: "row", gap: 16, justifyContent: "center", marginTop: 8 },
    legendItem:   { flexDirection: "row", alignItems: "center", gap: 4 },
    legendDot:    { width: 6, height: 6, borderRadius: 3 },
    legendText:   { fontSize: 10, color: t.textSub },
    backdrop:     { flex: 1, backgroundColor: t.modalBd, justifyContent: "center", alignItems: "center" },
    detailSheet:  { width: "80%", maxWidth: 400, backgroundColor: t.modal, borderRadius: 16,
                    padding: 20, borderWidth: 1, borderColor: t.cardBorder },
    detailHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    detailTitle:  { fontSize: 18, fontWeight: "700", color: t.text },
    noEvents:     { fontSize: 13, color: t.textFaint, textAlign: "center", paddingVertical: 16 },
    eventRow:     { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10,
                    borderBottomWidth: 1, borderBottomColor: t.divider },
    eDot:         { width: 8, height: 8, borderRadius: 4 },
    eTitle:       { fontSize: 14, fontWeight: "500", color: t.text },
    eTime:        { fontSize: 11, color: t.textSub, marginTop: 2 },
    addRow:       { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 10,
                    borderTopWidth: 1, borderTopColor: t.cardBorder },
    addInput:     { flex: 1, fontSize: 14, color: t.text, backgroundColor: t.input,
                    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
    closeBtn:     { alignItems: "center", paddingVertical: 10, marginTop: 8 },
    closeText:    { fontSize: 14, color: t.textSub },
    multiBtn:       { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8,
                      paddingVertical: 4, borderRadius: 8, backgroundColor: t.toolbar },
    multiBtnActive: { backgroundColor: t.accentBg, borderWidth: 1, borderColor: t.accent + "4D" },
    actionBar:      { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, paddingHorizontal: 4,
                      marginTop: 6, backgroundColor: t.accentBg, borderRadius: 8,
                      borderWidth: 1, borderColor: t.accent + "33" },
    actionText:     { fontSize: 11, fontWeight: "600", color: t.accent, flex: 1 },
    actionBtn:      { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8,
                      paddingVertical: 4, borderRadius: 6, backgroundColor: t.toolbar },
    actionBtnText:  { fontSize: 10, fontWeight: "500", color: t.accent },
  });
}
