/**
 * AppManagerScreen.tsx
 *
 * Lists all installed apps on the device with multi-select support.
 * Users can search, filter system apps, sort by name/size/date,
 * and batch-uninstall selected apps via sequential system dialogs.
 *
 * Uses the local expo-app-manager native module for PackageManager access.
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Alert, Image, ActivityIndicator, AppState,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { getInstalledApps, uninstallApp, openAppSettings, type InstalledApp } from "../../modules/app-manager";
import { useAppIcon } from "../hooks/useAppIcon";
import { useTheme } from "../hooks/useTheme";
import type { Theme } from "../theme";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

type SortKey = "name" | "size" | "date";

// ── App Row Component ────────────────────────────────────────────────────────

function AppRow({
  app,
  isSelected,
  onToggle,
  theme,
  s,
}: {
  app: InstalledApp;
  isSelected: boolean;
  onToggle: (pkg: string) => void;
  theme: Theme;
  s: ReturnType<typeof getStyles>;
}) {
  const icon = useAppIcon(app.packageName);
  const isSafe = !app.isSystem;

  const handlePress = () => {
    if (app.isSystem) {
      Alert.alert(
        "System App — Protected",
        `"${app.appName}" is a system app required for your device to work properly. It cannot be selected for uninstall.\n\nYou can still tap "Manage" to view its settings.`
      );
      return;
    }
    onToggle(app.packageName);
  };

  return (
    <TouchableOpacity
      style={[s.appRow, isSelected && s.appRowSelected, app.isSystem && s.appRowSystem]}
      onPress={handlePress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${app.appName}${app.isSystem ? ", system app" : ""}${isSelected ? ", selected" : ""}`}
      accessibilityHint={app.isSystem ? "System app, cannot be uninstalled" : "Double tap to select for uninstall"}
      accessibilityState={{ selected: isSelected }}
    >
      {/* Checkbox — disabled for system apps */}
      {isSafe ? (
        <View style={[s.checkbox, isSelected && s.checkboxChecked]}>
          {isSelected && <Text style={s.checkmark}>✓</Text>}
        </View>
      ) : (
        <View style={[s.checkbox, s.checkboxDisabled]}>
          <Text style={s.lockIcon}>🔒</Text>
        </View>
      )}

      {/* Icon */}
      <View style={s.iconWrap}>
        {icon ? (
          <Image
            source={{ uri: `data:image/png;base64,${icon}` }}
            style={s.appIcon}
          />
        ) : (
          <View style={s.iconPlaceholder}>
            <Text style={s.iconPlaceholderText}>
              {app.appName[0]?.toUpperCase() ?? "?"}
            </Text>
          </View>
        )}
      </View>

      {/* App info + safety badge */}
      <View style={s.appInfo}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={[s.appName, app.isSystem && { color: theme.textSub }]} numberOfLines={1}>
            {app.appName}
          </Text>
          {app.isSystem ? (
            <View style={s.systemBadge}>
              <Text style={s.systemBadgeText}>SYSTEM</Text>
            </View>
          ) : (
            <View style={s.safeBadge}>
              <Text style={s.safeBadgeText}>SAFE</Text>
            </View>
          )}
        </View>
        <Text style={s.packageName} numberOfLines={1}>{app.packageName}</Text>
      </View>

      {/* Size */}
      <Text style={s.appSize}>{formatBytes(app.apkSizeBytes)}</Text>

      {/* Manage button — opens system App Info (clear cache/storage) */}
      <TouchableOpacity
        style={s.manageBtn}
        onPress={(e) => {
          e.stopPropagation?.();
          openAppSettings(app.packageName).catch(() => {});
        }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={`Manage ${app.appName}`}
        accessibilityHint="Opens system settings for this app"
      >
        <Text style={s.manageBtnText}>Manage</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function AppManagerScreen() {
  const theme = useTheme();
  const s = useMemo(() => getStyles(theme), [theme]);

  const navigation = useNavigation<any>();

  const [apps, setApps]               = useState<InstalledApp[]>([]);
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [search, setSearch]           = useState("");
  const [showSystem, setShowSystem]   = useState(false);
  const [sortBy, setSortBy]           = useState<SortKey>("name");
  const [loading, setLoading]         = useState(true);
  const [uninstalling, setUninstalling] = useState<{
    active: boolean; current: number; total: number; name: string;
  }>({ active: false, current: 0, total: 0, name: "" });

  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // ── Load apps ──────────────────────────────────────────────────────────

  const loadApps = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getInstalledApps(showSystem);
      setApps(result);
    } catch {
      Alert.alert("Error", "Failed to load installed apps.");
    } finally {
      setLoading(false);
    }
  }, [showSystem]);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  // Refresh list when app returns to foreground (after uninstall dialogs)
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && !uninstalling.active) {
        loadApps();
      }
    });
    return () => sub.remove();
  }, [loadApps, uninstalling.active]);

  // ── Debounced search ───────────────────────────────────────────────────

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  // ── Filtered + sorted list ─────────────────────────────────────────────

  const filteredApps = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    let list = apps;

    if (q) {
      list = list.filter(
        (a) =>
          a.appName.toLowerCase().includes(q) ||
          a.packageName.toLowerCase().includes(q)
      );
    }

    return [...list].sort((a, b) => {
      if (sortBy === "name") return a.appName.localeCompare(b.appName);
      if (sortBy === "size") return b.apkSizeBytes - a.apkSizeBytes;
      // date — newest first
      return b.installTimeMs - a.installTimeMs;
    });
  }, [apps, debouncedSearch, sortBy]);

  // ── Selection helpers ──────────────────────────────────────────────────

  const toggleSelect = useCallback((pkg: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pkg)) next.delete(pkg);
      else next.add(pkg);
      return next;
    });
  }, []);

  const selectAll = () => {
    // Only select non-system apps — system apps are protected
    setSelected(new Set(filteredApps.filter(a => !a.isSystem).map((a) => a.packageName)));
  };

  const deselectAll = () => setSelected(new Set());

  // ── Action flow ────────────────────────────────────────────────────────

  const selectedTotal = useMemo(() => {
    return apps
      .filter((a) => selected.has(a.packageName))
      .reduce((sum, a) => sum + a.apkSizeBytes, 0);
  }, [apps, selected]);

  type AppAction = "uninstall" | "manage" | "manage_all";

  const showActionMenu = () => {
    const count = selected.size;
    if (count === 0) return;

    Alert.alert(
      `${count} App${count > 1 ? "s" : ""} Selected`,
      "What would you like to do?\n\nTap \"Manage\" to open each app's system settings where you can:\n• Force Stop\n• Clear Cache\n• Clear Storage\n• Disable Notifications",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Manage Selected",
          onPress: () => runAction("manage"),
        },
        {
          text: "Uninstall Selected",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Confirm Uninstall",
              `Uninstall ${count} app${count > 1 ? "s" : ""}? Each will show a system confirmation.`,
              [
                { text: "Cancel", style: "cancel" },
                { text: "Uninstall", style: "destructive", onPress: () => runAction("uninstall") },
              ]
            );
          },
        },
      ]
    );
  };

  const runAction = async (action: AppAction) => {
    const pkgs = Array.from(selected);
    setUninstalling({ active: true, current: 0, total: pkgs.length, name: "" });

    for (let i = 0; i < pkgs.length; i++) {
      const app = apps.find((a) => a.packageName === pkgs[i]);
      setUninstalling({
        active: true,
        current: i + 1,
        total: pkgs.length,
        name: app?.appName ?? pkgs[i],
      });

      try {
        if (action === "uninstall") {
          await uninstallApp(pkgs[i]);
        } else {
          await openAppSettings(pkgs[i]);
        }
        // Pause to let system dialog/page appear
        await new Promise((r) => setTimeout(r, 1200));
      } catch (_err) { /* Silence errors — user sees system uninstall/settings dialog directly */ }
    }

    setUninstalling({ active: false, current: 0, total: 0, name: "" });
    if (action === "uninstall") {
      setSelected(new Set());
      await loadApps();
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────────

  const renderItem = useCallback(
    ({ item }: { item: InstalledApp }) => (
      <AppRow
        app={item}
        isSelected={selected.has(item.packageName)}
        onToggle={toggleSelect}
        theme={theme}
        s={s}
      />
    ),
    [selected, toggleSelect, theme, s]
  );

  const sortLabel = sortBy === "name" ? "Name" : sortBy === "size" ? "Size" : "Date";

  const cycleSortBy = () => {
    setSortBy((prev) => {
      if (prev === "name") return "size";
      if (prev === "size") return "date";
      return "name";
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={s.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>App Manager</Text>
        <TouchableOpacity
          onPress={cycleSortBy}
          style={s.sortBtn}
          accessibilityRole="button"
          accessibilityLabel={`Sort by ${sortLabel}`}
          accessibilityHint="Double tap to change sort order"
        >
          <Text style={s.sortText}>Sort: {sortLabel}</Text>
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={s.searchRow}>
        <TextInput
          style={s.searchInput}
          placeholder="Search apps..."
          placeholderTextColor={theme.textFaint}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityRole="search"
          accessibilityLabel="Search apps"
        />
      </View>

      {/* Controls */}
      <View style={s.controlsRow}>
        <TouchableOpacity
          style={[s.toggleBtn, showSystem && s.toggleBtnActive]}
          onPress={() => setShowSystem((v) => !v)}
          accessibilityRole="switch"
          accessibilityLabel="Show system apps"
          accessibilityState={{ checked: showSystem }}
        >
          <Text style={[s.toggleText, showSystem && s.toggleTextActive]}>
            {showSystem ? "✓ System apps" : "System apps"}
          </Text>
        </TouchableOpacity>

        <View style={s.controlsRight}>
          <TouchableOpacity
            onPress={selectAll}
            style={s.controlBtn}
            accessibilityRole="button"
            accessibilityLabel="Select all apps"
          >
            <Text style={s.controlBtnText}>Select All</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={deselectAll}
            style={s.controlBtn}
            accessibilityRole="button"
            accessibilityLabel="Deselect all apps"
          >
            <Text style={s.controlBtnText}>Deselect All</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* App count */}
      <Text style={s.countLabel}>
        {filteredApps.length} app{filteredApps.length !== 1 ? "s" : ""}
        {debouncedSearch ? ` matching "${debouncedSearch}"` : ""}
      </Text>

      {/* App list */}
      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={s.loadingText}>Loading installed apps...</Text>
        </View>
      ) : (
        <FlashList
          data={filteredApps}
          renderItem={renderItem}
          keyExtractor={(item) => item.packageName}
          extraData={selected}
          contentContainerStyle={s.listContent}
        />
      )}

      {/* Uninstall progress overlay */}
      {uninstalling.active && (
        <View style={s.progressOverlay}>
          <View style={s.progressCard}>
            <ActivityIndicator size="small" color={theme.accent} />
            <Text style={s.progressText}>
              Requesting {uninstalling.current} of {uninstalling.total}
            </Text>
            <Text style={s.progressName}>{uninstalling.name}</Text>
          </View>
        </View>
      )}

      {/* Footer — action buttons */}
      {selected.size > 0 && !uninstalling.active && (
        <View style={s.footer}>
          <View style={s.footerInfo}>
            <Text style={s.footerCount}>
              {selected.size} selected
            </Text>
            <Text style={s.footerSize}>
              {formatBytes(selectedTotal)}
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              style={s.manageSelectedBtn}
              onPress={() => runAction("manage")}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Manage ${selected.size} selected apps`}
            >
              <Text style={s.manageSelectedBtnText}>
                Manage ({selected.size})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.uninstallBtn}
              onPress={showActionMenu}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Actions for ${selected.size} selected apps`}
            >
              <Text style={s.uninstallBtnText}>
                Actions
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

function getStyles(t: Theme) {
  return StyleSheet.create({
    container:     { flex: 1, backgroundColor: t.bg },

    // Header
    header:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                     paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
    backBtn:       { padding: 8 },
    backText:      { fontSize: 16, color: t.textSub },
    title:         { fontSize: 22, fontWeight: "700", color: t.text },
    sortBtn:       { backgroundColor: t.cardBorder, borderRadius: 10,
                     paddingHorizontal: 14, paddingVertical: 8 },
    sortText:      { fontSize: 13, color: t.textSub, fontWeight: "500" },

    // Search
    searchRow:     { paddingHorizontal: 20, marginBottom: 8 },
    searchInput:   { backgroundColor: t.input, borderWidth: 1,
                     borderColor: t.cardBorder, borderRadius: 12,
                     paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: t.text },

    // Controls
    controlsRow:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                     paddingHorizontal: 20, marginBottom: 4 },
    toggleBtn:     { backgroundColor: t.input, borderWidth: 1,
                     borderColor: t.cardBorder, borderRadius: 10,
                     paddingHorizontal: 14, paddingVertical: 8 },
    toggleBtnActive: { backgroundColor: t.accentBg, borderColor: t.accent + "4D" },
    toggleText:    { fontSize: 13, color: t.textSub, fontWeight: "500" },
    toggleTextActive: { color: t.accent },
    controlsRight: { flexDirection: "row", gap: 8 },
    controlBtn:    { paddingHorizontal: 12, paddingVertical: 8 },
    controlBtnText:{ fontSize: 13, color: t.accent, fontWeight: "500" },

    // Count label
    countLabel:    { paddingHorizontal: 20, paddingVertical: 6, fontSize: 12,
                     color: t.textFaint },

    // App list
    listContent:   { paddingHorizontal: 12, paddingBottom: 100 },

    // App row
    appRow:        { flexDirection: "row", alignItems: "center", gap: 12,
                     paddingVertical: 10, paddingHorizontal: 8,
                     borderRadius: 12, marginBottom: 2 },
    appRowSelected:{ backgroundColor: t.accentBg + "80" },
    appRowSystem:  { opacity: 0.7 },

    checkbox:      { width: 24, height: 24, borderRadius: 6, borderWidth: 2,
                     borderColor: t.textFaint, alignItems: "center", justifyContent: "center" },
    checkboxChecked: { backgroundColor: t.accent, borderColor: t.accent },
    checkboxDisabled:{ borderColor: t.cardBorder, backgroundColor: t.isDark ? "rgba(255,255,255,.05)" : "rgba(10,32,48,.05)" },
    checkmark:     { fontSize: 14, color: t.textOnAccent, fontWeight: "700" },
    lockIcon:      { fontSize: 10 },

    systemBadge:   { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4,
                     backgroundColor: t.error + "26" },
    systemBadgeText:{ fontSize: 9, fontWeight: "700", color: t.error },
    safeBadge:     { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4,
                     backgroundColor: t.success + "26" },
    safeBadgeText: { fontSize: 9, fontWeight: "700", color: t.success },

    iconWrap:      { width: 44, height: 44 },
    appIcon:       { width: 44, height: 44, borderRadius: 10 },
    iconPlaceholder: { width: 44, height: 44, borderRadius: 10, backgroundColor: t.cardBorder,
                       alignItems: "center", justifyContent: "center" },
    iconPlaceholderText: { fontSize: 18, fontWeight: "600", color: t.textFaint },

    appInfo:       { flex: 1, gap: 2 },
    appName:       { fontSize: 15, fontWeight: "600", color: t.text },
    packageName:   { fontSize: 12, color: t.textFaint },
    appSize:       { fontSize: 13, color: t.textSub, fontWeight: "500", minWidth: 50,
                     textAlign: "right" },
    manageBtn:     { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
                     backgroundColor: t.accentBg, borderWidth: 1,
                     borderColor: t.accent + "4D", marginLeft: 8 },
    manageBtnText: { fontSize: 11, fontWeight: "600", color: t.accent },

    // Loading
    loadingWrap:   { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
    loadingText:   { fontSize: 14, color: t.textSub },

    // Progress overlay
    progressOverlay: { ...StyleSheet.absoluteFill, backgroundColor: t.isDark ? "rgba(8,12,24,.85)" : "rgba(228,238,243,.85)",
                       alignItems: "center", justifyContent: "center", zIndex: 10 },
    progressCard:  { backgroundColor: t.modal, borderWidth: 1, borderColor: t.cardBorder,
                     borderRadius: 16, padding: 28, alignItems: "center", gap: 10, minWidth: 260 },
    progressText:  { fontSize: 15, color: t.textSub },
    progressName:  { fontSize: 17, fontWeight: "600", color: t.text },

    // Footer
    footer:        { position: "absolute", bottom: 0, left: 0, right: 0,
                     backgroundColor: t.modal, borderTopWidth: 1,
                     borderTopColor: t.cardBorder,
                     flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                     paddingHorizontal: 24, paddingVertical: 14 },
    footerInfo:    { gap: 2 },
    footerCount:   { fontSize: 15, fontWeight: "600", color: t.text },
    footerSize:    { fontSize: 13, color: t.textSub },
    manageSelectedBtn: { backgroundColor: t.accent, borderRadius: 12,
                        paddingHorizontal: 20, paddingVertical: 14 },
    manageSelectedBtnText: { fontSize: 15, fontWeight: "700", color: t.textOnAccent },
    uninstallBtn:  { backgroundColor: "#ef4444", borderRadius: 12,
                     paddingHorizontal: 20, paddingVertical: 14 },
    uninstallBtnText: { fontSize: 15, fontWeight: "700", color: t.textOnAccent },
  });
}
