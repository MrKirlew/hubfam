import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from "react-native";
import ModalSheet from "../ModalSheet";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../../store/appStore";
import type { WidgetConfig, TodoItem } from "../../store/appStore";
import { pushTaskCreate, pushTaskUpdate, pushTaskDelete, pushTaskToggle } from "../../services/SyncHelper";
import { useTheme } from "../../hooks/useTheme";
import type { Theme } from "../../theme";

export default function TodoListWidget({ config }: { config: WidgetConfig }) {
  const lists = useAppStore(s => s.lists);
  const members = useAppStore(s => s.members);
  const toggleTodoItem = useAppStore(s => s.toggleTodoItem);
  const addTodoItem = useAppStore(s => s.addTodoItem);
  const updateTodoItem = useAppStore(s => s.updateTodoItem);
  const removeTodoItem = useAppStore(s => s.removeTodoItem);

  const [newItemText, setNewItemText] = useState("");
  const [newItemNotes, setNewItemNotes] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [detailItem, setDetailItem] = useState<(TodoItem & { listId: string }) | null>(null);
  const [detailTitle, setDetailTitle] = useState("");
  const [detailNotes, setDetailNotes] = useState("");
  const t = useTheme();
  const s = useMemo(() => getStyles(t), [t]);

  const list = config.listId ? lists.find(l => l.id === config.listId) : null;

  const handleToggle = (listId: string, itemId: string) => {
    const item = lists.find(l => l.id === listId)?.items.find(i => i.id === itemId);
    toggleTodoItem(listId, itemId);
    if (item) pushTaskToggle(listId, itemId, !item.done, item.text);
  };

  const handleRemove = (listId: string, itemId: string) => {
    pushTaskDelete(listId, itemId);
    removeTodoItem(listId, itemId);
  };

  const cycleAssignment = (listId: string, itemId: string, currentAssignee?: string) => {
    if (members.length === 0) return;
    const currentIdx = currentAssignee ? members.findIndex(m => m.id === currentAssignee) : -1;
    const nextIdx = currentIdx + 1;
    const nextMember = nextIdx < members.length ? members[nextIdx].id : undefined;
    updateTodoItem(listId, itemId, { assignedTo: nextMember });
  };

  const getMemberInitials = (memberId?: string): string | null => {
    if (!memberId) return null;
    return members.find(m => m.id === memberId)?.initials || null;
  };

  const getMemberColor = (memberId?: string): string => {
    if (!memberId) return t.textFaint;
    return members.find(m => m.id === memberId)?.color || t.textFaint;
  };

  const handleAddItem = (listId: string) => {
    if (newItemText.trim()) {
      addTodoItem(listId, newItemText.trim());
      const updatedList = useAppStore.getState().lists.find(l => l.id === listId);
      const lastItem = updatedList?.items[updatedList.items.length - 1];
      if (lastItem) {
        if (newItemNotes.trim()) {
          updateTodoItem(listId, lastItem.id, { notes: newItemNotes.trim() });
        }
        pushTaskCreate(listId, lastItem.id, lastItem.text);
      }
      setNewItemText("");
      setNewItemNotes("");
      setShowAddModal(false);
    }
  };

  const openAddModal = () => {
    setNewItemText("");
    setNewItemNotes("");
    setShowAddModal(true);
  };

  const openDetail = (item: TodoItem, listId: string) => {
    setDetailItem({ ...item, listId });
    setDetailTitle(item.text);
    setDetailNotes(item.notes || "");
  };

  const saveDetail = () => {
    if (!detailItem || !list) return;
    const titleChanged = detailTitle.trim() !== detailItem.text;
    const notesChanged = detailNotes.trim() !== (detailItem.notes || "");
    if (titleChanged || notesChanged) {
      const patch: Partial<TodoItem> = {};
      if (titleChanged) patch.text = detailTitle.trim();
      if (notesChanged) patch.notes = detailNotes.trim();
      updateTodoItem(list.id, detailItem.id, patch);
      pushTaskUpdate(list.id, detailItem.id, {
        text: titleChanged ? detailTitle.trim() : detailItem.text,
        notes: detailNotes.trim(),
      });
    }
    setDetailItem(null);
  };

  if (list) {
    const done = list.items.filter(i => i.done).length;
    const total = list.items.length;
    return (
      <View style={s.container} accessibilityLiveRegion="polite">
        <View style={s.header}>
          <Text style={s.title}>{list.icon} {list.name}</Text>
          <Text style={s.count}>{done}/{total}</Text>
        </View>
        <ScrollView style={s.list} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {list.items.map(item => (
            <View key={item.id} style={s.itemRow}>
              <TouchableOpacity
                onPress={() => handleToggle(list.id, item.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="checkbox"
                accessibilityLabel={`Toggle ${item.text}`}
                accessibilityState={{ checked: item.done }}
              >
                <Ionicons
                  name={item.done ? "checkbox" : "square-outline"}
                  size={20}
                  color={item.done ? t.success : t.textFaint}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={s.textArea}
                onPress={() => openDetail(item, list.id)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${item.text}`}
                accessibilityHint="Opens task details"
              >
                <Text style={[s.itemText, item.done && s.itemDone]} numberOfLines={1}>
                  {item.text}
                </Text>
                {item.notes ? (
                  <Text style={s.itemNotes} numberOfLines={1}>
                    {item.notes}
                  </Text>
                ) : null}
              </TouchableOpacity>
              {item.notes ? (
                <Ionicons name="document-text-outline" size={14} color={t.textFaint} style={{ marginRight: -2 }} />
              ) : null}
              <TouchableOpacity
                onPress={() => cycleAssignment(list.id, item.id, item.assignedTo)}
                style={[s.assignBadge, { borderColor: getMemberColor(item.assignedTo) }]}
                accessibilityRole="button"
                accessibilityLabel={`Assign ${item.text}, currently ${getMemberInitials(item.assignedTo) || "unassigned"}`}
                accessibilityHint="Tap to cycle assignment"
              >
                {getMemberInitials(item.assignedTo) ? (
                  <Text style={[s.assignText, { color: getMemberColor(item.assignedTo) }]}>
                    {getMemberInitials(item.assignedTo)}
                  </Text>
                ) : (
                  <Ionicons name="person-outline" size={12} color={t.textFaint} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleRemove(list.id, item.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${item.text}`}
              >
                <Ionicons name="close-circle-outline" size={18} color={t.textFaint} />
              </TouchableOpacity>
            </View>
          ))}
          {list.items.length === 0 && (
            <Text style={s.empty}>No items yet</Text>
          )}
        </ScrollView>

        <TouchableOpacity style={s.addRow} onPress={openAddModal} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`Add item to ${list.name}`}>
          <View style={s.addPlaceholder}>
            <Ionicons name="add-circle" size={18} color={list.color || t.accent} />
            <Text style={s.addPlaceholderText}>Add item...</Text>
          </View>
        </TouchableOpacity>

        {/* Add item modal */}
        <ModalSheet visible={showAddModal} onClose={() => setShowAddModal(false)}>
          <Text style={s.sheetTitle}>{list.icon} Add to {list.name}</Text>
          <Text style={s.fieldLabel}>Title</Text>
          <TextInput
            style={s.sheetInput}
            placeholder="What needs to be added?"
            placeholderTextColor={t.textFaint}
            value={newItemText}
            onChangeText={setNewItemText}
            returnKeyType="next"
            autoFocus
            accessibilityLabel="Item title"
          />
          <Text style={s.fieldLabel}>Details / Notes</Text>
          <TextInput
            style={[s.sheetInput, s.notesInput]}
            placeholder="Add details, sub-items, links..."
            placeholderTextColor={t.textFaint}
            value={newItemNotes}
            onChangeText={setNewItemNotes}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Item notes"
          />
          <View style={s.sheetActions}>
            <TouchableOpacity style={s.sheetCancel} onPress={() => setShowAddModal(false)} accessibilityRole="button" accessibilityLabel="Cancel">
              <Text style={s.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.sheetBtn, { backgroundColor: list.color || t.accent },
                !newItemText.trim() && { opacity: 0.4 }]}
              onPress={() => handleAddItem(list.id)}
              accessibilityRole="button"
              accessibilityLabel="Add item"
            >
              <Ionicons name="add-circle" size={18} color={t.textOnAccent} />
              <Text style={s.sheetBtnText}>Add Item</Text>
            </TouchableOpacity>
          </View>
        </ModalSheet>

        {/* Detail / edit modal — shows full title + notes */}
        <ModalSheet visible={detailItem !== null} onClose={saveDetail}>
          <View style={s.detailHeader}>
            <Text style={s.sheetTitle}>Task Details</Text>
            <TouchableOpacity onPress={saveDetail} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Close task details">
              <Ionicons name="close" size={22} color={t.textFaint} />
            </TouchableOpacity>
          </View>
          <Text style={s.fieldLabel}>Title</Text>
          <TextInput
            style={s.sheetInput}
            value={detailTitle}
            onChangeText={setDetailTitle}
            placeholder="Task title..."
            placeholderTextColor={t.textFaint}
            autoFocus
            accessibilityLabel="Task title"
          />
          <Text style={s.fieldLabel}>Details / Notes</Text>
          <TextInput
            style={[s.sheetInput, s.notesInput]}
            value={detailNotes}
            onChangeText={setDetailNotes}
            placeholder="Add details, sub-items, links..."
            placeholderTextColor={t.textFaint}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Task notes"
          />
          <View style={s.sheetActions}>
            <TouchableOpacity style={s.sheetCancel} onPress={() => setDetailItem(null)} accessibilityRole="button" accessibilityLabel="Cancel">
              <Text style={s.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.sheetBtn, { backgroundColor: list.color || t.accent }]}
              onPress={saveDetail}
              accessibilityRole="button"
              accessibilityLabel="Save task"
            >
              <Ionicons name="checkmark-circle" size={18} color={t.textOnAccent} />
              <Text style={s.sheetBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </ModalSheet>
      </View>
    );
  }

  // No specific list — show summary of all lists
  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>All Lists</Text>
        <Text style={s.count}>{lists.length} list{lists.length !== 1 ? "s" : ""}</Text>
      </View>
      <ScrollView style={s.list} nestedScrollEnabled>
        {lists.map(l => {
          const done = l.items.filter(i => i.done).length;
          const pending = l.items.length - done;
          return (
            <View key={l.id} style={s.summaryRow}>
              <Text style={s.summaryIcon}>{l.icon}</Text>
              <View style={s.summaryInfo}>
                <Text style={s.summaryName}>{l.name}</Text>
                <Text style={s.summaryMeta}>{pending} pending · {done} done</Text>
              </View>
              <View style={s.progressBar}>
                <View style={[s.progressFill, {
                  width: l.items.length > 0 ? `${(done / l.items.length) * 100}%` : "0%",
                  backgroundColor: l.color,
                }]} />
              </View>
            </View>
          );
        })}
        {lists.length === 0 && (
          <Text style={s.empty}>No lists yet</Text>
        )}
      </ScrollView>
    </View>
  );
}

function getStyles(t: Theme) {
  return StyleSheet.create({
    container:    { flex: 1 },
    header:       { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    title:        { fontSize: 18, fontWeight: "700", color: t.text },
    count:        { fontSize: 12, color: t.textSub },
    list:         { flex: 1 },
    empty:        { fontSize: 14, color: t.textFaint, textAlign: "center", marginTop: 24 },
    itemRow:      { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8,
                    borderBottomWidth: 1, borderBottomColor: t.divider },
    textArea:     { flex: 1 },
    itemText:     { fontSize: 14, color: t.text },
    itemDone:     { textDecorationLine: "line-through", color: t.textFaint },
    itemNotes:    { fontSize: 11, color: t.textFaint, marginTop: 2 },
    assignBadge:  { width: 22, height: 22, borderRadius: 11, borderWidth: 1,
                    alignItems: "center", justifyContent: "center" },
    assignText:   { fontSize: 9, fontWeight: "700" },
    addRow:       { flexDirection: "row", alignItems: "center", paddingTop: 8,
                    borderTopWidth: 1, borderTopColor: t.cardBorder },
    addPlaceholder: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
                      backgroundColor: t.input, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
    addPlaceholderText: { fontSize: 13, color: t.textFaint },
    backdrop:     { flex: 1, backgroundColor: t.modalBd, justifyContent: "center", alignItems: "center" },
    sheet:        { width: "85%", maxWidth: 440, backgroundColor: t.modal, borderRadius: 16,
                    padding: 20, borderWidth: 1, borderColor: t.cardBorder },
    sheetTitle:   { fontSize: 16, fontWeight: "700", color: t.text, marginBottom: 4 },
    detailHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
    fieldLabel:   { fontSize: 12, fontWeight: "600", color: t.textSub, marginTop: 12, marginBottom: 6 },
    sheetInput:   { fontSize: 15, color: t.text, backgroundColor: t.input, borderRadius: 10,
                    paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: t.inputBorder },
    notesInput:   { minHeight: 100, maxHeight: 200 },
    sheetActions: { flexDirection: "row", gap: 10, marginTop: 16 },
    sheetCancel:  { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center",
                    backgroundColor: t.input },
    sheetCancelText: { fontSize: 14, fontWeight: "600", color: t.textSub },
    sheetBtn:     { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center",
                    flexDirection: "row", justifyContent: "center", gap: 6 },
    sheetBtnText: { fontSize: 14, fontWeight: "600", color: t.textOnAccent },
    summaryRow:   { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10,
                    borderBottomWidth: 1, borderBottomColor: t.divider },
    summaryIcon:  { fontSize: 20 },
    summaryInfo:  { flex: 1 },
    summaryName:  { fontSize: 14, fontWeight: "600", color: t.text },
    summaryMeta:  { fontSize: 12, color: t.textSub, marginTop: 2 },
    progressBar:  { width: 60, height: 4, backgroundColor: t.cardBorder, borderRadius: 2, overflow: "hidden" },
    progressFill: { height: 4, borderRadius: 2 },
  });
}
