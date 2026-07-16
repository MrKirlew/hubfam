import React, { useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, useWindowDimensions, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useAppStore } from "../store/appStore";
import WidgetPanel from "../components/WidgetPanel";
import WidgetSelector from "../components/WidgetSelector";
import LayoutPicker from "../components/LayoutPicker";
import QuickAddBar from "../components/QuickAddBar";
import WeatherBar from "../components/WeatherBar";
import EventTicker from "../components/EventTicker";
import AlertMessageOverlay from "../components/AlertMessageOverlay";
import { useTheme } from "../hooks/useTheme";
import type { Theme } from "../theme";
import { performSync } from "../services/SyncOrchestrator";
import strings from "../i18n/strings";
import { verifyHubPin, setHubPinSecure, isLockedOut, getLockoutRemainingMs, isDigitsOnly } from "../services/PinService";

export default function DashboardScreen() {
  const navigation = useNavigation<any>();
  const layout = useAppStore(s => s.dashboardLayout);
  const isLocked = useAppStore(s => s.isLocked);
  const lock = useAppStore(s => s.lock);
  const unlock = useAppStore(s => s.unlock);
  const hubName = useAppStore(s => s.hubName);
  const isSyncing = useAppStore(s => s.isSyncing);
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const t = useTheme();
  const s = useMemo(() => getStyles(t), [t]);

  const [showLayoutPicker, setShowLayoutPicker] = useState(false);
  const [widgetSelectorIndex, setWidgetSelectorIndex] = useState<number | null>(null);
  const [pinEntry, setPinEntry] = useState("");
  const [pinSetup, setPinSetup] = useState<string | null>(null); // for setting a new PIN

  // PIN is stored in appStore hubName field is used; we'll use a dedicated field
  // For simplicity, use the first member's pin or a hub-level pin
  const hubPin = useAppStore(s => s.hubPin);
  const setHubPin = useAppStore(s => s.setHubPin);
  const showClockBar = useAppStore(s => s.showClockBar);

  // Persistent clock — updates every 60s
  const [clockTime, setClockTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setClockTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const handleLock = () => {
    if (!hubPin) {
      // No PIN set — prompt to create one
      setPinSetup("");
      return;
    }
    lock();
  };

  const handlePinDigit = (digit: string) => {
    if (!isDigitsOnly(digit)) return;
    const next = pinEntry + digit;
    setPinEntry(next);
    if (next.length === 4) {
      if (isLockedOut()) {
        const secs = Math.ceil(getLockoutRemainingMs() / 1000);
        Alert.alert(strings.pin.tooManyAttempts, strings.pin.tryAgainIn(secs));
        setPinEntry("");
        return;
      }
      // Pass the legacy plaintext PIN as a fallback so a SecureStore migration
      // failure doesn't lock the user out of their own dashboard. If the
      // background re-migration succeeds, flip the store sentinel so the
      // plaintext value stops being persisted from this point forward.
      verifyHubPin(next, hubPin, () => setHubPin("SECURE")).then((match) => {
        if (match) {
          unlock("all");
        }
        setPinEntry("");
      });
    }
  };

  const handleSetupDigit = (digit: string) => {
    if (pinSetup === null) return;
    if (!isDigitsOnly(digit)) return;
    const next = pinSetup + digit;
    setPinSetup(next);
    if (next.length === 4) {
      setHubPinSecure(next).then(() => {
        setHubPin("SECURE");
        setPinSetup(null);
        lock();
      });
    }
  };

  const updateWidget = useAppStore(s => s.updateWidget);
  const setDashboardLayout = useAppStore(s => s.setDashboardLayout);

  const handleClosePanel = (index: number) => {
    // Remove the widget from the layout and switch to a smaller preset if needed
    const newWidgets = layout.widgets.filter((_, i) => i !== index);
    const presetMap: Record<number, string> = { 1: "1-panel", 2: "2-panel", 3: "3-panel", 4: "4-panel", 5: "4-panel", 6: "6-panel" };
    const newPreset = (presetMap[newWidgets.length] || "1-panel") as any;
    if (newWidgets.length === 0) {
      newWidgets.push({ id: `w_${Date.now()}`, type: "clock" });
    }
    setDashboardLayout({ preset: newPreset, widgets: newWidgets });
  };

  const wp = (i: number) => ({
    config: layout.widgets[i] || { id: `w${i}`, type: "clock" as const },
    onConfigure: () => !isLocked && setWidgetSelectorIndex(i),
    onClose: () => handleClosePanel(i),
  });

  const renderPanels = () => {
    const { preset, widgets } = layout;
    const dir = isLandscape ? "row" : "column";

    if (preset === "1-panel") {
      return (
        <View style={s.grid}>
          <WidgetPanel {...wp(0)} />
        </View>
      );
    }

    if (preset === "2-panel") {
      return (
        <View style={[s.grid, { flexDirection: dir }]}>
          <WidgetPanel {...wp(0)} />
          <WidgetPanel {...wp(1)} />
        </View>
      );
    }

    if (preset === "3-panel") {
      return isLandscape ? (
        <View style={[s.grid, { flexDirection: "row" }]}>
          <WidgetPanel {...wp(0)} />
          <View style={{ flex: 1 }}>
            <WidgetPanel {...wp(1)} />
            <WidgetPanel {...wp(2)} />
          </View>
        </View>
      ) : (
        <View style={[s.grid, { flexDirection: "column" }]}>
          <WidgetPanel {...wp(0)} />
          <WidgetPanel {...wp(1)} />
          <WidgetPanel {...wp(2)} />
        </View>
      );
    }

    // 4-panel — 2x2 grid
    if (preset === "4-panel") {
      return (
        <View style={s.grid}>
          <View style={{ flex: 1, flexDirection: "row" }}>
            <WidgetPanel {...wp(0)} />
            <WidgetPanel {...wp(1)} />
          </View>
          <View style={{ flex: 1, flexDirection: "row" }}>
            <WidgetPanel {...wp(2)} />
            <WidgetPanel {...wp(3)} />
          </View>
        </View>
      );
    }

    // 2-row — top large, bottom small
    if (preset === "2-row") {
      return (
        <View style={s.grid}>
          <View style={{ flex: 2 }}>
            <WidgetPanel {...wp(0)} />
          </View>
          <View style={{ flex: 1 }}>
            <WidgetPanel {...wp(1)} />
          </View>
        </View>
      );
    }

    // 6-panel — 3x2 grid
    if (preset === "6-panel") {
      return (
        <View style={s.grid}>
          <View style={{ flex: 1, flexDirection: "row" }}>
            <WidgetPanel {...wp(0)} />
            <WidgetPanel {...wp(1)} />
            <WidgetPanel {...wp(2)} />
          </View>
          <View style={{ flex: 1, flexDirection: "row" }}>
            <WidgetPanel {...wp(3)} />
            <WidgetPanel {...wp(4)} />
            <WidgetPanel {...wp(5)} />
          </View>
        </View>
      );
    }

    // sidebar — narrow left + large right
    return (
      <View style={[s.grid, { flexDirection: "row" }]}>
        <View style={{ flex: 1 }}>
          <WidgetPanel {...wp(0)} />
        </View>
        <View style={{ flex: 2 }}>
          <WidgetPanel {...wp(1)} />
        </View>
      </View>
    );
  };

  // Lock overlay background — adapts to theme
  const lockBgOpaque = t.isDark ? "rgba(8,12,24,.98)" : "rgba(10,32,48,.96)";
  const lockBgSemi = t.isDark ? "rgba(8,12,24,.75)" : "rgba(10,32,48,.75)";
  const pinInactive = t.isDark ? "rgba(255,255,255,.15)" : "rgba(10,32,48,.12)";

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      {/* Toolbar */}
      <View style={s.toolbar}>
        <WeatherBar />
        {showClockBar && (
          <View style={s.clockBar}>
            <Text style={s.clockTime}>
              {clockTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
            </Text>
            <Text style={s.clockDate}>
              {clockTime.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={s.toolBtn}
          onPress={() => { performSync(); }}
          accessibilityRole="button"
          accessibilityLabel={isSyncing ? "Syncing" : "Sync data"}
          accessibilityHint="Double tap to sync calendar and task data"
        >
          {isSyncing ? (
            <ActivityIndicator size={16} color={t.accent} />
          ) : (
            <Ionicons name="sync-outline" size={20} color={t.textSub} />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={s.toolBtn}
          onPress={() => setShowLayoutPicker(true)}
          accessibilityRole="button"
          accessibilityLabel="Change layout"
          accessibilityHint="Double tap to choose a dashboard layout"
        >
          <Ionicons name="grid-outline" size={20} color={t.accent} />
        </TouchableOpacity>
        <TouchableOpacity
          style={s.toolBtn}
          onPress={() => navigation.navigate("Settings")}
          accessibilityRole="button"
          accessibilityLabel="Open settings"
        >
          <Ionicons name="settings-outline" size={20} color={t.textSub} />
        </TouchableOpacity>
        <TouchableOpacity
          style={s.toolBtn}
          onPress={handleLock}
          accessibilityRole="button"
          accessibilityLabel={isLocked ? "Hub is locked" : "Lock hub"}
          accessibilityHint={isLocked ? undefined : "Double tap to lock the hub"}
        >
          <Ionicons
            name={isLocked ? "lock-closed" : "lock-open-outline"}
            size={20}
            color={isLocked ? t.error : t.textSub}
          />
        </TouchableOpacity>
      </View>

      {/* Event ticker — scrolling important events */}
      <EventTicker />

      {/* Widget grid */}
      {renderPanels()}

      {/* Quick-add input bar (hidden when locked). Floats absolutely above the
          widget grid so the keyboard can lift it without shrinking the panels. */}
      {!isLocked && <QuickAddBar />}

      {/* Full-screen override for "alert" messages sent from a phone */}
      <AlertMessageOverlay />

      {/* Lock overlay — shows PIN entry on top of dashboard */}
      <Modal visible={isLocked} transparent animationType="fade">
        <View style={[s.lockOverlay, {
          backgroundColor: useAppStore.getState().lockShowContent
            ? lockBgSemi  // semi-transparent — dashboard visible behind
            : lockBgOpaque  // fully opaque — hides dashboard content
        }]}>
          <View style={s.lockBox}>
            <Ionicons name="lock-closed" size={32} color={t.accent} />
            <Text style={s.lockTitle}>{hubName}</Text>
            <Text style={s.lockHint}>{strings.dashboard.enterPin}</Text>
            <View style={s.pinDots}>
              {[0,1,2,3].map(i => (
                <View key={i} style={[s.pinDot, {
                  backgroundColor: i < pinEntry.length ? t.accent : pinInactive
                }]} />
              ))}
            </View>
            <View style={s.pinGrid}>
              {["1","2","3","4","5","6","7","8","9","","0","<"].map((d, i) => (
                <TouchableOpacity
                  key={i}
                  style={[s.pinKey, !d && { backgroundColor: "transparent" }]}
                  onPress={() => {
                    if (d === "<") setPinEntry(p => p.slice(0, -1));
                    else if (d) handlePinDigit(d);
                  }}
                  activeOpacity={d ? 0.7 : 1}
                  accessibilityRole="button"
                  accessibilityLabel={d === "<" ? "Delete last digit" : d ? `PIN digit ${d}` : undefined}
                  accessible={!!d}
                >
                  <Text style={s.pinKeyText}>{d === "<" ? "\u232B" : d}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* PIN setup modal */}
      <Modal visible={pinSetup !== null} transparent animationType="fade">
        <View style={s.lockOverlay}>
          <View style={s.lockBox}>
            <Text style={s.lockTitle}>{strings.dashboard.setPin}</Text>
            <Text style={s.lockHint}>{strings.dashboard.choosePinHint}</Text>
            <View style={s.pinDots}>
              {[0,1,2,3].map(i => (
                <View key={i} style={[s.pinDot, {
                  backgroundColor: i < (pinSetup?.length || 0) ? t.success : pinInactive
                }]} />
              ))}
            </View>
            <View style={s.pinGrid}>
              {["1","2","3","4","5","6","7","8","9","","0","<"].map((d, i) => (
                <TouchableOpacity
                  key={i}
                  style={[s.pinKey, !d && { backgroundColor: "transparent" }]}
                  onPress={() => {
                    if (d === "<") setPinSetup(p => (p || "").slice(0, -1));
                    else if (d) handleSetupDigit(d);
                  }}
                  activeOpacity={d ? 0.7 : 1}
                  accessibilityRole="button"
                  accessibilityLabel={d === "<" ? "Delete last digit" : d ? `PIN digit ${d}` : undefined}
                  accessible={!!d}
                >
                  <Text style={s.pinKeyText}>{d === "<" ? "\u232B" : d}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              onPress={() => setPinSetup(null)}
              accessibilityRole="button"
              accessibilityLabel="Cancel PIN setup"
            >
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modals */}
      <LayoutPicker
        visible={showLayoutPicker}
        onClose={() => setShowLayoutPicker(false)}
      />
      <WidgetSelector
        visible={widgetSelectorIndex !== null}
        panelIndex={widgetSelectorIndex ?? 0}
        onClose={() => setWidgetSelectorIndex(null)}
      />
    </SafeAreaView>
  );
}

function getStyles(t: Theme) {
  return StyleSheet.create({
    container:    { flex: 1, backgroundColor: t.bg, padding: 8, paddingBottom: 108 },
    toolbar:      { flexDirection: "row", justifyContent: "flex-end", gap: 8,
                    paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4 },
    toolBtn:      { padding: 8, borderRadius: 12, backgroundColor: t.toolbar },
    clockBar:     { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10,
                    paddingVertical: 4, borderRadius: 12, backgroundColor: t.card },
    clockTime:    { fontSize: 14, fontWeight: "700", color: t.text },
    clockDate:    { fontSize: 11, color: t.textSub },
    grid:         { flex: 1 },
    lockOverlay:  { ...StyleSheet.absoluteFill, backgroundColor: t.modalBd,
                    justifyContent: "center", alignItems: "center", zIndex: 50 },
    lockBox:      { alignItems: "center", gap: 12 },
    lockTitle:    { fontSize: 22, fontWeight: "700", color: t.textOnAccent },
    lockHint:     { fontSize: 14, color: t.isDark ? "rgba(232,238,255,.4)" : "rgba(255,255,255,.7)" },
    pinDots:      { flexDirection: "row", gap: 16, marginVertical: 8 },
    pinDot:       { width: 14, height: 14, borderRadius: 7 },
    pinGrid:      { flexDirection: "row", flexWrap: "wrap", width: 220, gap: 8, justifyContent: "center" },
    pinKey:       { width: 64, height: 52, backgroundColor: t.isDark ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.15)",
                    borderRadius: 12, alignItems: "center", justifyContent: "center" },
    pinKeyText:   { fontSize: 22, fontWeight: "500", color: t.textOnAccent },
    cancelText:   { fontSize: 14, color: t.isDark ? "rgba(232,238,255,.4)" : "rgba(255,255,255,.7)", marginTop: 12 },
  });
}
