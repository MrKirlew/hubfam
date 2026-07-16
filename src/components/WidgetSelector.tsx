import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, useWindowDimensions, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../store/appStore";
import type { WidgetType } from "../store/appStore";
import { useTheme } from "../hooks/useTheme";
import type { Theme } from "../theme";

const WIDGET_OPTIONS: { type: WidgetType; label: string; icon: string; desc: string }[] = [
  { type: "calendar-today",    label: "Today's Events",    icon: "today-outline",     desc: "Calendar events for today" },
  { type: "calendar-tomorrow", label: "Tomorrow's Events", icon: "calendar-outline",  desc: "Calendar events for tomorrow" },
  { type: "todo-list",         label: "To-Do List",        icon: "list-outline",      desc: "A specific to-do list" },
  { type: "calendar-list",     label: "Calendar + List",   icon: "albums-outline",    desc: "Today's events and a to-do list" },
  { type: "cleaning",           label: "Cleaning Tracker", icon: "sparkles-outline",  desc: "Track what was cleaned & when" },
  { type: "month-calendar",     label: "Month Calendar",  icon: "calendar-number-outline", desc: "Full month grid with event dots" },
  { type: "timer",              label: "Timer",           icon: "timer-outline",           desc: "Countdown timer with start/pause/reset" },
  { type: "daily-tasks",       label: "Daily Tasks",       icon: "checkbox-outline",  desc: "All tasks due today" },
  { type: "weekly-tasks",      label: "This Week",         icon: "grid-outline",      desc: "7-day task & event overview" },
  { type: "clock",             label: "Clock",             icon: "time-outline",      desc: "Clock, date, and greeting" },
  { type: "message-board",     label: "Message Board",     icon: "chatbubbles-outline", desc: "Notes & lists sent from phones" },
];

interface Props {
  visible: boolean;
  panelIndex: number;
  onClose: () => void;
}

export default function WidgetSelector({ visible, panelIndex, onClose }: Props) {
  const { width: screenW } = useWindowDimensions();
  const lists = useAppStore(s => s.lists);
  const updateWidget = useAppStore(s => s.updateWidget);
  const [step, setStep] = useState<"type" | "list">("type");
  const [pendingType, setPendingType] = useState<WidgetType>("todo-list");
  const layout = useAppStore(s => s.dashboardLayout);
  const t = useTheme();
  const s = useMemo(() => getStyles(t), [t]);

  const handleSelectType = (type: WidgetType) => {
    const existingTypes = layout.widgets.map(w => w.type);
    if (existingTypes.includes(type) && type !== "todo-list" && type !== "calendar-list") {
      Alert.alert("Duplicate Widget", `You already have a "${WIDGET_OPTIONS.find(o => o.type === type)?.label}" widget. Add another?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Add Anyway", onPress: () => proceedWithType(type) },
      ]);
      return;
    }
    proceedWithType(type);
  };

  const proceedWithType = (type: WidgetType) => {
    if ((type === "todo-list" || type === "calendar-list") && lists.length > 0) {
      setPendingType(type);
      setStep("list");
      return;
    }
    updateWidget(panelIndex, { id: `w${panelIndex}_${Date.now()}`, type });
    resetAndClose();
  };

  const handleSelectList = (listId?: string) => {
    updateWidget(panelIndex, {
      id: `w${panelIndex}_${Date.now()}`,
      type: pendingType,
      listId,
    });
    resetAndClose();
  };

  const resetAndClose = () => {
    setStep("type");
    setPendingType("todo-list");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={resetAndClose}>
      <View style={s.backdrop}>
        <View style={[s.sheet, { width: Math.min(360, screenW * 0.9) }]}>
          {step === "type" ? (
            <>
              <Text style={s.title}>Choose Widget</Text>
              <ScrollView>
                {WIDGET_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.type}
                    style={s.optionRow}
                    onPress={() => handleSelectType(opt.type)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`${opt.label}: ${opt.desc}`}
                  >
                    <Ionicons name={opt.icon as any} size={22} color={t.accent} />
                    <View style={s.optionInfo}>
                      <Text style={s.optionLabel}>{opt.label}</Text>
                      <Text style={s.optionDesc}>{opt.desc}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          ) : (
            <>
              <Text style={s.title}>Choose List</Text>
              <ScrollView>
                <TouchableOpacity
                  style={s.optionRow}
                  onPress={() => handleSelectList(undefined)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="All Lists Summary: Overview of all to-do lists"
                >
                  <Text style={s.optionEmoji}>📋</Text>
                  <View style={s.optionInfo}>
                    <Text style={s.optionLabel}>All Lists (Summary)</Text>
                    <Text style={s.optionDesc}>Overview of all to-do lists</Text>
                  </View>
                </TouchableOpacity>
                {lists.map(l => (
                  <TouchableOpacity
                    key={l.id}
                    style={s.optionRow}
                    onPress={() => handleSelectList(l.id)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`${l.name}: ${l.items.length} items`}
                  >
                    <Text style={s.optionEmoji}>{l.icon}</Text>
                    <View style={s.optionInfo}>
                      <Text style={s.optionLabel}>{l.name}</Text>
                      <Text style={s.optionDesc}>{l.items.length} items</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}
          <TouchableOpacity style={s.cancelBtn} onPress={resetAndClose} accessibilityRole="button" accessibilityLabel="Cancel widget selection">
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function getStyles(t: Theme) {
  return StyleSheet.create({
    backdrop:    { flex: 1, backgroundColor: t.modalBd, justifyContent: "center", alignItems: "center" },
    sheet:       { maxHeight: 480, backgroundColor: t.modal, borderRadius: 20,
                   padding: 24, borderWidth: 1, borderColor: t.cardBorder },
    title:       { fontSize: 20, fontWeight: "700", color: t.text, textAlign: "center", marginBottom: 16 },
    optionRow:   { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12,
                   borderBottomWidth: 1, borderBottomColor: t.divider },
    optionInfo:  { flex: 1 },
    optionLabel: { fontSize: 15, fontWeight: "600", color: t.text },
    optionDesc:  { fontSize: 12, color: t.textSub, marginTop: 2 },
    optionEmoji: { fontSize: 22, width: 28, textAlign: "center" },
    cancelBtn:   { marginTop: 16, alignItems: "center", paddingVertical: 10 },
    cancelText:  { fontSize: 14, color: t.textSub },
  });
}
