import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Modal, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../store/appStore";
import { pushCalendarCreate, pushTaskCreate } from "../services/SyncHelper";
import { useTheme } from "../hooks/useTheme";
import type { Theme } from "../theme";

type Segment = "calendar" | "list" | "reminder";

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
  const st = useMemo(() => getStyles(t), [t]);

  const [segment, setSegment] = useState<Segment>("list");
  const [text, setText] = useState("");
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [showListPicker, setShowListPicker] = useState(false);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (segment === "calendar") {
      const evt = {
        id: `manual_${Date.now()}`, title: trimmed, date: fmtDate(new Date()),
        time: "09:00", allDay: true, memberId: assignedTo, calendarId: "manual",
        reminder: "0", source: "manual" as const, externalId: null,
      };
      addEvent(evt);
      pushCalendarCreate(evt);
      setText("");
      setAssignedTo(null);
    } else if (segment === "reminder") {
      const evt = {
        id: `reminder_${Date.now()}`, title: trimmed, date: fmtDate(new Date()),
        time: new Date().toTimeString().slice(0, 5), allDay: false,
        memberId: assignedTo, calendarId: "manual", reminder: "15",
        source: "manual" as const, externalId: null,
      };
      addEvent(evt);
      pushCalendarCreate(evt);
      setText("");
      setAssignedTo(null);
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
        setText("");
        setAssignedTo(null);
      } else {
        setShowListPicker(true);
      }
    }
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
      setText("");
      setAssignedTo(null);
    }
    setShowListPicker(false);
  };

  const segments: { key: Segment; label: string; icon: string }[] = [
    { key: "calendar", label: "Calendar", icon: "calendar-outline" },
    { key: "list",     label: "List",     icon: "list-outline" },
    { key: "reminder", label: "Reminder", icon: "alarm-outline" },
  ];

  return (
    <View style={st.container}>
      <View style={st.topRow}>
        <View style={st.segments}>
          {segments.map(s => (
            <TouchableOpacity
              key={s.key}
              style={[st.segBtn, segment === s.key && st.segActive]}
              onPress={() => setSegment(s.key)}
              activeOpacity={0.7}
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
            >
              <Text style={[st.memberChipText, !assignedTo && { color: t.accent }]}>All</Text>
            </TouchableOpacity>
            {members.map(m => (
              <TouchableOpacity
                key={m.id}
                style={[st.memberChip, assignedTo === m.id && { borderColor: m.color, backgroundColor: m.color + "20" }]}
                onPress={() => setAssignedTo(assignedTo === m.id ? null : m.id)}
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
            segment === "calendar" ? "Add event..." :
            segment === "reminder" ? "Add reminder..." :
            "Add to list..."
          }
          placeholderTextColor={t.textFaint}
          value={text}
          onChangeText={setText}
          onSubmitEditing={handleSubmit}
          returnKeyType="done"
        />
        <TouchableOpacity style={st.sendBtn} onPress={handleSubmit} activeOpacity={0.7}>
          <Ionicons name="arrow-up-circle" size={28} color={text.trim() ? t.accent : t.textFaint} />
        </TouchableOpacity>
      </View>

      <Modal visible={showListPicker} transparent animationType="fade" onRequestClose={() => setShowListPicker(false)}>
        <TouchableOpacity style={st.backdrop} activeOpacity={1} onPress={() => setShowListPicker(false)}>
          <View style={st.pickerSheet}>
            <Text style={st.pickerTitle}>Add to which list?</Text>
            <ScrollView>
              {lists.map(l => (
                <TouchableOpacity key={l.id} style={st.pickerRow} onPress={() => handlePickList(l.id)}>
                  <Text style={st.pickerIcon}>{l.icon}</Text>
                  <Text style={st.pickerName}>{l.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={st.cancelRow} onPress={() => setShowListPicker(false)}>
              <Text style={st.cancelLabel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function getStyles(t: Theme) {
  return StyleSheet.create({
    container:        { paddingHorizontal: 8, paddingBottom: 8 },
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
