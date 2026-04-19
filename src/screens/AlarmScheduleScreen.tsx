import React, { useState, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Switch, Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useAppStore } from "../store/appStore";
import type { AlarmSchedule, AlarmType, AlarmRecurrence } from "../store/appStore";
import { useTheme } from "../hooks/useTheme";
import type { Theme } from "../theme";
// Alarm scheduling uses expo-notifications via NotificationService

const ALARM_TYPES: { key: AlarmType; label: string; icon: string }[] = [
  { key: "interval",      label: "Every X Hours",  icon: "repeat-outline" },
  { key: "specific-time", label: "At a Time",      icon: "time-outline" },
  { key: "random-window", label: "Random Window",  icon: "shuffle-outline" },
];

const RECURRENCES: { key: AlarmRecurrence; label: string }[] = [
  { key: "once",    label: "Once" },
  { key: "daily",   label: "Daily" },
  { key: "weekly",  label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly",  label: "Yearly" },
];

const HOURS_OPTIONS = [1, 2, 3, 4, 6, 8, 12];

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export default function AlarmScheduleScreen() {
  const theme = useTheme();
  const s = useMemo(() => getStyles(theme), [theme]);

  const navigation = useNavigation<any>();
  const alarms = useAppStore(st => st.alarms);
  const addAlarm = useAppStore(st => st.addAlarm);
  const updateAlarm = useAppStore(st => st.updateAlarm);
  const removeAlarm = useAppStore(st => st.removeAlarm);

  const [showCreate, setShowCreate] = useState(false);
  const [editingAlarmId, setEditingAlarmId] = useState<string | null>(null);
  const [alarmType, setAlarmType] = useState<AlarmType>("interval");
  const [recurrence, setRecurrence] = useState<AlarmRecurrence>("daily");
  const [label, setLabel] = useState("Check Family Hub");
  const [message, setMessage] = useState("Time to check the Family Hub!");
  const [soundName, setSoundName] = useState("chime");
  const [intervalHours, setIntervalHours] = useState(4);
  const [windowStart, setWindowStart] = useState("08:00");
  const [windowEnd, setWindowEnd] = useState("20:00");
  const [timeHour, setTimeHour] = useState("9");
  const [timeMin, setTimeMin] = useState("00");
  const [timePeriod, setTimePeriod] = useState<"AM" | "PM">("AM");

  const resetForm = () => {
    setAlarmType("interval");
    setRecurrence("daily");
    setLabel("Check Family Hub");
    setMessage("Time to check the Family Hub!");
    setSoundName("chime");
    setIntervalHours(4);
    setTimeHour("9");
    setTimeMin("00");
    setTimePeriod("AM");
    setWindowStart("08:00");
    setWindowEnd("20:00");
  };

  const getTimeFromPicker = (): string => {
    let h = parseInt(timeHour) || 0;
    if (timePeriod === "PM" && h < 12) h += 12;
    if (timePeriod === "AM" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${timeMin.padStart(2, "0")}`;
  };

  const openEdit = (alarm: AlarmSchedule) => {
    setEditingAlarmId(alarm.id);
    setAlarmType(alarm.type);
    setRecurrence(alarm.recurrence);
    setLabel(alarm.label);
    setMessage(alarm.message || "");
    setSoundName(alarm.soundName || "chime");
    setIntervalHours(alarm.intervalHours || 4);
    if (alarm.specificTime) {
      const [h, m] = alarm.specificTime.split(":").map(Number);
      const isPM = h >= 12;
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      setTimeHour(String(h12));
      setTimeMin(String(m).padStart(2, "0"));
      setTimePeriod(isPM ? "PM" : "AM");
    }
    setWindowStart(alarm.windowStart || "08:00");
    setWindowEnd(alarm.windowEnd || "20:00");
    setShowCreate(true);
  };

  const handleCreate = () => {
    if (editingAlarmId) {
      // Update existing alarm
      updateAlarm(editingAlarmId, {
        label: label.trim() || "Alarm",
        message: message.trim() || "Alarm!",
        soundName,
        type: alarmType,
        recurrence,
        intervalHours: alarmType === "interval" ? intervalHours : undefined,
        specificTime: alarmType === "specific-time" ? getTimeFromPicker() : undefined,
        windowStart: alarmType === "random-window" ? windowStart : undefined,
        windowEnd: alarmType === "random-window" ? windowEnd : undefined,
      });
      setShowCreate(false);
      setEditingAlarmId(null);
      resetForm();
      return;
    }
    const alarm: AlarmSchedule = {
      id: `alarm_${Date.now()}`,
      enabled: true,
      label: label.trim() || "Alarm",
      message: message.trim() || "Alarm!",
      soundName,
      type: alarmType,
      recurrence,
      intervalHours: alarmType === "interval" ? intervalHours : undefined,
      specificTime: alarmType === "specific-time" ? getTimeFromPicker() : undefined,
      windowStart: alarmType === "random-window" ? windowStart : undefined,
      windowEnd: alarmType === "random-window" ? windowEnd : undefined,
      lastTriggered: alarmType === "interval" ? Date.now() : undefined,
    };
    addAlarm(alarm);
    setShowCreate(false);
    resetForm();
  };

  const handleDelete = (id: string) => {
    Alert.alert("Delete Alarm", "Remove this alarm schedule?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => removeAlarm(id) },
    ]);
  };

  const describeAlarm = (a: AlarmSchedule): string => {
    let desc = "";
    if (a.type === "interval") {
      desc = `Every ${a.intervalHours} hour${(a.intervalHours || 0) > 1 ? "s" : ""}`;
    } else if (a.type === "specific-time" && a.specificTime) {
      desc = `At ${formatTime(a.specificTime)}`;
    } else if (a.type === "random-window" && a.windowStart && a.windowEnd) {
      desc = `Random between ${formatTime(a.windowStart)} - ${formatTime(a.windowEnd)}`;
    }
    if (a.recurrence !== "once") {
      desc += ` · ${a.recurrence}`;
    }
    return desc;
  };

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={s.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Alarm Schedules</Text>
        <TouchableOpacity
          onPress={() => setShowCreate(true)}
          style={s.addBtn}
          accessibilityRole="button"
          accessibilityLabel="Add new alarm"
        >
          <Ionicons name="add-circle" size={28} color={theme.accent} />
        </TouchableOpacity>
      </View>

      {/* Alarm list */}
      <ScrollView style={s.list} contentContainerStyle={{ paddingBottom: 40 }}>
        {alarms.length === 0 && (
          <View style={s.emptyBox}>
            <Ionicons name="alarm-outline" size={48} color={theme.textFaint} />
            <Text style={s.emptyText}>No alarms scheduled</Text>
            <Text style={s.emptyHint}>Tap + to create a reminder to check FamilyHub</Text>
          </View>
        )}
        {alarms.map(a => (
          <TouchableOpacity key={a.id} style={s.alarmCard} onPress={() => openEdit(a)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`Edit ${a.label} alarm`}>
            <View style={s.alarmInfo}>
              <Text style={s.alarmLabel}>{a.label}</Text>
              <Text style={s.alarmDesc}>{describeAlarm(a)}</Text>
              {a.message ? <Text style={s.alarmMsg} numberOfLines={1}>"{a.message}"</Text> : null}
              {a.soundName && a.soundName !== "none" ? (
                <Text style={s.alarmSound}>🔊 {a.soundName}</Text>
              ) : null}
            </View>
            <Switch
              value={a.enabled}
              onValueChange={v => updateAlarm(a.id, { enabled: v })}
              trackColor={{ false: theme.cardBorder, true: theme.accent + "66" }}
              thumbColor={a.enabled ? theme.accent : "#666"}
              accessibilityRole="switch"
              accessibilityLabel={`${a.label} alarm`}
              accessibilityState={{ checked: a.enabled }}
            />
            <TouchableOpacity
              onPress={() => handleDelete(a.id)}
              style={{ padding: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${a.label} alarm`}
            >
              <Ionicons name="trash-outline" size={18} color={theme.error} />
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Create alarm modal */}
      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={s.modalBg}>
          <View style={s.modalSheet}>
            <View style={s.modalHeaderRow}>
              <Text style={s.modalTitle}>{editingAlarmId ? "Edit Alarm" : "New Alarm"}</Text>
              <TouchableOpacity
                onPress={() => { setShowCreate(false); setEditingAlarmId(null); resetForm(); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color={theme.textFaint} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>

            {/* Label */}
            <Text style={s.fieldLabel}>Label</Text>
            <TextInput
              style={s.textInput}
              value={label}
              onChangeText={setLabel}
              placeholder="Alarm name..."
              placeholderTextColor={theme.textFaint}
              accessibilityRole="text"
              accessibilityLabel="Alarm label"
            />

            {/* Alarm type */}
            <Text style={s.fieldLabel}>Type</Text>
            <View style={s.chipRow}>
              {ALARM_TYPES.map(at => (
                <TouchableOpacity
                  key={at.key}
                  style={[s.chip, alarmType === at.key && s.chipActive]}
                  onPress={() => setAlarmType(at.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`Alarm type: ${at.label}`}
                  accessibilityState={{ selected: alarmType === at.key }}
                >
                  <Ionicons name={at.icon as any} size={14} color={alarmType === at.key ? theme.accent : theme.textSub} />
                  <Text style={[s.chipText, alarmType === at.key && s.chipTextActive]}>{at.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Type-specific options */}
            {alarmType === "interval" && (
              <>
                <Text style={s.fieldLabel}>Every</Text>
                <View style={s.chipRow}>
                  {HOURS_OPTIONS.map(h => (
                    <TouchableOpacity
                      key={h}
                      style={[s.chip, intervalHours === h && s.chipActive]}
                      onPress={() => setIntervalHours(h)}
                      accessibilityRole="button"
                      accessibilityLabel={`Every ${h} hours`}
                      accessibilityState={{ selected: intervalHours === h }}
                    >
                      <Text style={[s.chipText, intervalHours === h && s.chipTextActive]}>{h}h</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {alarmType === "specific-time" && (
              <>
                <Text style={s.fieldLabel}>Time</Text>
                <View style={s.timeRow}>
                  <TextInput
                    style={s.timeInput}
                    value={timeHour}
                    onChangeText={tx => setTimeHour(tx.replace(/[^0-9]/g, "").slice(0, 2))}
                    keyboardType="number-pad"
                    maxLength={2}
                    accessibilityRole="text"
                    accessibilityLabel="Hour"
                  />
                  <Text style={s.timeSep}>:</Text>
                  <TextInput
                    style={s.timeInput}
                    value={timeMin}
                    onChangeText={tx => setTimeMin(tx.replace(/[^0-9]/g, "").slice(0, 2))}
                    keyboardType="number-pad"
                    maxLength={2}
                    accessibilityRole="text"
                    accessibilityLabel="Minute"
                  />
                  <TouchableOpacity
                    style={[s.chip, timePeriod === "AM" && s.chipActive]}
                    onPress={() => setTimePeriod("AM")}
                    accessibilityRole="button"
                    accessibilityLabel="AM"
                    accessibilityState={{ selected: timePeriod === "AM" }}
                  >
                    <Text style={[s.chipText, timePeriod === "AM" && s.chipTextActive]}>AM</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.chip, timePeriod === "PM" && s.chipActive]}
                    onPress={() => setTimePeriod("PM")}
                    accessibilityRole="button"
                    accessibilityLabel="PM"
                    accessibilityState={{ selected: timePeriod === "PM" }}
                  >
                    <Text style={[s.chipText, timePeriod === "PM" && s.chipTextActive]}>PM</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {alarmType === "random-window" && (
              <>
                <Text style={s.fieldLabel}>Between</Text>
                <View style={s.timeRow}>
                  <TextInput
                    style={[s.timeInput, { width: 70 }]}
                    value={windowStart}
                    onChangeText={setWindowStart}
                    placeholder="08:00"
                    placeholderTextColor={theme.textFaint}
                    accessibilityRole="text"
                    accessibilityLabel="Window start time"
                  />
                  <Text style={s.timeSep}>and</Text>
                  <TextInput
                    style={[s.timeInput, { width: 70 }]}
                    value={windowEnd}
                    onChangeText={setWindowEnd}
                    placeholder="20:00"
                    placeholderTextColor={theme.textFaint}
                    accessibilityRole="text"
                    accessibilityLabel="Window end time"
                  />
                </View>
              </>
            )}

            {/* Recurrence */}
            <Text style={s.fieldLabel}>Repeat</Text>
            <View style={s.chipRow}>
              {RECURRENCES.map(r => (
                <TouchableOpacity
                  key={r.key}
                  style={[s.chip, recurrence === r.key && s.chipActive]}
                  onPress={() => setRecurrence(r.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`Repeat: ${r.label}`}
                  accessibilityState={{ selected: recurrence === r.key }}
                >
                  <Text style={[s.chipText, recurrence === r.key && s.chipTextActive]}>{r.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Popup message */}
            <Text style={s.fieldLabel}>Popup Message</Text>
            <TextInput
              style={s.textInput}
              value={message}
              onChangeText={setMessage}
              placeholder="Message to show when alarm fires..."
              placeholderTextColor={theme.textFaint}
              accessibilityRole="text"
              accessibilityLabel="Alarm popup message"
            />

            {/* Sound */}
            <Text style={s.fieldLabel}>Sound</Text>
            <View style={s.chipRow}>
              {[
                { key: "chime", label: "Chime" },
                { key: "bell", label: "Bell" },
                { key: "alert", label: "Alert" },
                { key: "none", label: "Silent" },
              ].map(snd => (
                <TouchableOpacity
                  key={snd.key}
                  style={[s.chip, soundName === snd.key && s.chipActive]}
                  onPress={() => setSoundName(snd.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`Sound: ${snd.label}`}
                  accessibilityState={{ selected: soundName === snd.key }}
                >
                  <Text style={[s.chipText, soundName === snd.key && s.chipTextActive]}>{snd.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            </ScrollView>

            {/* Action buttons — always visible footer */}
            <View style={s.modalActions}>
              <TouchableOpacity
                style={s.cancelBtn}
                onPress={() => { setShowCreate(false); setEditingAlarmId(null); resetForm(); }}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.createBtn}
                onPress={handleCreate}
                accessibilityRole="button"
                accessibilityLabel={editingAlarmId ? "Save alarm" : "Create alarm"}
              >
                <Ionicons name="alarm" size={18} color={theme.textOnAccent} />
                <Text style={s.createBtnText}>{editingAlarmId ? "Save" : "Create Alarm"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function getStyles(t: Theme) {
  return StyleSheet.create({
    container:      { flex: 1, backgroundColor: t.bg },
    header:         { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 12 },
    backBtn:        { padding: 8 },
    headerTitle:    { flex: 1, fontSize: 20, fontWeight: "700", color: t.text },
    addBtn:         { padding: 4 },
    list:           { flex: 1, paddingHorizontal: 16 },
    emptyBox:       { alignItems: "center", paddingTop: 80, gap: 12 },
    emptyText:      { fontSize: 16, fontWeight: "600", color: t.textSub },
    emptyHint:      { fontSize: 13, color: t.textFaint },
    alarmCard:      { flexDirection: "row", alignItems: "center", backgroundColor: t.card,
                      borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: t.cardBorder },
    alarmInfo:      { flex: 1, gap: 4 },
    alarmLabel:     { fontSize: 15, fontWeight: "600", color: t.text },
    alarmDesc:      { fontSize: 12, color: t.textSub },
    alarmMsg:       { fontSize: 11, color: t.accent + "99", fontStyle: "italic", marginTop: 2 },
    alarmSound:     { fontSize: 10, color: t.textFaint, marginTop: 1 },
    modalBg:        { flex: 1, backgroundColor: t.modalBd, justifyContent: "center", alignItems: "center" },
    modalSheet:     { width: "90%", maxWidth: 440, backgroundColor: t.modal, borderRadius: 20, padding: 24,
                      borderWidth: 1, borderColor: t.cardBorder, maxHeight: "85%" },
    modalHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    modalTitle:     { fontSize: 20, fontWeight: "700", color: t.text },
    fieldLabel:     { fontSize: 13, fontWeight: "600", color: t.textSub, marginTop: 14, marginBottom: 8 },
    textInput:      { backgroundColor: t.input, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
                      fontSize: 15, color: t.text, borderWidth: 1, borderColor: t.inputBorder },
    chipRow:        { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    chip:           { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: t.input,
                      flexDirection: "row", alignItems: "center", gap: 5 },
    chipActive:     { backgroundColor: t.accentBg, borderWidth: 1, borderColor: t.accent + "4D" },
    chipText:       { fontSize: 13, fontWeight: "500", color: t.textSub },
    chipTextActive: { color: t.accent },
    timeRow:        { flexDirection: "row", alignItems: "center", gap: 8 },
    timeInput:      { backgroundColor: t.input, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
                      fontSize: 18, fontWeight: "600", color: t.text, textAlign: "center", width: 50,
                      borderWidth: 1, borderColor: t.inputBorder },
    timeSep:        { fontSize: 18, fontWeight: "600", color: t.textFaint },
    modalActions:   { flexDirection: "row", gap: 12, marginTop: 24 },
    cancelBtn:      { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center",
                      backgroundColor: t.input },
    cancelBtnText:  { fontSize: 15, fontWeight: "600", color: t.textSub },
    createBtn:      { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center", flexDirection: "row",
                      justifyContent: "center", gap: 6, backgroundColor: t.accent },
    createBtnText:  { fontSize: 15, fontWeight: "600", color: t.textOnAccent },
  });
}
