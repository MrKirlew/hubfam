/**
 * ListsScreen.tsx — Interactive To-Do Lists
 *
 * Shows all family lists with toggleable items, ability to add items,
 * and create new lists.
 */

import React, { useState, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, Share, Alert, Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../store/appStore";
import { pushTaskChange } from "../services/SyncOrchestrator";
import { useTheme } from "../hooks/useTheme";
import type { Theme } from "../theme";

const LIST_ICONS = ["🛒","🏠","📚","💼","🎉","🏋️","🍳","📋","🎯","💊"];
const LIST_COLORS = ["#34d399","#60a5fa","#c084fc","#f87171","#fbbf24","#fb923c","#38bdf8","#e879f9","#a78bfa","#f472b6"];

export default function ListsScreen() {
  const t = useTheme();
  const s = useMemo(() => getStyles(t), [t]);

  const lists      = useAppStore(st => st.lists);
  const members    = useAppStore(st => st.members);
  const toggleItem = useAppStore(st => st.toggleTodoItem);
  const addItem    = useAppStore(st => st.addTodoItem);
  const addList    = useAppStore(st => st.addList);

  const [newItemText, setNewItemText] = useState<Record<string, string>>({});
  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListIcon, setNewListIcon] = useState("📋");
  const [newListColor, setNewListColor] = useState("#60a5fa");
  const [newListMemberId, setNewListMemberId] = useState<string | null>(null);
  const removeList = useAppStore(st => st.removeList);
  const feeds = useAppStore(st => st.feeds);
  const [showEmailPicker, setShowEmailPicker] = useState(false);
  const [emailList, setEmailList] = useState<typeof lists[0] | null>(null);

  const handleAddItem = (listId: string) => {
    const text = (newItemText[listId] || "").trim();
    if (!text) return;
    addItem(listId, text);
    setNewItemText(prev => ({ ...prev, [listId]: "" }));
    // Push to Google Tasks if synced
    const list = lists.find(l => l.id === listId);
    if (list?.syncEnabled) {
      const items = useAppStore.getState().lists.find(l => l.id === listId)?.items;
      const newItem = items?.[items.length - 1];
      if (newItem) pushTaskChange(listId, "create", newItem.id, { text });
    }
  };

  const handleCreateList = () => {
    if (!newListName.trim()) return;
    addList({
      id: Date.now().toString(),
      name: newListName.trim(),
      icon: newListIcon,
      color: newListColor,
      memberId: newListMemberId,
      items: [],
    });
    setNewListName("");
    setNewListIcon("📋");
    setNewListColor("#60a5fa");
    setNewListMemberId(null);
    setShowNewList(false);
  };

  const formatListForEmail = (list: typeof lists[0]) => {
    const member = getMember(list.memberId);
    const header = `${list.icon} ${list.name}${member ? ` (${member.name})` : ""}`;
    const items = list.items.map(i => `${i.done ? "✅" : "⬜"} ${i.text}`).join("\n");
    const done = list.items.filter(i => i.done).length;
    return `${header}\n${"─".repeat(30)}\n${items}\n\n${done}/${list.items.length} done — Sent from FamilyHub`;
  };

  const handleShareList = (list: typeof lists[0]) => {
    // Get all unique emails from members' linked Google accounts
    const memberEmails = members.map(m => {
      const email = feeds.find(f => f.type === "gcal" && f.memberId === m.id && f.account)?.account;
      return { id: m.id, name: m.name, color: m.color, email };
    }).filter(m => m.email);

    if (memberEmails.length === 0) {
      // No member emails — fall back to generic share
      Share.share({ message: formatListForEmail(list) }).catch(() => {});
      return;
    }
    // Show member picker
    setEmailList(list);
    setShowEmailPicker(true);
  };

  const handleEmailToMember = async (email: string, list: typeof lists[0]) => {
    const body = formatListForEmail(list);
    const subject = `${list.icon} ${list.name} — FamilyHub`;
    const mailto = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(mailto);
    } catch {
      Alert.alert("Error", "Could not open email app.");
    }
    setShowEmailPicker(false);
    setEmailList(null);
  };

  const handleGenericShare = async (list: typeof lists[0]) => {
    try {
      await Share.share({ message: formatListForEmail(list) });
    } catch {}
    setShowEmailPicker(false);
    setEmailList(null);
  };

  const handleDeleteList = (list: typeof lists[0]) => {
    Alert.alert(`Delete "${list.name}"?`, "This list and all its items will be removed.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => removeList(list.id) },
    ]);
  };

  const getMember = (id: string | null) => members.find(m => m.id === id);

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.scroll}>

        {/* Header */}
        <View style={s.headerRow}>
          <Text style={s.header}>Lists</Text>
          <TouchableOpacity style={s.addListBtn} onPress={() => setShowNewList(true)}>
            <Ionicons name="add" size={20} color={t.accent} />
            <Text style={s.addListBtnText}>New List</Text>
          </TouchableOpacity>
        </View>

        {/* Lists */}
        {lists.map(list => {
          const doneCount = list.items.filter(i => i.done).length;
          const totalCount = list.items.length;
          const member = getMember(list.memberId);

          return (
            <View key={list.id} style={s.listCard}>
              {/* List header */}
              <View style={s.listHeader}>
                <View>
                  <Text style={s.listIcon}>{list.icon}</Text>
                  {list.syncEnabled && (
                    <Ionicons name="cloud-done-outline" size={12} color={t.accent}
                      style={{ position: "absolute", bottom: -2, right: -4 }} />
                  )}
                </View>
                <View style={s.listHeaderInfo}>
                  <Text style={[s.listName, { color: list.color }]}>{list.name}</Text>
                  <Text style={s.listMeta}>
                    {doneCount}/{totalCount} done
                    {member ? ` · ${member.name}` : ""}
                    {list.syncEnabled ? " · Synced" : ""}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <TouchableOpacity onPress={() => handleShareList(list)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="share-outline" size={20} color={t.textSub} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteList(list)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="trash-outline" size={20} color={t.textSub} />
                  </TouchableOpacity>
                  {totalCount > 0 && (
                    <View style={s.progressRing}>
                      <Text style={s.progressText}>
                        {Math.round((doneCount / totalCount) * 100)}%
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Progress bar */}
              {totalCount > 0 && (
                <View style={s.progressTrack}>
                  <View
                    style={[
                      s.progressFill,
                      { width: `${(doneCount / totalCount) * 100}%`, backgroundColor: list.color },
                    ]}
                  />
                </View>
              )}

              {/* Items */}
              {list.items.map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={s.itemRow}
                  onPress={() => {
                    toggleItem(list.id, item.id);
                    if (list.syncEnabled) {
                      pushTaskChange(list.id, "update", item.id, { done: !item.done, text: item.text });
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={item.done ? "checkbox" : "square-outline"}
                    size={22}
                    color={item.done ? list.color : t.textFaint}
                  />
                  <Text style={[s.itemText, item.done && s.itemDone]}>{item.text}</Text>
                </TouchableOpacity>
              ))}

              {/* Add item input */}
              <View style={s.addItemRow}>
                <TextInput
                  style={s.addItemInput}
                  placeholder="Add item..."
                  placeholderTextColor={t.textFaint}
                  value={newItemText[list.id] || ""}
                  onChangeText={tx => setNewItemText(prev => ({ ...prev, [list.id]: tx }))}
                  onSubmitEditing={() => handleAddItem(list.id)}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={[s.addItemBtn, { backgroundColor: list.color + "22" }]}
                  onPress={() => handleAddItem(list.id)}
                >
                  <Ionicons name="add" size={18} color={list.color} />
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        {lists.length === 0 && (
          <View style={s.emptyState}>
            <Ionicons name="list-outline" size={48} color={t.textFaint} />
            <Text style={s.emptyText}>No lists yet</Text>
            <Text style={s.emptySubtext}>Tap "New List" to create one</Text>
          </View>
        )}

      </ScrollView>

      {/* New List Modal */}
      <Modal visible={showNewList} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Create New List</Text>

            <TextInput
              style={s.modalInput}
              placeholder="List name"
              placeholderTextColor={t.textFaint}
              value={newListName}
              onChangeText={setNewListName}
              autoFocus
            />

            <Text style={s.modalLabel}>Icon</Text>
            <View style={s.iconGrid}>
              {LIST_ICONS.map(icon => (
                <TouchableOpacity
                  key={icon}
                  style={[s.iconOption, newListIcon === icon && s.iconOptionSelected]}
                  onPress={() => setNewListIcon(icon)}
                >
                  <Text style={s.iconText}>{icon}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.modalLabel}>Color</Text>
            <View style={s.colorGrid}>
              {LIST_COLORS.map(color => (
                <TouchableOpacity
                  key={color}
                  style={[s.colorOption, { backgroundColor: color }, newListColor === color && s.colorOptionSelected]}
                  onPress={() => setNewListColor(color)}
                />
              ))}
            </View>

            <Text style={s.modalLabel}>Assign to</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 16 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  style={[s.assignChip, newListMemberId === null && s.assignChipActive]}
                  onPress={() => setNewListMemberId(null)}
                >
                  <Text style={[s.assignText, newListMemberId === null && s.assignTextActive]}>Family</Text>
                </TouchableOpacity>
                {members.map(m => (
                  <TouchableOpacity
                    key={m.id}
                    style={[s.assignChip, newListMemberId === m.id && { backgroundColor: m.color + "22", borderColor: m.color + "55" }]}
                    onPress={() => setNewListMemberId(m.id)}
                  >
                    <Text style={[s.assignText, newListMemberId === m.id && { color: m.color }]}>{m.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={s.modalButtons}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setShowNewList(false)}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalCreateBtn} onPress={handleCreateList}>
                <Text style={s.modalCreateText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Email to Member Picker */}
      <Modal visible={showEmailPicker} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Send List To</Text>
            <Text style={{ color: t.textSub, fontSize: 13, marginBottom: 16 }}>
              Choose a family member to email this list, or share it another way.
            </Text>

            {members.map(m => {
              const email = feeds.find(f => f.type === "gcal" && f.memberId === m.id && f.account)?.account;
              if (!email) return null;
              return (
                <TouchableOpacity
                  key={m.id}
                  style={{
                    flexDirection: "row", alignItems: "center", paddingVertical: 12,
                    paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: t.divider,
                  }}
                  onPress={() => emailList && handleEmailToMember(email, emailList)}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: m.color, alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                    <Text style={{ color: t.textOnAccent, fontWeight: "700", fontSize: 13 }}>{m.initials}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.text, fontSize: 15, fontWeight: "600" }}>{m.name}</Text>
                    <Text style={{ color: t.textSub, fontSize: 12 }}>{email}</Text>
                  </View>
                  <Ionicons name="mail-outline" size={20} color={t.textSub} />
                </TouchableOpacity>
              );
            })}

            <View style={[s.modalButtons, { marginTop: 16 }]}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => { setShowEmailPicker(false); setEmailList(null); }}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalCreateBtn} onPress={() => emailList && handleGenericShare(emailList)}>
                <Text style={s.modalCreateText}>Share Other</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function getStyles(t: Theme) {
  return StyleSheet.create({
    container:    { flex: 1, backgroundColor: t.bg },
    scroll:       { padding: 24, paddingBottom: 40 },

    headerRow:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
    header:       { fontSize: 28, fontWeight: "700", color: t.text },
    addListBtn:   { flexDirection: "row", alignItems: "center", gap: 4,
                    backgroundColor: t.accentBg, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
    addListBtnText:{ fontSize: 14, fontWeight: "600", color: t.accent },

    listCard:     { backgroundColor: t.input, borderWidth: 1,
                    borderColor: t.cardBorder, borderRadius: 16, marginBottom: 16, overflow: "hidden" },
    listHeader:   { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
    listIcon:     { fontSize: 28 },
    listHeaderInfo:{ flex: 1 },
    listName:     { fontSize: 17, fontWeight: "700" },
    listMeta:     { fontSize: 12, color: t.textSub, marginTop: 2 },
    progressRing: { backgroundColor: t.cardBorder, borderRadius: 20, width: 40, height: 40,
                    alignItems: "center", justifyContent: "center" },
    progressText: { fontSize: 11, fontWeight: "700", color: t.textSub },

    progressTrack:{ height: 3, backgroundColor: t.cardBorder, marginHorizontal: 16, borderRadius: 2 },
    progressFill: { height: 3, borderRadius: 2 },

    itemRow:      { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
    itemText:     { fontSize: 15, color: t.text, flex: 1 },
    itemDone:     { textDecorationLine: "line-through", color: t.textFaint },

    addItemRow:   { flexDirection: "row", alignItems: "center", padding: 12, gap: 8,
                    borderTopWidth: 1, borderTopColor: t.divider },
    addItemInput: { flex: 1, fontSize: 14, color: t.text, backgroundColor: t.isDark ? "rgba(255,255,255,.05)" : "rgba(10,32,48,.05)",
                    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
    addItemBtn:   { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },

    emptyState:   { alignItems: "center", paddingTop: 80, gap: 8 },
    emptyText:    { fontSize: 18, color: t.textFaint, fontWeight: "600" },
    emptySubtext: { fontSize: 14, color: t.textFaint },

    modalOverlay: { flex: 1, backgroundColor: t.modalBd, justifyContent: "center", alignItems: "center", padding: 24 },
    modalCard:    { backgroundColor: t.modal, borderRadius: 20, padding: 24, width: "100%", maxWidth: 420 },
    modalTitle:   { fontSize: 20, fontWeight: "700", color: t.text, marginBottom: 20 },
    modalInput:   { fontSize: 16, color: t.text, backgroundColor: t.inputBorder,
                    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16 },
    modalLabel:   { fontSize: 13, color: t.textSub, fontWeight: "600", marginBottom: 8,
                    letterSpacing: 1, textTransform: "uppercase" },
    iconGrid:     { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
    iconOption:   { width: 44, height: 44, borderRadius: 12, backgroundColor: t.input,
                    alignItems: "center", justifyContent: "center" },
    iconOptionSelected: { backgroundColor: t.accentBg, borderWidth: 1, borderColor: t.accent },
    iconText:     { fontSize: 22 },
    assignChip:        { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                         backgroundColor: t.input, borderWidth: 1, borderColor: t.cardBorder },
    assignChipActive:  { backgroundColor: t.accentBg, borderColor: t.accent + "66" },
    assignText:        { fontSize: 13, fontWeight: "600", color: t.textSub },
    assignTextActive:  { color: t.accent },
    colorGrid:    { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 24 },
    colorOption:  { width: 32, height: 32, borderRadius: 16 },
    colorOptionSelected: { borderWidth: 3, borderColor: t.textOnAccent },
    modalButtons: { flexDirection: "row", gap: 12 },
    modalCancelBtn:{ flex: 1, backgroundColor: t.cardBorder, borderRadius: 12, padding: 14, alignItems: "center" },
    modalCancelText:{ fontSize: 15, color: t.textSub, fontWeight: "600" },
    modalCreateBtn:{ flex: 1, backgroundColor: t.accent, borderRadius: 12, padding: 14, alignItems: "center" },
    modalCreateText:{ fontSize: 15, color: t.textOnAccent, fontWeight: "600" },
  });
}
