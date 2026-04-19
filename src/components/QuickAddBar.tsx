import React, { useState, useMemo, useEffect, useRef } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Modal, ScrollView, AccessibilityInfo, Keyboard, Animated, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../store/appStore";
import type { CalendarEvent, TodoItem } from "../store/appStore";
import { pushCalendarCreate, pushTaskCreate } from "../services/SyncHelper";
import { useTheme } from "../hooks/useTheme";
import type { Theme } from "../theme";
import { parseSmartInput, intentForSegment } from "../services/SmartInputParser";
import type { SmartParseResult, SmartIntent, ParsedFields, QuickAddSegment } from "../services/SmartInputParser";
import SmartClarifyModal from "./SmartClarifyModal";

type Segment = QuickAddSegment;

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function QuickAddBar() {
  const lists = useAppStore(s => s.lists);
  const members = useAppStore(s => s.members);
  const addEvent = useAppStore(s => s.addEvent);
  const addTodoItem = useAppStore(s => s.addTodoItem);
  const updateTodoItem = useAppStore(s => s.updateTodoItem);
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const st = useMemo(() => getStyles(t, insets.bottom), [t, insets.bottom]);

  const [segment, setSegment] = useState<Segment>("list");
  const [text, setText] = useState("");
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [showListPicker, setShowListPicker] = useState(false);
  const [pendingParse, setPendingParse] = useState<SmartParseResult | null>(null);
  const [showClarify, setShowClarify] = useState(false);

  // Keyboard-follow: the bar is absolute-positioned so panels keep their size.
  // When the keyboard opens we animate `bottom` up by its height so the input
  // visually sits just above the keyboard without affecting anything above.
  const keyboardBottom = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const subShow = Keyboard.addListener(showEvt, e => {
      Animated.timing(keyboardBottom, {
        toValue: e.endCoordinates?.height ?? 0,
        duration: Platform.OS === "ios" ? (e.duration || 250) : 150,
        useNativeDriver: false,
      }).start();
    });
    const subHide = Keyboard.addListener(hideEvt, e => {
      Animated.timing(keyboardBottom, {
        toValue: 0,
        duration: Platform.OS === "ios" ? (e.duration || 250) : 150,
        useNativeDriver: false,
      }).start();
    });
    return () => { subShow.remove(); subHide.remove(); };
  }, [keyboardBottom]);

  // ── Fast path (legacy hardcoded-defaults behavior, unchanged) ─────────────
  const submitFast = (seg: Segment, trimmed: string) => {
    if (seg === "calendar") {
      const evt: CalendarEvent = {
        id: `manual_${Date.now()}`, title: trimmed, date: fmtDate(new Date()),
        time: "09:00", allDay: true, memberId: assignedTo, calendarId: "manual",
        reminder: "0", source: "manual", externalId: null,
      };
      addEvent(evt);
      pushCalendarCreate(evt);
    } else if (seg === "reminder") {
      const evt: CalendarEvent = {
        id: `reminder_${Date.now()}`, title: trimmed, date: fmtDate(new Date()),
        time: new Date().toTimeString().slice(0, 5), allDay: false,
        memberId: assignedTo, calendarId: "manual", reminder: "15",
        source: "manual", externalId: null,
      };
      addEvent(evt);
      pushCalendarCreate(evt);
    } else {
      if (lists.length === 0) return;
      if (lists.length === 1) {
        addTodoItem(lists[0].id, trimmed);
        const addedList = useAppStore.getState().lists.find(l => l.id === lists[0].id);
        const addedItem = addedList?.items[addedList.items.length - 1];
        if (addedItem) pushTaskCreate(lists[0].id, addedItem.id, addedItem.text);
        if (assignedTo) {
          const list = useAppStore.getState().lists.find(l => l.id === lists[0].id);
          const lastItem = list?.items[list.items.length - 1];
          if (lastItem) updateTodoItem(lists[0].id, lastItem.id, { assignedTo });
        }
      } else {
        setShowListPicker(true);
        return; // keep text for modal
      }
    }
    announceAndReset(trimmed, seg);
  };

  // ── Smart path — create entities from a parsed result ─────────────────────
  const submitFromParse = (intents: SmartIntent[], fields: ParsedFields) => {
    const createdKinds: string[] = [];

    const wantEvent = intents.includes("event");
    const wantReminder = intents.includes("reminder");
    // An event+reminder pair collapses into ONE CalendarEvent with a reminder offset,
    // because the app stores reminders as events. Creating two would double-notify.
    if (wantEvent || wantReminder) {
      const isReminderOnly = wantReminder && !wantEvent;
      const reminderMin = fields.reminderOffsetMin ?? 0;
      // User may target multiple calendars (calendarIds); fall back to singular calendarId
      // and finally to "manual". Create one event per target so each calendar gets its copy.
      const targets = (fields.calendarIds && fields.calendarIds.length > 0)
        ? fields.calendarIds
        : [fields.calendarId || "manual"];
      const baseId = Date.now();
      targets.forEach((calendarId, idx) => {
        const evt: CalendarEvent = {
          id: `${isReminderOnly ? "reminder" : "manual"}_${baseId}_${idx}`,
          title: fields.title,
          date: fields.date || fmtDate(new Date()),
          time: fields.time || (fields.allDay ? "00:00" : "09:00"),
          endTime: fields.endTime,
          allDay: !!fields.allDay,
          memberId: fields.memberId ?? assignedTo,
          calendarId,
          reminder: String(reminderMin),
          location: fields.location,
          notes: fields.notes,
          source: "manual",
          externalId: null,
          recurrence: fields.recurrence,
          recurrenceDays: fields.recurrenceDays,
          recurrenceInterval: fields.recurrenceInterval,
        };
        addEvent(evt);
        pushCalendarCreate(evt);
      });
      const kind = wantEvent && wantReminder ? "event with reminder" : wantEvent ? "event" : "reminder";
      createdKinds.push(targets.length > 1 ? `${kind} × ${targets.length}` : kind);
    }

    if (intents.includes("task") && fields.listId) {
      addTodoItem(fields.listId, fields.title);
      const list = useAppStore.getState().lists.find(l => l.id === fields.listId);
      const lastItem = list?.items[list.items.length - 1];
      if (lastItem) {
        pushTaskCreate(fields.listId, lastItem.id, lastItem.text);
        const patch: Partial<TodoItem> = {};
        const assignee = fields.memberId ?? assignedTo;
        if (assignee) patch.assignedTo = assignee;
        if (fields.date) patch.dueDate = fields.date;
        if (fields.time && !fields.allDay) patch.dueTime = fields.time;
        if (fields.notes) patch.notes = fields.notes;
        if (fields.recurrence) patch.recurrence = fields.recurrence;
        if (Object.keys(patch).length) updateTodoItem(fields.listId, lastItem.id, patch);
      }
      createdKinds.push("task");
    }

    const summary = `Added ${createdKinds.join(" + ")}: ${fields.title}`;
    AccessibilityInfo.announceForAccessibility(summary);
    setText("");
    setAssignedTo(null);
  };

  const announceAndReset = (title: string, seg: Segment) => {
    const kind = seg === "calendar" ? "event" : seg === "reminder" ? "reminder" : "task";
    AccessibilityInfo.announceForAccessibility(`Added ${kind}: ${title}`);
    setText("");
    setAssignedTo(null);
  };

  // ── Main submit ───────────────────────────────────────────────────────────
  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const smartEnabled = useAppStore.getState().smartInputEnabled;
    if (!smartEnabled) return submitFast(segment, trimmed);

    const parsed = parseSmartInput(trimmed, {
      now: new Date(),
      members,
      lists,
      calendars: useAppStore.getState().feeds.map(f => ({ id: f.id, name: f.name })),
      defaultSegment: segment,
    });

    const sameAsSegment = parsed.intents.length === 1
      && parsed.intents[0] === intentForSegment(segment);

    // Fast path — plain text with low signal, matches current segment, nothing to ask.
    if (sameAsSegment && parsed.missingFields.length === 0 && parsed.confidence < 0.3) {
      return submitFast(segment, trimmed);
    }

    // Smart direct — one intent, fully specified — no modal needed.
    if (parsed.intents.length === 1 && parsed.missingFields.length === 0) {
      // Seed calendarId/listId from sensible defaults if parser didn't resolve one.
      const fields = { ...parsed.fields };
      if (parsed.intents[0] === "task" && !fields.listId && lists.length === 1) {
        fields.listId = lists[0].id;
      }
      return submitFromParse(parsed.intents, fields);
    }

    // Clarify path.
    setPendingParse(parsed);
    setShowClarify(true);
  };

  // Long-press send: skip smart detection, legacy behavior.
  const handleSubmitLongPress = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    submitFast(segment, trimmed);
  };

  const handlePickList = (listId: string) => {
    const trimmed = text.trim();
    if (trimmed) {
      addTodoItem(listId, trimmed);
      if (assignedTo) {
        const list = useAppStore.getState().lists.find(l => l.id === listId);
        const lastItem = list?.items[list.items.length - 1];
        if (lastItem) updateTodoItem(listId, lastItem.id, { assignedTo });
      }
      announceAndReset(trimmed, "list");
    }
    setShowListPicker(false);
  };

  const handleClarifyConfirm = (sel: { intents: SmartIntent[]; fields: ParsedFields }) => {
    submitFromParse(sel.intents, sel.fields);
    setShowClarify(false);
    setPendingParse(null);
  };

  const segments: { key: Segment; label: string; icon: string }[] = [
    { key: "calendar", label: "Calendar", icon: "calendar-outline" },
    { key: "list",     label: "List",     icon: "list-outline" },
    { key: "reminder", label: "Reminder", icon: "alarm-outline" },
  ];

  const feeds = useAppStore(s => s.feeds);

  return (
    <Animated.View style={[st.container, { bottom: keyboardBottom }]}>
      <View style={st.topRow}>
        <View style={st.segments}>
          {segments.map(s => (
            <TouchableOpacity
              key={s.key}
              style={[st.segBtn, segment === s.key && st.segActive]}
              onPress={() => setSegment(s.key)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${s.label} mode`}
              accessibilityState={{ selected: segment === s.key }}
            >
              <Ionicons
                name={s.icon as any}
                size={14}
                color={segment === s.key ? t.accent : t.textFaint}
              />
              <Text style={[st.segLabel, segment === s.key && st.segLabelActive]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {members.length > 0 && (
          <View style={st.memberChips}>
            <TouchableOpacity
              style={[st.memberChip, !assignedTo && st.memberChipActive]}
              onPress={() => setAssignedTo(null)}
              accessibilityRole="button"
              accessibilityLabel="Assign to all members"
              accessibilityState={{ selected: !assignedTo }}
            >
              <Text style={[st.memberChipText, !assignedTo && { color: t.accent }]}>All</Text>
            </TouchableOpacity>
            {members.map(m => (
              <TouchableOpacity
                key={m.id}
                style={[st.memberChip, assignedTo === m.id && { borderColor: m.color, backgroundColor: m.color + "20" }]}
                onPress={() => setAssignedTo(assignedTo === m.id ? null : m.id)}
                accessibilityRole="button"
                accessibilityLabel={`Assign to ${m.initials}`}
                accessibilityState={{ selected: assignedTo === m.id }}
              >
                <Text style={[st.memberChipText, assignedTo === m.id && { color: m.color }]}>
                  {m.initials}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <View style={st.inputRow}>
        <TextInput
          style={st.input}
          placeholder={
            segment === "calendar" ? "Add event — try 'Dentist tomorrow 3pm'" :
            segment === "reminder" ? "Add reminder — try 'Meds at 8am daily'" :
            "Add to list — try 'Buy milk'"
          }
          placeholderTextColor={t.textFaint}
          value={text}
          onChangeText={setText}
          onSubmitEditing={handleSubmit}
          returnKeyType="done"
          accessibilityLabel={
            segment === "calendar" ? "Add event" :
            segment === "reminder" ? "Add reminder" :
            "Add to list"
          }
          accessibilityHint="Smart detection parses dates, times, repeats, and assignees"
        />
        <TouchableOpacity
          style={st.sendBtn}
          onPress={handleSubmit}
          onLongPress={handleSubmitLongPress}
          delayLongPress={400}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Add ${segment}`}
          accessibilityHint="Long press to skip smart detection"
        >
          <Ionicons name="arrow-up-circle" size={28} color={text.trim() ? t.accent : t.textFaint} />
        </TouchableOpacity>
      </View>

      <Modal visible={showListPicker} transparent animationType="fade" onRequestClose={() => setShowListPicker(false)}>
        <TouchableOpacity style={st.backdrop} activeOpacity={1} onPress={() => setShowListPicker(false)} accessibilityRole="button" accessibilityLabel="Close list picker">
          <View style={st.pickerSheet}>
            <Text style={st.pickerTitle}>Add to which list?</Text>
            <ScrollView>
              {lists.map(l => (
                <TouchableOpacity key={l.id} style={st.pickerRow} onPress={() => handlePickList(l.id)} accessibilityRole="button" accessibilityLabel={`Add to ${l.name}`}>
                  <Text style={st.pickerIcon}>{l.icon}</Text>
                  <Text style={st.pickerName}>{l.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={st.cancelRow} onPress={() => setShowListPicker(false)} accessibilityRole="button" accessibilityLabel="Cancel">
              <Text style={st.cancelLabel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <SmartClarifyModal
        visible={showClarify}
        onClose={() => setShowClarify(false)}
        parse={pendingParse}
        members={members}
        lists={lists}
        calendars={feeds}
        onConfirm={handleClarifyConfirm}
      />
    </Animated.View>
  );
}

function getStyles(t: Theme, bottomInset: number) {
  return StyleSheet.create({
    container:        {
      position: "absolute", left: 0, right: 0, bottom: 0,
      paddingHorizontal: 10, paddingTop: 8,
      // Pad for the nav/gesture bar so the input isn't clipped on modern Androids.
      paddingBottom: Math.max(bottomInset, 10),
      backgroundColor: t.bg,
      borderTopWidth: 1,
      borderTopColor: t.cardBorder,
      // Subtle elevation so the bar visually sits on top of the panels.
      ...Platform.select({
        ios:     { shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: -2 } },
        android: { elevation: 8 },
      }),
    },
    topRow:           { flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                        marginBottom: 6, flexWrap: "wrap", gap: 6 },
    segments:         { flexDirection: "row", gap: 4 },
    segBtn:           { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12,
                        paddingVertical: 5, borderRadius: 16, backgroundColor: t.isDark ? "rgba(255,255,255,.04)" : "rgba(10,32,48,.04)" },
    segActive:        { backgroundColor: t.accentBg, borderWidth: 1, borderColor: t.accent + "40" },
    segLabel:         { fontSize: 12, fontWeight: "500", color: t.textFaint },
    segLabelActive:   { color: t.accent },
    memberChips:      { flexDirection: "row", gap: 4 },
    memberChip:       { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1,
                        borderColor: t.cardBorder, backgroundColor: t.isDark ? "rgba(255,255,255,.04)" : "rgba(10,32,48,.04)" },
    memberChipActive: { borderColor: t.accent + "4D", backgroundColor: t.accentBg },
    memberChipText:   { fontSize: 11, fontWeight: "600", color: t.textFaint },
    inputRow:         { flexDirection: "row", alignItems: "center", gap: 8 },
    input:            { flex: 1, fontSize: 14, color: t.text, backgroundColor: t.input,
                        borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1,
                        borderColor: t.inputBorder },
    sendBtn:          { padding: 2 },
    backdrop:         { flex: 1, backgroundColor: t.modalBd, justifyContent: "center", alignItems: "center" },
    pickerSheet:      { width: "80%", maxWidth: 300, maxHeight: 360, backgroundColor: t.modal, borderRadius: 16,
                        padding: 20, borderWidth: 1, borderColor: t.cardBorder },
    pickerTitle:      { fontSize: 16, fontWeight: "700", color: t.text, textAlign: "center", marginBottom: 14 },
    pickerRow:        { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12,
                        borderBottomWidth: 1, borderBottomColor: t.divider },
    pickerIcon:       { fontSize: 20 },
    pickerName:       { fontSize: 15, fontWeight: "500", color: t.text },
    cancelRow:        { alignItems: "center", paddingVertical: 12, marginTop: 8,
                        borderTopWidth: 1, borderTopColor: t.cardBorder },
    cancelLabel:      { fontSize: 14, color: t.textSub },
  });
}
