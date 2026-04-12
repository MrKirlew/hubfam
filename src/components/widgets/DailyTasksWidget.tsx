import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal } from "react-native";
import ModalSheet from "../ModalSheet";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../../store/appStore";
import { useTheme } from "../../hooks/useTheme";
import type { Theme } from "../../theme";
import { pushTaskCreate, pushTaskToggle, pushTaskUpdate, pushTaskDelete } from "../../services/SyncHelper";

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface DailyItem {
  id: string; text: string; done: boolean; assignedTo?: string;
  listId: string; listName: string; listColor: string;
  googleTaskId?: string; dueDate?: string; notes?: string;
}

export default function DailyTasksWidget({ compact }: { compact?: boolean }) {
  const lists = useAppStore(s => s.lists);
  const members = useAppStore(s => s.members);
  const toggleTodoItem = useAppStore(s => s.toggleTodoItem);
  const addTodoItem = useAppStore(s => s.addTodoItem);
  const updateTodoItem = useAppStore(s => s.updateTodoItem);
  const removeTodoItem = useAppStore(s => s.removeTodoItem);
  const t = useTheme();
  const s = useMemo(() => getStyles(t), [t]);

  const [newItemText, setNewItemText] = useState("");
  const [showListPicker, setShowListPicker] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [detailItem, setDetailItem] = useState<DailyItem | null>(null);
  const [detailText, setDetailText] = useState("");

  const today = fmtDate(new Date());

  const dailyItems: DailyItem[] = lists.flatMap(l =>
    l.items
      .filter(i => i.dueDate === today)
      .map(i => ({ ...i, listId: l.id, listName: l.name, listColor: l.color }))
  );

  const done = dailyItems.filter(i => i.done).length;

  const handleToggle = (listId: string, itemId: string) => {
    const item = lists.find(l => l.id === listId)?.items.find(i => i.id === itemId);
    toggleTodoItem(listId, itemId);
    if (item) pushTaskToggle(listId, itemId, !item.done, item.text);
  };

  const handleRemove = (item: DailyItem) => {
    pushTaskDelete(item.listId, item.id);
    removeTodoItem(item.listId, item.id);
    setDetailItem(null);
  };

  const cycleAssignment = (listId: string, itemId: string, currentAssignee?: string) => {
    if (members.length === 0) return;
    const currentIdx = currentAssignee ? members.findIndex(m => m.id === currentAssignee) : -1;
    const nextIdx = currentIdx + 1;
    const nextMember = nextIdx < members.length ? members[nextIdx].id : undefined;
    updateTodoItem(listId, itemId, { assignedTo: nextMember });
  };

  const getMemberName = (memberId?: string): string | null => {
    if (!memberId) return null;
    return members.find(m => m.id === memberId)?.name || null;
  };

  const getMemberColor = (memberId?: string): string => {
    if (!memberId) return t.textFaint;
    return members.find(m => m.id === memberId)?.color || t.textFaint;
  };

  const handleAddSubmit = () => {
    const trimmed = newItemText.trim();
    if (!trimmed || lists.length === 0) return;
    if (lists.length === 1) {
      addToList(lists[0].id, trimmed);
    } else {
      setShowAddModal(false);
      setShowListPicker(true);
    }
  };

  const addToList = (listId: string, text: string) => {
    addTodoItem(listId, text);
    const updatedList = useAppStore.getState().lists.find(l => l.id === listId);
    const lastItem = updatedList?.items[updatedList.items.length - 1];
    if (lastItem) {
      updateTodoItem(listId, lastItem.id, { dueDate: today });
      pushTaskCreate(listId, lastItem.id, lastItem.text);
    }
    setNewItemText("");
    setShowAddModal(false);
    setShowListPicker(false);
  };

  const handlePickList = (listId: string) => {
    const trimmed = newItemText.trim();
    if (trimmed) addToList(listId, trimmed);
    else setShowListPicker(false);
  };

  const openAddModal = () => { setNewItemText(""); setShowAddModal(true); };

  const openDetail = (item: DailyItem) => {
    setDetailItem(item);
    setDetailText(item.text);
  };

  const saveDetail = () => {
    if (!detailItem) return;
    if (detailText.trim() && detailText.trim() !== detailItem.text) {
      updateTodoItem(detailItem.listId, detailItem.id, { text: detailText.trim() });
      pushTaskUpdate(detailItem.listId, detailItem.id, { text: detailText.trim() });
    }
    setDetailItem(null);
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={[s.title, compact && { fontSize: 14 }]}>Daily Tasks</Text>
        <Text style={s.count}>{done}/{dailyItems.length}</Text>
      </View>

      <ScrollView style={s.list} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {dailyItems.length === 0 ? (
          <Text style={[s.empty, compact && { fontSize: 11, marginTop: 8 }]}>
            {lists.length === 0 ? "Create a list first" : "No tasks due today"}
          </Text>
        ) : (
          dailyItems.map(item => (
            <TouchableOpacity
              key={item.id}
              style={s.itemRow}
              onPress={() => openDetail(item)}
              activeOpacity={0.7}
            >
              <TouchableOpacity
                onPress={() => handleToggle(item.listId, item.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={item.done ? "checkbox" : "square-outline"}
                  size={compact ? 16 : 20}
                  color={item.done ? t.success : t.textFaint}
                />
              </TouchableOpacity>
              <View style={s.textArea}>
                <Text style={[s.itemText, compact && { fontSize: 12 }, item.done && s.itemDone]} numberOfLines={1}>
                  {item.text}
                </Text>
                {!compact && (
                  <Text style={s.itemList}>
                    {item.listName}
                    {item.assignedTo ? ` · ${getMemberName(item.assignedTo) || ""}` : ""}
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={14} color={t.textFaint} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Add task button — always visible, adapts to compact */}
      {lists.length > 0 && (
        <TouchableOpacity style={s.addRow} onPress={openAddModal} activeOpacity={0.7}>
          <View style={s.addPlaceholder}>
            <Ionicons name="add-circle" size={compact ? 14 : 18} color={t.textFaint} />
            <Text style={[s.addPlaceholderText, compact && { fontSize: 11 }]}>
              {compact ? "Add..." : "Add task for today..."}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Add task modal */}
      <ModalSheet visible={showAddModal} onClose={() => setShowAddModal(false)}>
        <Text style={s.sheetTitle}>Add Daily Task</Text>
        <TextInput
          style={s.sheetInput}
          placeholder="What needs to be done today?"
          placeholderTextColor={t.textFaint}
          value={newItemText}
          onChangeText={setNewItemText}
          onSubmitEditing={handleAddSubmit}
          returnKeyType="done"
          autoFocus
        />
        <View style={s.sheetActions}>
          <TouchableOpacity style={s.sheetCancel} onPress={() => setShowAddModal(false)}>
            <Text style={s.sheetCancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.sheetBtn, !newItemText.trim() && { opacity: 0.4 }]}
            onPress={handleAddSubmit}
          >
            <Ionicons name="add-circle" size={18} color={t.textOnAccent} />
            <Text style={s.sheetBtnText}>Add Task</Text>
          </TouchableOpacity>
        </View>
      </ModalSheet>

      {/* Detail modal — view, edit, delete, assign from any panel size */}
      <ModalSheet visible={detailItem !== null} onClose={saveDetail}>
        {detailItem && (
          <>
            <View style={s.detailHeader}>
              <Text style={s.sheetTitle}>Task Details</Text>
              <TouchableOpacity onPress={saveDetail} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={t.textFaint} />
              </TouchableOpacity>
            </View>

            <Text style={s.fieldLabel}>Title</Text>
            <TextInput
              style={s.sheetInput}
              value={detailText}
              onChangeText={setDetailText}
              placeholder="Task title..."
              placeholderTextColor={t.textFaint}
              autoFocus
            />

            <Text style={s.fieldLabel}>List</Text>
            <Text style={s.detailMeta}>{detailItem.listName}</Text>

            <Text style={s.fieldLabel}>Status</Text>
            <TouchableOpacity
              style={s.detailStatusRow}
              onPress={() => {
                handleToggle(detailItem.listId, detailItem.id);
                setDetailItem({ ...detailItem, done: !detailItem.done });
              }}
            >
              <Ionicons
                name={detailItem.done ? "checkbox" : "square-outline"}
                size={20}
                color={detailItem.done ? t.success : t.textFaint}
              />
              <Text style={[s.detailMeta, { marginLeft: 8 }]}>
                {detailItem.done ? "Completed" : "Not completed"}
              </Text>
            </TouchableOpacity>

            {members.length > 0 && (
              <>
                <Text style={s.fieldLabel}>Assigned To</Text>
                <TouchableOpacity
                  style={s.detailStatusRow}
                  onPress={() => {
                    cycleAssignment(detailItem.listId, detailItem.id, detailItem.assignedTo);
                    const currentIdx = detailItem.assignedTo
                      ? members.findIndex(m => m.id === detailItem.assignedTo) : -1;
                    const nextIdx = currentIdx + 1;
                    const nextMember = nextIdx < members.length ? members[nextIdx].id : undefined;
                    setDetailItem({ ...detailItem, assignedTo: nextMember });
                  }}
                >
                  <Ionicons name="person-circle-outline" size={20}
                    color={getMemberColor(detailItem.assignedTo)} />
                  <Text style={[s.detailMeta, { marginLeft: 8 }]}>
                    {getMemberName(detailItem.assignedTo) || "Unassigned — tap to assign"}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            <View style={s.sheetActions}>
              <TouchableOpacity
                style={s.deleteBtn}
                onPress={() => handleRemove(detailItem)}
              >
                <Ionicons name="trash-outline" size={16} color={t.error} />
                <Text style={[s.sheetCancelText, { color: t.error }]}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.sheetBtn} onPress={saveDetail}>
                <Ionicons name="checkmark-circle" size={18} color={t.textOnAccent} />
                <Text style={s.sheetBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ModalSheet>

      {/* List picker modal */}
      <Modal visible={showListPicker} transparent animationType="fade" onRequestClose={() => setShowListPicker(false)}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => setShowListPicker(false)}>
          <View style={s.pickerSheet}>
            <Text style={s.pickerTitle}>Add to which list?</Text>
            <ScrollView>
              {lists.map(l => (
                <TouchableOpacity key={l.id} style={s.pickerRow} onPress={() => handlePickList(l.id)}>
                  <Text style={s.pickerIcon}>{l.icon}</Text>
                  <Text style={s.pickerName}>{l.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={s.cancelRow} onPress={() => setShowListPicker(false)}>
              <Text style={s.cancelLabel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
    itemRow:     { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6,
                   borderBottomWidth: 1, borderBottomColor: t.divider },
    textArea:    { flex: 1 },
    itemText:    { fontSize: 14, color: t.text },
    itemDone:    { textDecorationLine: "line-through", color: t.textFaint },
    itemList:    { fontSize: 11, color: t.textFaint, marginTop: 1 },
    addRow:      { flexDirection: "row", alignItems: "center", paddingTop: 6,
                   borderTopWidth: 1, borderTopColor: t.cardBorder },
    addPlaceholder: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6,
                      backgroundColor: t.input, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
    addPlaceholderText: { fontSize: 13, color: t.textFaint },
    backdrop:    { flex: 1, backgroundColor: t.modalBd, justifyContent: "center", alignItems: "center" },
    sheet:       { width: "85%", maxWidth: 440, backgroundColor: t.modal, borderRadius: 16,
                   padding: 20, borderWidth: 1, borderColor: t.cardBorder },
    sheetTitle:  { fontSize: 16, fontWeight: "700", color: t.text, marginBottom: 4 },
    detailHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
    fieldLabel:  { fontSize: 12, fontWeight: "600", color: t.textSub, marginTop: 12, marginBottom: 6 },
    sheetInput:  { fontSize: 15, color: t.text, backgroundColor: t.input, borderRadius: 10,
                   paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: t.inputBorder },
    detailMeta:  { fontSize: 14, color: t.text },
    detailStatusRow: { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
    sheetActions: { flexDirection: "row", gap: 10, marginTop: 20 },
    sheetCancel: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center",
                   backgroundColor: t.input },
    sheetCancelText: { fontSize: 14, fontWeight: "600", color: t.textSub },
    sheetBtn:    { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center",
                   flexDirection: "row", justifyContent: "center", gap: 6, backgroundColor: t.accent },
    sheetBtnText: { fontSize: 14, fontWeight: "600", color: t.textOnAccent },
    deleteBtn:   { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center",
                   flexDirection: "row", justifyContent: "center", gap: 6,
                   backgroundColor: t.input, borderWidth: 1, borderColor: t.error + "40" },
    pickerSheet: { width: "80%", maxWidth: 300, maxHeight: 360, backgroundColor: t.modal, borderRadius: 16,
                   padding: 20, borderWidth: 1, borderColor: t.cardBorder },
    pickerTitle: { fontSize: 16, fontWeight: "700", color: t.text, textAlign: "center", marginBottom: 14 },
    pickerRow:   { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12,
                   borderBottomWidth: 1, borderBottomColor: t.divider },
    pickerIcon:  { fontSize: 20 },
    pickerName:  { fontSize: 15, fontWeight: "500", color: t.text },
    cancelRow:   { alignItems: "center", paddingVertical: 12, marginTop: 8,
                   borderTopWidth: 1, borderTopColor: t.cardBorder },
    cancelLabel: { fontSize: 14, color: t.textSub },
  });
}
