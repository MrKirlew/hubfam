import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, Alert, Share } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../../store/appStore";
import type { CleaningItem } from "../../store/appStore";
import { useTheme } from "../../hooks/useTheme";
import type { Theme } from "../../theme";

function formatCleanedTime(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const time = `${h12}:${String(m).padStart(2, "0")} ${period}`;
  const month = d.toLocaleString("en-US", { month: "short" });
  const day = d.getDate();
  return `${time} \u00B7 ${month} ${day}`;
}

function getStatus(lastCleaned: number | undefined, frequencyDays: number): "good" | "due" | "overdue" {
  if (!lastCleaned) return "overdue";
  const daysSince = (Date.now() - lastCleaned) / (1000 * 60 * 60 * 24);
  if (daysSince <= frequencyDays * 0.7) return "good";
  if (daysSince <= frequencyDays) return "due";
  return "overdue";
}

const STATUS_COLORS = { good: "#34d399", due: "#fbbf24", overdue: "#f87171" };

const EMOJI_PICKS = [
  "\u2728", "\uD83E\uDDF9", "\uD83E\uDDFD", "\uD83D\uDEBF", "\uD83D\uDE97",
  "\uD83C\uDF73", "\uD83D\uDD25", "\u2744\uFE0F", "\uD83D\uDECB", "\uD83D\uDECF",
  "\uD83D\uDEC1", "\uD83D\uDDD1", "\uD83E\uDDFA", "\uD83E\uDE9F", "\uD83C\uDFE0",
  "\uD83D\uDEBD", "\uD83E\uDEBD", "\uD83D\uDCBB", "\uD83D\uDCF1", "\uD83D\uDEB2",
];

const FREQ_OPTIONS = [
  { days: 1,  label: "Daily" },
  { days: 2,  label: "2 days" },
  { days: 3,  label: "3 days" },
  { days: 7,  label: "Weekly" },
  { days: 14, label: "2 weeks" },
  { days: 30, label: "Monthly" },
];

export default function CleaningWidget({ compact }: { compact?: boolean }) {
  const items = useAppStore(s => s.cleaningItems);
  const members = useAppStore(s => s.members);
  const markCleaned = useAppStore(s => s.markCleaned);
  const addCleaningItem = useAppStore(s => s.addCleaningItem);
  const removeCleaningItem = useAppStore(s => s.removeCleaningItem);
  const updateCleaningItem = useAppStore(s => s.updateCleaningItem);
  const t = useTheme();
  const s = useMemo(() => getStyles(t), [t]);

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("\u2728");
  const [newFreq, setNewFreq] = useState(7);

  const [cleaningItemId, setCleaningItemId] = useState<string | null>(null);
  const [cleaningMember, setCleaningMember] = useState<string | null>(null);
  const [cleaningNotes, setCleaningNotes] = useState("");
  const [showMemberPick, setShowMemberPick] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const [historyItem, setHistoryItem] = useState<CleaningItem | null>(null);
  const [pinPrompt, setPinPrompt] = useState(false);
  const [pinEntry, setPinEntry] = useState("");
  const [pendingHistoryItem, setPendingHistoryItem] = useState<CleaningItem | null>(null);
  const hubPin = useAppStore(s => s.hubPin);

  const pinInactive = t.isDark ? "rgba(255,255,255,.15)" : "rgba(10,32,48,.12)";

  const openHistory = (item: CleaningItem) => {
    if (hubPin) {
      setPendingHistoryItem(item);
      setPinEntry("");
      setPinPrompt(true);
    } else {
      setHistoryItem(item);
    }
  };

  const handlePinCheck = (digit: string) => {
    const next = pinEntry + digit;
    setPinEntry(next);
    if (next.length === 4) {
      if (next === hubPin) {
        setPinPrompt(false);
        setPinEntry("");
        setHistoryItem(pendingHistoryItem);
        setPendingHistoryItem(null);
      } else {
        setPinEntry("");
        Alert.alert("Wrong PIN", "Incorrect PIN. Try again.");
      }
    }
  };

  const exportLog = (item: CleaningItem) => {
    if (!item.log || item.log.length === 0) {
      Alert.alert("No Log", "No cleaning history to export.");
      return;
    }
    let text = `Cleaning Log: ${item.icon} ${item.name}\n`;
    text += `Frequency: every ${item.frequencyDays} day(s)\n\n`;
    for (const entry of item.log) {
      const d = new Date(entry.timestamp);
      const dateStr = d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
      text += `${dateStr} — ${entry.memberName}`;
      if (entry.notes) text += `\n  ${entry.notes}`;
      text += "\n";
    }
    Share.share({ message: text, title: `Cleaning Log: ${item.name}` }).catch(() => {});
  };

  const startCleaning = (id: string) => {
    const item = items.find(c => c.id === id);
    const status = item ? getStatus(item.lastCleaned, item.frequencyDays) : "overdue";

    if (status === "good" && item?.lastCleaned) {
      Alert.alert(
        `${item.icon} ${item.name}`,
        `Last cleaned ${formatCleanedTime(item.lastCleaned)}${item.cleanedBy ? ` by ${item.cleanedBy}` : ""}`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Reset to Unclean", style: "destructive", onPress: () => {
            updateCleaningItem(id, { lastCleaned: undefined, cleanedBy: undefined, lastNotes: undefined });
          }},
          { text: "Clean Again", onPress: () => proceedCleaning(id) },
        ]
      );
      return;
    }
    proceedCleaning(id);
  };

  const proceedCleaning = (id: string) => {
    setCleaningItemId(id);
    if (members.length === 0) {
      setCleaningMember("Someone");
      setShowNotes(true);
    } else if (members.length === 1) {
      setCleaningMember(members[0].name);
      setShowNotes(true);
    } else {
      setShowMemberPick(true);
    }
  };

  const handleMemberPicked = (name: string) => {
    setCleaningMember(name);
    setShowMemberPick(false);
    setShowNotes(true);
  };

  const handleSaveCleaning = () => {
    if (cleaningItemId && cleaningMember) {
      markCleaned(cleaningItemId, cleaningMember, cleaningNotes.trim());
    }
    setCleaningItemId(null);
    setCleaningMember(null);
    setCleaningNotes("");
    setShowNotes(false);
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert("Remove Item", `Remove "${name}" from cleaning tracker?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => removeCleaningItem(id) },
    ]);
  };

  const handleAddItem = () => {
    if (!newName.trim()) return;
    addCleaningItem({
      id: `c_${Date.now()}`,
      name: newName.trim(),
      icon: newIcon,
      frequencyDays: newFreq,
      log: [],
    });
    setNewName("");
    setNewIcon("\u2728");
    setNewFreq(7);
    setShowAdd(false);
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Cleaning</Text>
        <TouchableOpacity onPress={() => setShowAdd(true)}>
          <Ionicons name="add-circle-outline" size={20} color={t.accent} />
        </TouchableOpacity>
      </View>
      <ScrollView style={s.list} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {items.map(item => {
          const status = getStatus(item.lastCleaned, item.frequencyDays);
          return (
            <TouchableOpacity
              key={item.id}
              style={s.itemRow}
              onPress={() => startCleaning(item.id)}
              onLongPress={() => handleDelete(item.id, item.name)}
              activeOpacity={0.7}
            >
              <View style={[s.statusDot, { backgroundColor: STATUS_COLORS[status] }]} />
              <Text style={s.itemIcon}>{item.icon}</Text>
              <View style={s.itemInfo}>
                <Text style={s.itemName}>{item.name}</Text>
                {item.lastCleaned ? (
                  <>
                    <Text style={s.itemMeta}>
                      {formatCleanedTime(item.lastCleaned)} by {item.cleanedBy}
                    </Text>
                    {item.lastNotes ? (
                      <Text style={s.itemNotes} numberOfLines={1}>{item.lastNotes}</Text>
                    ) : null}
                  </>
                ) : (
                  <Text style={s.itemMeta}>Not cleaned yet</Text>
                )}
              </View>
              {item.log && item.log.length > 0 && item.lastCleaned && (
                <TouchableOpacity onPress={() => openHistory(item)} style={s.historyBtn}>
                  <Text style={s.historyCount}>{item.log.length}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[s.cleanBtn, { borderColor: STATUS_COLORS[status] }]}
                onPress={() => startCleaning(item.id)}
              >
                <Ionicons name="checkmark" size={14} color={STATUS_COLORS[status]} />
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })}
        {items.length === 0 && (
          <Text style={s.empty}>No items — tap + to add</Text>
        )}
      </ScrollView>

      {/* Step 1: Member picker */}
      <Modal visible={showMemberPick} transparent animationType="fade" onRequestClose={() => setShowMemberPick(false)}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => { setShowMemberPick(false); setCleaningItemId(null); }}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Who cleaned it?</Text>
            {members.map(m => (
              <TouchableOpacity key={m.id} style={s.memberRow} onPress={() => handleMemberPicked(m.name)}>
                <View style={[s.memberAvatar, { borderColor: m.color }]}>
                  <Text style={[s.memberInitials, { color: m.color }]}>{m.initials}</Text>
                </View>
                <Text style={s.memberName}>{m.name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.closeBtn} onPress={() => { setShowMemberPick(false); setCleaningItemId(null); }}>
              <Text style={s.closeText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Step 2: Notes/details input */}
      <Modal visible={showNotes} transparent animationType="fade" onRequestClose={handleSaveCleaning}>
        <View style={s.backdrop}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>What was done?</Text>
            <Text style={s.sheetHint}>
              {items.find(i => i.id === cleaningItemId)?.icon}{" "}
              {items.find(i => i.id === cleaningItemId)?.name} — {cleaningMember}
            </Text>
            <TextInput
              style={s.notesInput}
              placeholder="e.g. Wiped counters, mopped floor, scrubbed sink..."
              placeholderTextColor={t.textFaint}
              value={cleaningNotes}
              onChangeText={setCleaningNotes}
              multiline
              autoFocus
            />
            <View style={s.notesActions}>
              <TouchableOpacity style={s.skipBtn} onPress={handleSaveCleaning}>
                <Text style={s.skipText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.saveBtn} onPress={handleSaveCleaning}>
                <Ionicons name="checkmark-circle" size={18} color={t.textOnAccent} />
                <Text style={s.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* History viewer */}
      <Modal visible={historyItem !== null} transparent animationType="fade" onRequestClose={() => setHistoryItem(null)}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => setHistoryItem(null)}>
          <View style={s.historySheet}>
            <Text style={s.sheetTitle}>
              {historyItem?.icon} {historyItem?.name} — History
            </Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {historyItem?.log?.map((entry, i) => (
                <View key={i} style={s.logEntry}>
                  <Text style={s.logTime}>{formatCleanedTime(entry.timestamp)}</Text>
                  <Text style={s.logMember}>by {entry.memberName}</Text>
                  {entry.notes ? <Text style={s.logNotes}>{entry.notes}</Text> : null}
                </View>
              ))}
              {(!historyItem?.log || historyItem.log.length === 0) && (
                <Text style={s.empty}>No history yet</Text>
              )}
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
              <TouchableOpacity style={s.closeBtn} onPress={() => setHistoryItem(null)}>
                <Text style={s.closeText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.closeBtn, { backgroundColor: t.accentBg }]}
                onPress={() => historyItem && exportLog(historyItem)}
              >
                <Ionicons name="share-outline" size={14} color={t.accent} />
                <Text style={[s.closeText, { color: t.accent }]}> Export</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* PIN prompt for history */}
      <Modal visible={pinPrompt} transparent animationType="fade" onRequestClose={() => { setPinPrompt(false); setPendingHistoryItem(null); }}>
        <View style={s.backdrop}>
          <View style={s.sheet}>
            <Ionicons name="lock-closed" size={24} color={t.accent} />
            <Text style={s.sheetTitle}>Enter PIN to view log</Text>
            <View style={{ flexDirection: "row", gap: 12, marginVertical: 8 }}>
              {[0,1,2,3].map(i => (
                <View key={i} style={{ width: 12, height: 12, borderRadius: 6,
                  backgroundColor: i < pinEntry.length ? t.accent : pinInactive }} />
              ))}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", width: 180, gap: 6, justifyContent: "center" }}>
              {["1","2","3","4","5","6","7","8","9","","0","<"].map((d, i) => (
                <TouchableOpacity
                  key={i}
                  style={{ width: 50, height: 40,
                           backgroundColor: d ? (t.isDark ? "rgba(255,255,255,.08)" : "rgba(10,32,48,.06)") : "transparent",
                           borderRadius: 8, alignItems: "center", justifyContent: "center" }}
                  onPress={() => {
                    if (d === "<") setPinEntry(p => p.slice(0, -1));
                    else if (d) handlePinCheck(d);
                  }}
                >
                  <Text style={{ fontSize: 18, fontWeight: "500", color: t.text }}>
                    {d === "<" ? "\u232B" : d}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={s.closeBtn} onPress={() => { setPinPrompt(false); setPendingHistoryItem(null); }}>
              <Text style={s.closeText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add item modal */}
      <Modal visible={showAdd} transparent animationType="fade" onRequestClose={() => setShowAdd(false)}>
        <View style={s.backdrop}>
          <View style={s.addSheet}>
            <Text style={s.sheetTitle}>Add Cleaning Item</Text>
            <TextInput
              style={s.nameInput}
              placeholder="Item name (e.g. Dishwasher, Car)..."
              placeholderTextColor={t.textFaint}
              value={newName}
              onChangeText={setNewName}
              autoFocus
            />
            <Text style={s.fieldLabel}>Icon</Text>
            <View style={s.emojiRow}>
              {EMOJI_PICKS.map((e, i) => (
                <TouchableOpacity key={i} style={[s.emojiBtn, newIcon === e && s.emojiBtnActive]} onPress={() => setNewIcon(e)}>
                  <Text style={s.emojiText}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.fieldLabel}>How often?</Text>
            <View style={s.freqRow}>
              {FREQ_OPTIONS.map(f => (
                <TouchableOpacity key={f.days} style={[s.freqBtn, newFreq === f.days && s.freqBtnActive]} onPress={() => setNewFreq(f.days)}>
                  <Text style={[s.freqText, newFreq === f.days && s.freqTextActive]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.notesActions}>
              <TouchableOpacity style={s.skipBtn} onPress={() => setShowAdd(false)}>
                <Text style={s.skipText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.saveBtn} onPress={handleAddItem}>
                <Text style={s.saveText}>Add Item</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function getStyles(t: Theme) {
  return StyleSheet.create({
    container:      { flex: 1 },
    header:         { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
    title:          { fontSize: 18, fontWeight: "700", color: t.text },
    list:           { flex: 1 },
    empty:          { fontSize: 13, color: t.textFaint, textAlign: "center", marginTop: 20 },
    itemRow:        { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6,
                      borderBottomWidth: 1, borderBottomColor: t.divider },
    statusDot:      { width: 8, height: 8, borderRadius: 4 },
    itemIcon:       { fontSize: 16 },
    itemInfo:       { flex: 1 },
    itemName:       { fontSize: 13, fontWeight: "600", color: t.text },
    itemMeta:       { fontSize: 10, color: t.textSub, marginTop: 1 },
    itemNotes:      { fontSize: 10, color: t.accent, marginTop: 1, fontStyle: "italic" },
    cleanBtn:       { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5,
                      alignItems: "center", justifyContent: "center" },
    historyBtn:     { backgroundColor: t.toolbar, borderRadius: 8,
                      paddingHorizontal: 6, paddingVertical: 2 },
    historyCount:   { fontSize: 10, fontWeight: "600", color: t.textSub },
    backdrop:       { flex: 1, backgroundColor: t.modalBd, justifyContent: "center", alignItems: "center" },
    sheet:          { width: "80%", maxWidth: 340, backgroundColor: t.modal, borderRadius: 16,
                      padding: 20, borderWidth: 1, borderColor: t.cardBorder },
    sheetTitle:     { fontSize: 17, fontWeight: "700", color: t.text, textAlign: "center", marginBottom: 12 },
    sheetHint:      { fontSize: 13, color: t.textSub, textAlign: "center", marginBottom: 12 },
    memberRow:      { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12,
                      borderBottomWidth: 1, borderBottomColor: t.divider },
    memberAvatar:   { width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: "center", justifyContent: "center" },
    memberInitials: { fontSize: 12, fontWeight: "700" },
    memberName:     { fontSize: 15, fontWeight: "500", color: t.text },
    notesInput:     { backgroundColor: t.input, borderRadius: 10, paddingHorizontal: 14,
                      paddingVertical: 10, fontSize: 14, color: t.text, borderWidth: 1,
                      borderColor: t.inputBorder, minHeight: 60, textAlignVertical: "top" },
    notesActions:   { flexDirection: "row", gap: 12, marginTop: 16 },
    skipBtn:        { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center",
                      backgroundColor: t.toolbar },
    skipText:       { fontSize: 14, fontWeight: "600", color: t.textSub },
    saveBtn:        { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center",
                      flexDirection: "row", justifyContent: "center", gap: 6, backgroundColor: t.accent },
    saveText:       { fontSize: 14, fontWeight: "600", color: t.textOnAccent },
    historySheet:   { width: "85%", maxWidth: 420, backgroundColor: t.modal, borderRadius: 16,
                      padding: 20, borderWidth: 1, borderColor: t.cardBorder },
    logEntry:       { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.divider },
    logTime:        { fontSize: 12, fontWeight: "600", color: t.text },
    logMember:      { fontSize: 11, color: t.textSub, marginTop: 2 },
    logNotes:       { fontSize: 12, color: t.accent, marginTop: 3, fontStyle: "italic" },
    closeBtn:       { marginTop: 16, alignItems: "center", paddingVertical: 10 },
    closeText:      { fontSize: 14, color: t.textSub },
    addSheet:       { width: "85%", maxWidth: 420, backgroundColor: t.modal, borderRadius: 16,
                      padding: 20, borderWidth: 1, borderColor: t.cardBorder },
    nameInput:      { backgroundColor: t.input, borderRadius: 10, paddingHorizontal: 14,
                      paddingVertical: 10, fontSize: 15, color: t.text, borderWidth: 1,
                      borderColor: t.inputBorder, marginBottom: 10 },
    fieldLabel:     { fontSize: 12, fontWeight: "600", color: t.textSub, marginBottom: 6 },
    emojiRow:       { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
    emojiBtn:       { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center",
                      backgroundColor: t.toolbar },
    emojiBtnActive: { backgroundColor: t.accentBg, borderWidth: 1, borderColor: t.accent },
    emojiText:      { fontSize: 18 },
    freqRow:        { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 16 },
    freqBtn:        { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
                      backgroundColor: t.toolbar },
    freqBtnActive:  { backgroundColor: t.accentBg, borderWidth: 1, borderColor: t.accent + "4D" },
    freqText:       { fontSize: 12, fontWeight: "500", color: t.textSub },
    freqTextActive: { color: t.accent },
  });
}
