/**
 * GoogleTasksSettings.tsx
 *
 * Settings card for managing Google Tasks sync per connected Google account.
 * Shows synced task lists, toggle sync, and re-auth prompt.
 */

import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../store/appStore";
import { performSync } from "../services/SyncOrchestrator";
import { useTheme } from "../hooks/useTheme";
import type { Theme } from "../theme";

export default function GoogleTasksSettings() {
  const feeds    = useAppStore(s => s.feeds);
  const lists    = useAppStore(s => s.lists);
  const updateList = useAppStore(s => s.updateList);
  const t = useTheme();
  const s = useMemo(() => getStyles(t), [t]);

  // Get unique Google accounts from connected calendar feeds
  const googleAccounts = [...new Set(
    feeds.filter(f => f.type === "gcal" && f.account).map(f => f.account!)
  )];

  // Get synced task lists
  const syncedLists = lists.filter(l => l.googleTaskListId);

  const [syncing, setSyncing] = useState(false);

  if (googleAccounts.length === 0) return null;

  const handleToggleSync = (listId: string, currentEnabled: boolean) => {
    updateList(listId, { syncEnabled: !currentEnabled });
  };

  const handleSyncNow = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await performSync();
      const syncedCount = useAppStore.getState().lists.filter(l => l.googleTaskListId).length;
      Alert.alert("Sync Complete", `${syncedCount} task list${syncedCount !== 1 ? "s" : ""} synced.`);
    } catch (err: any) {
      Alert.alert("Sync Failed", err?.message || "Could not sync Google Tasks. Check your connection.");
    } finally {
      setSyncing(false);
    }
  };

  const formatLastSynced = (ts?: number) => {
    if (!ts) return "Never";
    const mins = Math.round((Date.now() - ts) / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    return `${hrs}h ago`;
  };

  return (
    <View>
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>Google Tasks</Text>
        <TouchableOpacity style={[s.syncBtn, syncing && { opacity: 0.5 }]} onPress={handleSyncNow} disabled={syncing} accessibilityRole="button" accessibilityLabel={syncing ? "Syncing Google Tasks" : "Sync Google Tasks now"}>
          {syncing ? (
            <ActivityIndicator size={14} color={t.accent} />
          ) : (
            <Ionicons name="sync-outline" size={14} color={t.accent} />
          )}
          <Text style={s.syncBtnText}>{syncing ? "Syncing..." : "Sync Now"}</Text>
        </TouchableOpacity>
      </View>

      <View style={s.card}>
        {/* Connected accounts */}
        {googleAccounts.map(email => {
          const accountLists = syncedLists.filter(l => l.googleAccount === email);
          return (
            <View key={email} style={s.accountSection}>
              <View style={s.accountHeader}>
                <Ionicons name="logo-google" size={16} color={t.accent} />
                <Text style={s.accountEmail}>{email}</Text>
                <Text style={s.accountListCount}>
                  {accountLists.length} list{accountLists.length !== 1 ? "s" : ""}
                </Text>
              </View>

              {accountLists.map(list => (
                <View key={list.id} style={s.taskListRow}>
                  <TouchableOpacity
                    onPress={() => handleToggleSync(list.id, !!list.syncEnabled)}
                    style={s.toggleBtn}
                    accessibilityRole="checkbox"
                    accessibilityLabel={`Sync ${list.name}`}
                    accessibilityState={{ checked: !!list.syncEnabled }}
                  >
                    <Ionicons
                      name={list.syncEnabled ? "checkbox" : "square-outline"}
                      size={20}
                      color={list.syncEnabled ? t.success : t.textFaint}
                    />
                  </TouchableOpacity>
                  <View style={s.taskListInfo}>
                    <Text style={s.taskListName}>{list.name}</Text>
                    <Text style={s.taskListMeta}>
                      {list.items.length} items · Last sync: {formatLastSynced(list.lastSynced)}
                    </Text>
                  </View>
                  {list.syncEnabled && (
                    <Ionicons name="cloud-done-outline" size={16} color={t.success} />
                  )}
                </View>
              ))}

              {accountLists.length === 0 && (
                <Text style={s.noListsText}>
                  No task lists found. Tap "Sync Now" to import.
                </Text>
              )}
            </View>
          );
        })}

        {syncedLists.length === 0 && (
          <View style={s.emptyRow}>
            <Ionicons name="cloud-download-outline" size={24} color={t.textFaint} />
            <Text style={s.emptyText}>
              Tap "Sync Now" to import your Google Task lists
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function getStyles(t: Theme) {
  return StyleSheet.create({
    sectionHeader: {
      flexDirection: "row", justifyContent: "space-between",
      alignItems: "center", marginBottom: 10, marginTop: 20,
    },
    sectionTitle: {
      fontSize: 13, fontWeight: "600", color: t.textSub,
      letterSpacing: 1, textTransform: "uppercase",
    },
    syncBtn: {
      flexDirection: "row", alignItems: "center", gap: 4,
      backgroundColor: t.accentBg, borderRadius: 8,
      paddingHorizontal: 12, paddingVertical: 6,
    },
    syncBtnText: { fontSize: 13, fontWeight: "600", color: t.accent },

    card: {
      backgroundColor: t.card, borderWidth: 1,
      borderColor: t.cardBorder, borderRadius: 16, overflow: "hidden",
    },

    accountSection: { padding: 4 },
    accountHeader: {
      flexDirection: "row", alignItems: "center", gap: 8,
      padding: 14, paddingBottom: 6,
    },
    accountEmail: { flex: 1, fontSize: 14, fontWeight: "600", color: t.text },
    accountListCount: { fontSize: 12, color: t.textFaint },

    taskListRow: {
      flexDirection: "row", alignItems: "center", gap: 10,
      paddingHorizontal: 14, paddingVertical: 10,
    },
    toggleBtn: { padding: 2 },
    taskListInfo: { flex: 1 },
    taskListName: { fontSize: 14, fontWeight: "500", color: t.text },
    taskListMeta: { fontSize: 11, color: t.textFaint, marginTop: 2 },

    noListsText: {
      fontSize: 13, color: t.textFaint,
      paddingHorizontal: 14, paddingBottom: 14,
    },

    emptyRow: {
      padding: 24, alignItems: "center", gap: 8,
    },
    emptyText: { fontSize: 13, color: t.textFaint, textAlign: "center" },
  });
}
