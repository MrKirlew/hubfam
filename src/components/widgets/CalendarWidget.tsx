import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from "react-native";
import ModalSheet from "../ModalSheet";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../../store/appStore";
import type { WidgetConfig, TaskRecurrence } from "../../store/appStore";
import { pushCalendarCreate, pushCalendarDelete } from "../../services/SyncHelper";
import { useTheme } from "../../hooks/useTheme";
import type { Theme } from "../../theme";

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${hour12} ${period}` : `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function getTargetDate(config: WidgetConfig): string {
  const now = new Date();
  if (config.type === "calendar-tomorrow") { now.setDate(now.getDate() + 1); return fmtDate(now); }
  if (config.type === "calendar-date" && config.date) return config.date;
  return fmtDate(now);
}

function getTitle(config: WidgetConfig): string {
  if (config.type === "calendar-tomorrow") return "Tomorrow";
  if (config.type === "calendar-date" && config.date) return formatDateLabel(config.date);
  return "Today";
}

// Unified item type for rendering both events and tasks
interface DayItem {
  id: string;
  title: string;
  time: string;
  allDay: boolean;
  location?: string;
  notes?: string;
  memberId: string | null;
  source: "gcal" | "ical" | "apple" | "native" | "manual" | "task";
  isTask: boolean;
  done: boolean;
  listId?: string;
  dueTime?: string;
  recurrence?: TaskRecurrence;
  recurrenceInterval?: number;
}

const RECURRENCE_OPTIONS: { key: TaskRecurrence; label: string }[] = [
  { key: "none", label: "None" },
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "weekends", label: "Weekends" },
  { key: "monthly", label: "Monthly" },
];

// ── Component ───────────────────────────────────────────────────────────────

export default function CalendarWidget({ config }: { config: WidgetConfig; compact?: boolean }) {
  const events = useAppStore(s => s.events);
  const lists = useAppStore(s => s.lists);
  const members = useAppStore(s => s.members);
  const addEvent = useAppStore(s => s.addEvent);
  const removeEvent = useAppStore(s => s.removeEvent);
  const updateEvent = useAppStore(s => s.updateEvent);
  const toggleTodoItem = useAppStore(s => s.toggleTodoItem);
  const addTodoItem = useAppStore(s => s.addTodoItem);
  const updateTodoItem = useAppStore(s => s.updateTodoItem);
  const removeTodoItem = useAppStore(s => s.removeTodoItem);
  const showWidgetDates = useAppStore(s => s.showWidgetDates);

  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDueTime, setNewDueTime] = useState("");
  const [newRecurrence, setNewRecurrence] = useState<TaskRecurrence>("none");
  const [newRecurrenceInterval, setNewRecurrenceInterval] = useState("");
  const [addAsTask, setAddAsTask] = useState(true);

  const [detailItem, setDetailItem] = useState<DayItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editDueTime, setEditDueTime] = useState("");
  const [editRecurrence, setEditRecurrence] = useState<TaskRecurrence>("none");

  const t = useTheme();
  const st = useMemo(() => getStyles(t), [t]);

  const targetDate = getTargetDate(config);
  const title = getTitle(config);
  const dateLabel = formatDateLabel(targetDate);

  // Merge calendar events + tasks due on this date
  const dayItems: DayItem[] = useMemo(() => {
    const calItems: DayItem[] = events
      .filter(e => e.date === targetDate)
      .filter(e => !config.memberId || e.memberId === config.memberId || e.memberId === null)
      .map(e => ({
        id: e.id, title: e.title, time: e.time, allDay: e.allDay,
        location: e.location, notes: e.notes, memberId: e.memberId,
        source: e.source, isTask: false, done: false,
      }));

    const taskItems: DayItem[] = lists.flatMap(l =>
      l.items
        .filter(i => i.dueDate === targetDate)
        .map(i => ({
          id: `${l.id}::${i.id}`, title: i.text, time: i.dueTime || "23:59",
          allDay: !i.dueTime, location: undefined, notes: i.notes,
          memberId: i.assignedTo || null, source: "task" as const,
          isTask: true, done: i.done, listId: l.id,
          dueTime: i.dueTime, recurrence: i.recurrence,
          recurrenceInterval: i.recurrenceInterval,
        }))
    );

    return [...calItems, ...taskItems].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1; // uncompleted first
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return a.time.localeCompare(b.time);
    });
  }, [events, lists, targetDate, config.memberId]);

  const getMemberColor = (memberId: string | null): string => {
    if (!memberId) return t.accent;
    return members.find(m => m.id === memberId)?.color || t.accent;
  };

  // ── Actions ─────────────────────────────────────────────────────────────

  const handleToggleTask = (item: DayItem) => {
    if (!item.isTask || !item.listId) return;
    const itemId = item.id.split("::")[1];
    toggleTodoItem(item.listId, itemId);

    // If completing a recurring task, create next occurrence
    if (!item.done && item.recurrence && item.recurrence !== "none") {
      const nextDate = getNextOccurrence(targetDate, item.recurrence, item.recurrenceInterval);
      const list = lists.find(l => l.id === item.listId);
      if (list) {
        addTodoItem(item.listId, item.title);
        // Update the newly created item with recurrence + date
        const newItem = list.items[list.items.length - 1];
        if (newItem) {
          updateTodoItem(item.listId, newItem.id, {
            dueDate: nextDate, dueTime: item.dueTime,
            recurrence: item.recurrence, recurrenceInterval: item.recurrenceInterval,
          });
        }
      }
    }
  };

  const openDetail = (item: DayItem) => {
    setDetailItem(item);
    setEditTitle(item.title);
    setEditNotes(item.notes || "");
    setEditDueTime(item.dueTime || "");
    setEditRecurrence(item.recurrence || "none");
  };

  const handleSaveDetail = () => {
    if (!detailItem) return;
    if (detailItem.isTask && detailItem.listId) {
      const itemId = detailItem.id.split("::")[1];
      updateTodoItem(detailItem.listId, itemId, {
        text: editTitle.trim() || detailItem.title,
        notes: editNotes.trim() || undefined,
        dueTime: editDueTime || undefined,
        recurrence: editRecurrence,
      });
    } else if (detailItem.source === "manual") {
      updateEvent(detailItem.id, {
        title: editTitle.trim() || detailItem.title,
        notes: editNotes.trim() || undefined,
      });
    }
    setDetailItem(null);
  };

  const handleDeleteDetail = () => {
    if (!detailItem) return;
    Alert.alert("Delete", `Remove "${detailItem.title}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => {
        if (detailItem.isTask && detailItem.listId) {
          const itemId = detailItem.id.split("::")[1];
          removeTodoItem(detailItem.listId, itemId);
        } else if (detailItem.source === "manual") {
          pushCalendarDelete(detailItem as any);
          removeEvent(detailItem.id);
        }
        setDetailItem(null);
      }},
    ]);
  };

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    if (addAsTask) {
      // Add as task to first available list
      const targetList = lists[0];
      if (!targetList) {
        Alert.alert("No List", "Create a to-do list first to add tasks.");
        return;
      }
      addTodoItem(targetList.id, newTitle.trim());
      const newItem = targetList.items[targetList.items.length - 1];
      if (newItem) {
        updateTodoItem(targetList.id, newItem.id, {
          dueDate: targetDate,
          dueTime: newDueTime || undefined,
          recurrence: newRecurrence,
          recurrenceInterval: newRecurrenceInterval ? parseInt(newRecurrenceInterval) : undefined,
        });
      }
    } else {
      const newEvent = {
        id: `manual_${Date.now()}`, title: newTitle.trim(), date: targetDate,
        time: newDueTime || "09:00", allDay: !newDueTime, memberId: null,
        calendarId: "manual", reminder: "0", source: "manual" as const, externalId: null,
      };
      addEvent(newEvent);
      pushCalendarCreate(newEvent);
    }
    setNewTitle(""); setNewDueTime(""); setNewRecurrence("none"); setNewRecurrenceInterval("");
    setShowAdd(false);
  };

  const isEditable = (item: DayItem) => item.isTask || item.source === "manual";

  return (
    <View style={st.container} accessibilityLiveRegion="polite">
      {/* Header */}
      <View style={st.header}>
        <View>
          <Text style={st.title}>{title}</Text>
          {showWidgetDates && <Text style={st.dateLabel}>{dateLabel}</Text>}
        </View>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <TouchableOpacity onPress={() => setShowAdd(true)} accessibilityRole="button" accessibilityLabel="Add item" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="add-circle-outline" size={20} color={t.accent} />
          </TouchableOpacity>
          <Text style={st.count}>{dayItems.filter(i => !i.done).length}</Text>
        </View>
      </View>

      {/* Item list — all items shown, scrollable */}
      <ScrollView style={st.list} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {dayItems.length === 0 ? (
          <Text style={st.empty}>No items</Text>
        ) : (
          dayItems.map(item => (
            <TouchableOpacity
              key={item.id}
              style={[st.eventRow, item.done && st.doneRow]}
              onPress={() => openDetail(item)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}${item.done ? ", completed" : ""}`}
            >
              {/* Checkbox for tasks, dot for calendar events */}
              {item.isTask ? (
                <TouchableOpacity
                  onPress={() => handleToggleTask(item)}
                  style={{ marginRight: 8 }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: item.done }}
                >
                  <Ionicons
                    name={item.done ? "checkmark-circle" : "ellipse-outline"}
                    size={20}
                    color={item.done ? t.success : t.textFaint}
                  />
                </TouchableOpacity>
              ) : (
                <View style={[st.dot, { backgroundColor: getMemberColor(item.memberId) }]} />
              )}

              <View style={st.eventInfo}>
                <Text style={[st.eventTitle, item.done && st.doneText]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={st.eventTime} numberOfLines={1}>
                  {item.isTask && item.dueTime ? `by ${formatTime(item.dueTime)}` : item.allDay ? (item.isTask ? "" : "All day") : formatTime(item.time)}
                  {item.location ? ` · ${item.location}` : ""}
                  {item.recurrence && item.recurrence !== "none" ? ` · ${item.recurrence}` : ""}
                </Text>
              </View>

              {/* Source indicator */}
              <Ionicons
                name={item.isTask ? "list-outline" : "calendar-outline"}
                size={14}
                color={t.textFaint}
              />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* ── Add Item Modal ── */}
      <ModalSheet visible={showAdd} onClose={() => { setShowAdd(false); setNewTitle(""); }} maxWidth={420}>
        <Text style={st.addSheetTitle}>Add to {title}</Text>

        {/* Type toggle */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          <TouchableOpacity
            style={[st.typeChip, addAsTask && st.typeChipActive]}
            onPress={() => setAddAsTask(true)}
          >
            <Ionicons name="checkbox-outline" size={16} color={addAsTask ? t.accent : t.textFaint} />
            <Text style={[st.typeChipText, addAsTask && { color: t.accent }]}>Task</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[st.typeChip, !addAsTask && st.typeChipActive]}
            onPress={() => setAddAsTask(false)}
          >
            <Ionicons name="calendar-outline" size={16} color={!addAsTask ? t.accent : t.textFaint} />
            <Text style={[st.typeChipText, !addAsTask && { color: t.accent }]}>Event</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={st.addSheetInput}
          placeholder="What needs to be done?"
          placeholderTextColor={t.textFaint}
          value={newTitle}
          onChangeText={setNewTitle}
          returnKeyType="done"
          autoFocus
          accessibilityLabel="Item title"
        />

        {/* Due time */}
        <Text style={st.fieldLabel}>Due time (optional, e.g. 14:30)</Text>
        <TextInput
          style={[st.addSheetInput, { marginBottom: 8 }]}
          placeholder="HH:MM (24h) or leave empty"
          placeholderTextColor={t.textFaint}
          value={newDueTime}
          onChangeText={setNewDueTime}
          keyboardType="numbers-and-punctuation"
          accessibilityLabel="Due time"
        />

        {/* Recurrence (tasks only) */}
        {addAsTask && (
          <>
            <Text style={st.fieldLabel}>Repeat</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {RECURRENCE_OPTIONS.map(r => (
                <TouchableOpacity
                  key={r.key}
                  style={[st.recChip, newRecurrence === r.key && st.recChipActive]}
                  onPress={() => setNewRecurrence(r.key)}
                >
                  <Text style={[st.recChipText, newRecurrence === r.key && { color: t.accent }]}>{r.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {newRecurrence === "none" && (
              <>
                <Text style={st.fieldLabel}>Or every N days</Text>
                <TextInput
                  style={[st.addSheetInput, { marginBottom: 8 }]}
                  placeholder="e.g. 3"
                  placeholderTextColor={t.textFaint}
                  value={newRecurrenceInterval}
                  onChangeText={setNewRecurrenceInterval}
                  keyboardType="number-pad"
                  accessibilityLabel="Every N days"
                />
              </>
            )}
          </>
        )}

        <View style={st.addSheetActions}>
          <TouchableOpacity style={st.addSheetCancel} onPress={() => { setShowAdd(false); setNewTitle(""); }}>
            <Text style={st.addSheetCancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[st.addSheetBtn, !newTitle.trim() && { opacity: 0.4 }]}
            onPress={handleAdd}
          >
            <Ionicons name={addAsTask ? "checkbox" : "calendar"} size={18} color={t.textOnAccent} />
            <Text style={st.addSheetBtnText}>Add</Text>
          </TouchableOpacity>
        </View>
      </ModalSheet>

      {/* ── Detail / Edit Modal ── */}
      <ModalSheet visible={detailItem !== null} onClose={() => setDetailItem(null)} maxWidth={420}>
        {detailItem && (
          <>
            <Text style={st.addSheetTitle}>
              {isEditable(detailItem) ? "Edit" : "View"} — {detailItem.isTask ? "Task" : "Event"}
            </Text>

            {isEditable(detailItem) ? (
              <>
                <TextInput
                  style={st.addSheetInput}
                  value={editTitle}
                  onChangeText={setEditTitle}
                  accessibilityLabel="Title"
                />
                <Text style={st.fieldLabel}>Notes</Text>
                <TextInput
                  style={[st.addSheetInput, { minHeight: 60 }]}
                  value={editNotes}
                  onChangeText={setEditNotes}
                  multiline
                  placeholder="Add notes..."
                  placeholderTextColor={t.textFaint}
                  accessibilityLabel="Notes"
                />
                {detailItem.isTask && (
                  <>
                    <Text style={st.fieldLabel}>Due time (HH:MM)</Text>
                    <TextInput
                      style={st.addSheetInput}
                      value={editDueTime}
                      onChangeText={setEditDueTime}
                      placeholder="e.g. 14:30"
                      placeholderTextColor={t.textFaint}
                      keyboardType="numbers-and-punctuation"
                      accessibilityLabel="Due time"
                    />
                    <Text style={st.fieldLabel}>Repeat</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                      {RECURRENCE_OPTIONS.map(r => (
                        <TouchableOpacity
                          key={r.key}
                          style={[st.recChip, editRecurrence === r.key && st.recChipActive]}
                          onPress={() => setEditRecurrence(r.key)}
                        >
                          <Text style={[st.recChipText, editRecurrence === r.key && { color: t.accent }]}>{r.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
              </>
            ) : (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ color: t.text, fontSize: 16, fontWeight: "600", marginBottom: 8 }}>{detailItem.title}</Text>
                <Text style={{ color: t.textSub, fontSize: 14 }}>
                  {detailItem.allDay ? "All day" : formatTime(detailItem.time)}
                </Text>
                {detailItem.location ? <Text style={{ color: t.textSub, fontSize: 14, marginTop: 4 }}>{detailItem.location}</Text> : null}
                {detailItem.notes ? <Text style={{ color: t.textFaint, fontSize: 13, marginTop: 8 }}>{detailItem.notes}</Text> : null}
                <Text style={{ color: t.textFaint, fontSize: 12, marginTop: 8 }}>Source: {detailItem.source} (read-only)</Text>
              </View>
            )}

            <View style={st.addSheetActions}>
              {isEditable(detailItem) && (
                <TouchableOpacity style={[st.addSheetCancel, { backgroundColor: `${t.error}22` }]} onPress={handleDeleteDetail}>
                  <Ionicons name="trash-outline" size={16} color={t.error} />
                  <Text style={[st.addSheetCancelText, { color: t.error, marginLeft: 4 }]}>Delete</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={st.addSheetCancel} onPress={() => setDetailItem(null)}>
                <Text style={st.addSheetCancelText}>{isEditable(detailItem) ? "Cancel" : "Close"}</Text>
              </TouchableOpacity>
              {isEditable(detailItem) && (
                <TouchableOpacity style={st.addSheetBtn} onPress={handleSaveDetail}>
                  <Text style={st.addSheetBtnText}>Save</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </ModalSheet>
    </View>
  );
}

// ── Recurrence helper ───────────────────────────────────────────────────────

function getNextOccurrence(currentDate: string, recurrence: TaskRecurrence, interval?: number): string {
  const d = new Date(currentDate + "T00:00:00");
  if (interval && interval > 0) {
    d.setDate(d.getDate() + interval);
  } else {
    switch (recurrence) {
      case "daily": d.setDate(d.getDate() + 1); break;
      case "weekly": d.setDate(d.getDate() + 7); break;
      case "weekends": {
        const day = d.getDay();
        d.setDate(d.getDate() + (day === 6 ? 1 : (6 - day) || 7)); // next Sat or Sun
        break;
      }
      case "monthly": d.setMonth(d.getMonth() + 1); break;
      default: d.setDate(d.getDate() + 1);
    }
  }
  return fmtDate(d);
}

// ── Styles ──────────────────────────────────────────────────────────────────

function getStyles(t: Theme) {
  return StyleSheet.create({
    container:   { flex: 1 },
    header:      { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
    title:       { fontSize: 18, fontWeight: "700", color: t.text },
    dateLabel:   { fontSize: 12, color: t.textSub, marginTop: 2 },
    count:       { fontSize: 12, color: t.textSub, backgroundColor: t.accentBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: "hidden" },
    list:        { flex: 1 },
    empty:       { fontSize: 14, color: t.textFaint, textAlign: "center", marginTop: 24 },
    eventRow:    { flexDirection: "row", alignItems: "center", paddingVertical: 8,
                   borderBottomWidth: 1, borderBottomColor: t.divider },
    doneRow:     { opacity: 0.5 },
    doneText:    { textDecorationLine: "line-through" },
    dot:         { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
    eventInfo:   { flex: 1 },
    eventTitle:  { fontSize: 14, fontWeight: "500", color: t.text },
    eventTime:   { fontSize: 12, color: t.textSub, marginTop: 2 },
    fieldLabel:  { fontSize: 13, color: t.textSub, marginTop: 10, marginBottom: 4 },
    typeChip:    { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: t.cardBorder },
    typeChipActive: { borderColor: t.accent, backgroundColor: t.accentBg },
    typeChipText: { fontSize: 13, color: t.textFaint },
    recChip:     { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: t.cardBorder },
    recChipActive: { borderColor: t.accent, backgroundColor: t.accentBg },
    recChipText: { fontSize: 12, color: t.textFaint },
    addSheetTitle: { fontSize: 16, fontWeight: "700", color: t.text, marginBottom: 14 },
    addSheetInput: { fontSize: 15, color: t.text, backgroundColor: t.input, borderRadius: 10,
                     paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: t.inputBorder, marginBottom: 4 },
    addSheetActions: { flexDirection: "row", gap: 10, marginTop: 16 },
    addSheetCancel: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center",
                      flexDirection: "row", justifyContent: "center", backgroundColor: t.input },
    addSheetCancelText: { fontSize: 14, fontWeight: "600", color: t.textSub },
    addSheetBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center",
                   flexDirection: "row", justifyContent: "center", gap: 6, backgroundColor: t.accent },
    addSheetBtnText: { fontSize: 14, fontWeight: "600", color: t.textOnAccent },
  });
}
