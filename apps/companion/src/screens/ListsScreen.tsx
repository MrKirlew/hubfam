import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { newId, visibleItems, type ListOp } from "@familyhub/shared";
import { useCompanionStore } from "../store/companionStore";
import { sendListOp } from "../services/CompanionTransportService";

export default function ListsScreen() {
  const lists = useCompanionStore((s) => s.sharedLists);
  const deviceId = useCompanionStore((s) => s.deviceId) || "companion";
  const [newListName, setNewListName] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const mkOp = useCallback(
    (partial: any): ListOp => ({ opId: newId(), ts: Date.now(), deviceId, ...partial }) as ListOp,
    [deviceId],
  );

  const createList = () => {
    const name = newListName.trim();
    if (!name) return;
    void sendListOp(mkOp({ k: "create-list", listId: newId(), name }));
    setNewListName("");
  };
  const addItem = (listId: string) => {
    const text = (drafts[listId] || "").trim();
    if (!text) return;
    void sendListOp(mkOp({ k: "add-item", listId, item: { id: newId(), text, done: false, updatedAt: Date.now() } }));
    setDrafts((d) => ({ ...d, [listId]: "" }));
  };
  const toggle = (listId: string, itemId: string, done: boolean) => void sendListOp(mkOp({ k: "toggle-item", listId, itemId, done }));
  const delItem = (listId: string, itemId: string) => void sendListOp(mkOp({ k: "delete-item", listId, itemId }));
  const commitRename = (listId: string) => {
    const name = editName.trim();
    if (name) void sendListOp(mkOp({ k: "rename-list", listId, name }));
    setEditingId(null);
  };
  const deleteList = (listId: string, name: string) =>
    Alert.alert("Delete list?", `"${name}" will be removed for everyone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void sendListOp(mkOp({ k: "delete-list", listId })) },
    ]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Shared Lists</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.newRow}>
          <TextInput
            style={styles.newInput}
            value={newListName}
            onChangeText={setNewListName}
            placeholder="New list name…"
            placeholderTextColor="#5b6478"
            onSubmitEditing={createList}
            returnKeyType="done"
          />
          <TouchableOpacity style={styles.newBtn} onPress={createList} accessibilityRole="button" accessibilityLabel="Create list">
            <Text style={styles.newBtnText}>+ List</Text>
          </TouchableOpacity>
        </View>

        {lists.length === 0 && (
          <Text style={styles.empty}>No shared lists yet. Create one — it shows up on the hub and any paired phone.</Text>
        )}

        {lists.map((l) => {
          const items = visibleItems(l);
          const done = items.filter((i) => i.done).length;
          return (
            <View key={l.id} style={styles.card}>
              <View style={styles.cardHead}>
                {editingId === l.id ? (
                  <TextInput
                    style={styles.titleEdit}
                    value={editName}
                    onChangeText={setEditName}
                    autoFocus
                    onSubmitEditing={() => commitRename(l.id)}
                    onBlur={() => commitRename(l.id)}
                    returnKeyType="done"
                  />
                ) : (
                  <TouchableOpacity
                    style={styles.titleWrap}
                    onPress={() => {
                      setEditingId(l.id);
                      setEditName(l.name);
                    }}
                    accessibilityLabel={`Rename ${l.name}`}
                  >
                    <Text style={styles.listTitle}>{l.name}</Text>
                  </TouchableOpacity>
                )}
                <Text style={styles.count}>
                  {done}/{items.length}
                </Text>
                <TouchableOpacity onPress={() => deleteList(l.id, l.name)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel={`Delete list ${l.name}`}>
                  <Text style={styles.trash}>🗑</Text>
                </TouchableOpacity>
              </View>

              {items.map((it) => (
                <View key={it.id} style={styles.item}>
                  <TouchableOpacity onPress={() => toggle(l.id, it.id, !it.done)} accessibilityLabel={`Toggle ${it.text}`}>
                    <View style={[styles.check, it.done && styles.checkOn]}>{it.done && <Text style={styles.checkMark}>✓</Text>}</View>
                  </TouchableOpacity>
                  <Text style={[styles.itemText, it.done && styles.itemDone]}>{it.text}</Text>
                  <TouchableOpacity onPress={() => delItem(l.id, it.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel={`Delete ${it.text}`}>
                    <Text style={styles.itemX}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}

              <View style={styles.addRow}>
                <TextInput
                  style={styles.addInput}
                  value={drafts[l.id] || ""}
                  onChangeText={(t) => setDrafts((d) => ({ ...d, [l.id]: t }))}
                  placeholder="Add item…"
                  placeholderTextColor="#5b6478"
                  onSubmitEditing={() => addItem(l.id)}
                  returnKeyType="done"
                />
                <TouchableOpacity onPress={() => addItem(l.id)} accessibilityLabel="Add item">
                  <Text style={styles.addPlus}>＋</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#080c18" },
  header: { padding: 20, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,.06)" },
  title: { color: "#e8eeff", fontSize: 20, fontWeight: "800" },
  body: { padding: 16, gap: 14 },
  newRow: { flexDirection: "row", gap: 10 },
  newInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,.06)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.08)",
    color: "#e8eeff",
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  newBtn: { backgroundColor: "#60a5fa", borderRadius: 12, paddingHorizontal: 18, justifyContent: "center" },
  newBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  empty: { color: "rgba(232,238,255,.5)", fontSize: 14, textAlign: "center", marginTop: 16, lineHeight: 20 },
  card: {
    backgroundColor: "rgba(255,255,255,.04)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.08)",
    padding: 14,
    gap: 8,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  titleWrap: { flex: 1 },
  listTitle: { color: "#e8eeff", fontSize: 17, fontWeight: "700" },
  titleEdit: {
    flex: 1,
    color: "#e8eeff",
    fontSize: 17,
    fontWeight: "700",
    borderBottomWidth: 1,
    borderBottomColor: "#60a5fa",
    paddingVertical: 2,
  },
  count: { color: "rgba(232,238,255,.5)", fontSize: 13 },
  trash: { fontSize: 18 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: "#34d399", borderColor: "#34d399" },
  checkMark: { color: "#08210f", fontSize: 14, fontWeight: "900" },
  itemText: { flex: 1, color: "#e8eeff", fontSize: 16 },
  itemDone: { color: "rgba(232,238,255,.45)", textDecorationLine: "line-through" },
  itemX: { color: "rgba(232,238,255,.4)", fontSize: 16 },
  addRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  addInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,.05)",
    borderRadius: 10,
    color: "#e8eeff",
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  addPlus: { color: "#60a5fa", fontSize: 26, fontWeight: "700", paddingHorizontal: 4 },
});
