import React, { useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, useWindowDimensions, ScrollView } from "react-native";
import { useAppStore } from "../store/appStore";
import type { LayoutPreset, WidgetConfig } from "../store/appStore";
import { useTheme } from "../hooks/useTheme";
import type { Theme } from "../theme";

const LAYOUTS: { preset: LayoutPreset; label: string; panels: number }[] = [
  { preset: "1-panel",  label: "Single",  panels: 1 },
  { preset: "2-panel",  label: "Split",   panels: 2 },
  { preset: "3-panel",  label: "Triple",  panels: 3 },
  { preset: "4-panel",  label: "Quad",    panels: 4 },
  { preset: "2-row",    label: "Rows",    panels: 2 },
  { preset: "6-panel",  label: "6-Grid",  panels: 6 },
  { preset: "sidebar",  label: "Sidebar", panels: 2 },
];

function makeDefaultWidget(index: number): WidgetConfig {
  const defaults: WidgetConfig[] = [
    { id: `w0_${Date.now()}`, type: "calendar-today" },
    { id: `w1_${Date.now()}`, type: "todo-list" },
    { id: `w2_${Date.now()}`, type: "weekly-tasks" },
    { id: `w3_${Date.now()}`, type: "clock" },
    { id: `w4_${Date.now()}`, type: "month-calendar" },
    { id: `w5_${Date.now()}`, type: "cleaning" },
    { id: `w6_${Date.now()}`, type: "weekly-tasks" },
    { id: `w7_${Date.now()}`, type: "clock" },
  ];
  return defaults[index] || { id: `w${index}_${Date.now()}`, type: "clock" };
}

function LayoutPreview({ preset, isActive, t }: { preset: LayoutPreset; isActive: boolean; t: Theme }) {
  const border = isActive ? t.accent : t.cardBorder;
  const bg = isActive ? t.accentBg : t.toolbar;

  const previewStyle = [pvStyles.preview, { borderColor: border }];
  const cellStyle = [pvStyles.previewCell, { backgroundColor: bg }];

  if (preset === "1-panel") {
    return <View style={previewStyle}><View style={[cellStyle, { flex: 1 }]} /></View>;
  }
  if (preset === "2-panel") {
    return <View style={[previewStyle, { flexDirection: "row" as const }]}><View style={[cellStyle, { flex: 1 }]} /><View style={[cellStyle, { flex: 1 }]} /></View>;
  }
  if (preset === "3-panel") {
    return (
      <View style={[previewStyle, { flexDirection: "row" as const }]}>
        <View style={[cellStyle, { flex: 1 }]} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={[cellStyle, { flex: 1 }]} />
          <View style={[cellStyle, { flex: 1 }]} />
        </View>
      </View>
    );
  }
  if (preset === "4-panel") {
    return (
      <View style={[previewStyle, { flexDirection: "row" as const, flexWrap: "wrap" as const }]}>
        <View style={[cellStyle, { width: "49%", height: "48%" }]} />
        <View style={[cellStyle, { width: "49%", height: "48%" }]} />
        <View style={[cellStyle, { width: "49%", height: "48%" }]} />
        <View style={[cellStyle, { width: "49%", height: "48%" }]} />
      </View>
    );
  }
  if (preset === "2-row") {
    return <View style={previewStyle}><View style={[cellStyle, { flex: 2 }]} /><View style={[cellStyle, { flex: 1 }]} /></View>;
  }
  if (preset === "6-panel") {
    return (
      <View style={previewStyle}>
        <View style={{ flex: 1, flexDirection: "row", gap: 2 }}>
          <View style={[cellStyle, { flex: 1 }]} /><View style={[cellStyle, { flex: 1 }]} /><View style={[cellStyle, { flex: 1 }]} />
        </View>
        <View style={{ flex: 1, flexDirection: "row", gap: 2 }}>
          <View style={[cellStyle, { flex: 1 }]} /><View style={[cellStyle, { flex: 1 }]} /><View style={[cellStyle, { flex: 1 }]} />
        </View>
      </View>
    );
  }
  // sidebar
  return (
    <View style={[previewStyle, { flexDirection: "row" as const }]}>
      <View style={[cellStyle, { flex: 1 }]} />
      <View style={[cellStyle, { flex: 2 }]} />
    </View>
  );
}

const pvStyles = StyleSheet.create({
  preview:     { width: 64, height: 48, borderRadius: 6, borderWidth: 1, gap: 2, padding: 2, overflow: "hidden" },
  previewCell: { borderRadius: 3, margin: 1 },
});

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function LayoutPicker({ visible, onClose }: Props) {
  const { width: screenW } = useWindowDimensions();
  const layout = useAppStore(s => s.dashboardLayout);
  const setDashboardLayout = useAppStore(s => s.setDashboardLayout);
  const t = useTheme();
  const s = useMemo(() => getStyles(t), [t]);

  const handleSelect = (preset: LayoutPreset, panels: number) => {
    const existing = layout.widgets;
    const widgets: WidgetConfig[] = [];
    for (let i = 0; i < panels; i++) {
      widgets.push(existing[i] || makeDefaultWidget(i));
    }
    setDashboardLayout({ preset, widgets });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={[s.sheet, { width: Math.min(400, screenW * 0.9) }]}>
          <Text style={s.title}>Choose Layout</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.grid}>
            {LAYOUTS.map(l => (
              <TouchableOpacity
                key={l.preset}
                style={[s.option, layout.preset === l.preset && s.optionActive]}
                onPress={() => handleSelect(l.preset, l.panels)}
                activeOpacity={0.7}
              >
                <LayoutPreview preset={l.preset} isActive={layout.preset === l.preset} t={t} />
                <Text style={[s.optionLabel, layout.preset === l.preset && s.labelActive]}>
                  {l.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function getStyles(t: Theme) {
  return StyleSheet.create({
    backdrop:     { flex: 1, backgroundColor: t.modalBd, justifyContent: "center", alignItems: "center" },
    sheet:        { backgroundColor: t.modal, borderRadius: 20,
                    padding: 24, borderWidth: 1, borderColor: t.cardBorder },
    title:        { fontSize: 20, fontWeight: "700", color: t.text, textAlign: "center", marginBottom: 20 },
    grid:         { flexDirection: "row", gap: 12, justifyContent: "center" },
    option:       { alignItems: "center", gap: 8, padding: 12, borderRadius: 12,
                    backgroundColor: t.isDark ? "rgba(255,255,255,.03)" : "rgba(10,32,48,.03)" },
    optionActive: { backgroundColor: t.accentBg, borderWidth: 1, borderColor: t.accent + "4D" },
    optionLabel:  { fontSize: 13, fontWeight: "600", color: t.textSub },
    labelActive:  { color: t.accent },
    cancelBtn:    { marginTop: 20, alignItems: "center", paddingVertical: 10 },
    cancelText:   { fontSize: 14, color: t.textSub },
  });
}
