/**
 * CalendarSubscriptionsScreen.tsx
 *
 * Browse and manage Google Calendar subscriptions for each connected account.
 * Users can see all their calendars, subscribe to shared/public calendars,
 * and unsubscribe from calendars they no longer need.
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, Alert, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../store/appStore";
import {
  fetchCalendarList,
  subscribeToCalendar,
  unsubscribeFromCalendar,
} from "../services/CalendarSyncService";
import { useTheme } from "../hooks/useTheme";
import type { Theme } from "../theme";

interface GCalEntry {
  id: string;
  summary: string;
  description?: string;
  backgroundColor?: string;
  primary?: boolean;
  accessRole: string;
}

export default function CalendarSubscriptionsScreen() {
  const t = useTheme();
  const s = useMemo(() => getStyles(t), [t]);

  const feeds   = useAppStore(st => st.feeds);
  const members = useAppStore(st => st.members);

  const [loading, setLoading]       = useState(false);
  const [calendars, setCalendars]   = useState<Record<string, GCalEntry[]>>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [addCalId, setAddCalId]     = useState("");
  const [addEmail, setAddEmail]     = useState("");

  // Get unique Google accounts
  const googleAccounts = [...new Set(
    feeds.filter(f => f.type === "gcal" && f.account).map(f => f.account!)
  )];

  const loadCalendars = async () => {
    setLoading(true);
    const result: Record<string, GCalEntry[]> = {};
    for (const email of googleAccounts) {
      try {
        result[email] = await fetchCalendarList(email);
      } catch {
        result[email] = [];
      }
    }
    setCalendars(result);
    setLoading(false);
  };

  useEffect(() => {
    if (googleAccounts.length > 0) loadCalendars();
    // Intentionally re-fetch only when the subscribed feed count changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeds.length]);

  const handleUnsubscribe = (email: string, cal: GCalEntry) => {
    if (cal.primary) {
      Alert.alert("Cannot Remove", "You can't unsubscribe from your primary calendar.");
      return;
    }
    Alert.alert(
      `Unsubscribe from "${cal.summary}"?`,
      "This removes it from your Google Calendar list.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Unsubscribe", style: "destructive", onPress: async () => {
          try {
            await unsubscribeFromCalendar(email, cal.id);
            loadCalendars();
          } catch (err: any) {
            Alert.alert("Error", err?.message || "Failed to unsubscribe.");
          }
        }},
      ]
    );
  };

  const handleSubscribe = async () => {
    const calId = addCalId.trim();
    if (!calId || !addEmail) return;
    try {
      await subscribeToCalendar(addEmail, calId);
      setShowAddModal(false);
      setAddCalId("");
      loadCalendars();
      Alert.alert("Subscribed", `Added "${calId}" to your Google Calendar.`);
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to subscribe. Check the calendar ID.");
    }
  };

  const getMemberForEmail = (email: string) => {
    const feed = feeds.find(f => f.type === "gcal" && f.account === email);
    return feed?.memberId ? members.find(m => m.id === feed.memberId) : null;
  };

  const roleLabel = (role: string) => {
    switch (role) {
      case "owner": return "Owner";
      case "writer": return "Can edit";
      case "reader": return "View only";
      case "freeBusyReader": return "Free/busy";
      default: return role;
    }
  };

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.headerRow}>
          <Text style={s.header}>Calendar Subscriptions</Text>
          <TouchableOpacity
            style={s.addBtn}
            onPress={() => {
              setAddEmail(googleAccounts[0] || "");
              setShowAddModal(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Subscribe to calendar"
            accessibilityHint="Double tap to add a new calendar subscription"
          >
            <Ionicons name="add" size={20} color={t.accent} />
            <Text style={s.addBtnText}>Subscribe</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.description}>
          Manage which Google Calendars are synced. Subscribe to shared or public calendars by ID.
        </Text>

        {loading && (
          <View style={s.loadingRow}>
            <ActivityIndicator color={t.accent} />
            <Text style={s.loadingText}>Loading calendars...</Text>
          </View>
        )}

        {googleAccounts.length === 0 && !loading && (
          <View style={s.emptyState}>
            <Ionicons name="logo-google" size={40} color={t.textFaint} />
            <Text style={s.emptyText}>No Google accounts connected</Text>
            <Text style={s.emptySubtext}>Add a Google Calendar in Settings first</Text>
          </View>
        )}

        {googleAccounts.map(email => {
          const member = getMemberForEmail(email);
          const cals = calendars[email] || [];

          return (
            <View key={email} style={s.accountSection}>
              <View style={s.accountHeader}>
                <Ionicons name="logo-google" size={16} color={t.accent} />
                <Text style={s.accountEmail}>{email}</Text>
                {member && <Text style={s.accountMember}>{member.name}</Text>}
                <TouchableOpacity
                  onPress={loadCalendars}
                  style={s.refreshBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Refresh calendars"
                >
                  <Ionicons name="refresh-outline" size={16} color={t.textSub} />
                </TouchableOpacity>
              </View>

              <View style={s.card}>
                {cals.map((cal, i) => (
                  <View key={cal.id} style={[s.calRow, i < cals.length - 1 && s.rowBorder]}>
                    <View style={[s.calDot, { backgroundColor: cal.backgroundColor || t.accent }]} />
                    <View style={s.calInfo}>
                      <Text style={s.calName}>
                        {cal.summary}
                        {cal.primary && <Text style={s.primaryBadge}> (Primary)</Text>}
                      </Text>
                      <Text style={s.calMeta}>
                        {roleLabel(cal.accessRole)}
                        {cal.description ? ` · ${cal.description}` : ""}
                      </Text>
                    </View>
                    {!cal.primary && (
                      <TouchableOpacity
                        onPress={() => handleUnsubscribe(email, cal)}
                        style={s.unsubBtn}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        accessibilityRole="button"
                        accessibilityLabel={`Unsubscribe from ${cal.summary}`}
                      >
                        <Ionicons name="close-circle-outline" size={20} color={t.textFaint} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}

                {cals.length === 0 && !loading && (
                  <View style={s.emptyRow}>
                    <Text style={s.emptyRowText}>No calendars found</Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Subscribe Modal */}
      <Modal visible={showAddModal} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Subscribe to Calendar</Text>

            <Text style={s.modalLabel}>Calendar ID or Email</Text>
            <TextInput
              style={s.modalInput}
              placeholder="e.g. en.usa#holiday@group.v.calendar.google.com"
              placeholderTextColor={t.textFaint}
              value={addCalId}
              onChangeText={setAddCalId}
              autoCapitalize="none"
              keyboardType="email-address"
              accessibilityRole="text"
              accessibilityLabel="Calendar ID or email"
            />

            {googleAccounts.length > 1 && (
              <>
                <Text style={s.modalLabel}>Using Account</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 16 }}>
                  <View style={s.chipRow}>
                    {googleAccounts.map(email => (
                      <TouchableOpacity
                        key={email}
                        style={[s.chip, addEmail === email && s.chipActive]}
                        onPress={() => setAddEmail(email)}
                        accessibilityRole="button"
                        accessibilityLabel={`Use account ${email}`}
                        accessibilityState={{ selected: addEmail === email }}
                      >
                        <Text style={[s.chipText, addEmail === email && s.chipTextActive]}>{email}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}

            <Text style={s.hintText}>
              You can find public calendar IDs in Google Calendar Settings under &quot;Integrate calendar&quot;.
              Common ones: US Holidays, sports leagues, school calendars.
            </Text>

            <View style={s.modalButtons}>
              <TouchableOpacity
                style={s.modalCancelBtn}
                onPress={() => setShowAddModal(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.modalSaveBtn}
                onPress={handleSubscribe}
                accessibilityRole="button"
                accessibilityLabel="Subscribe to calendar"
              >
                <Text style={s.modalSaveText}>Subscribe</Text>
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

    headerRow:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
    header:       { fontSize: 28, fontWeight: "700", color: t.text },
    addBtn:       { flexDirection: "row", alignItems: "center", gap: 4,
                    backgroundColor: t.accentBg, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
    addBtnText:   { fontSize: 14, fontWeight: "600", color: t.accent },

    description:  { fontSize: 14, color: t.textFaint, lineHeight: 20, marginBottom: 20 },

    loadingRow:   { flexDirection: "row", alignItems: "center", gap: 10, padding: 20 },
    loadingText:  { fontSize: 14, color: t.textSub },

    emptyState:   { alignItems: "center", paddingTop: 60, gap: 8 },
    emptyText:    { fontSize: 18, color: t.textFaint, fontWeight: "600" },
    emptySubtext: { fontSize: 14, color: t.textFaint },

    accountSection: { marginBottom: 20 },
    accountHeader:  { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
    accountEmail:   { flex: 1, fontSize: 14, fontWeight: "600", color: t.text },
    accountMember:  { fontSize: 12, color: t.textSub, backgroundColor: t.input,
                      borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
    refreshBtn:     { padding: 6 },

    card:         { backgroundColor: t.input, borderWidth: 1,
                    borderColor: t.cardBorder, borderRadius: 16, overflow: "hidden" },

    calRow:       { flexDirection: "row", alignItems: "center", padding: 14, gap: 10 },
    rowBorder:    { borderBottomWidth: 1, borderBottomColor: t.cardBorder },
    calDot:       { width: 12, height: 12, borderRadius: 6 },
    calInfo:      { flex: 1 },
    calName:      { fontSize: 15, fontWeight: "600", color: t.text },
    primaryBadge: { fontSize: 12, color: t.success, fontWeight: "400" },
    calMeta:      { fontSize: 12, color: t.textFaint, marginTop: 2 },
    unsubBtn:     { padding: 8 },

    emptyRow:     { padding: 20, alignItems: "center" },
    emptyRowText: { fontSize: 14, color: t.textFaint },

    modalOverlay: { flex: 1, backgroundColor: t.modalBd, justifyContent: "center", alignItems: "center", padding: 24 },
    modalCard:    { backgroundColor: t.modal, borderRadius: 20, padding: 24, width: "100%", maxWidth: 460 },
    modalTitle:   { fontSize: 20, fontWeight: "700", color: t.text, marginBottom: 20 },
    modalLabel:   { fontSize: 13, color: t.textSub, fontWeight: "600", marginBottom: 8,
                    letterSpacing: 1, textTransform: "uppercase" },
    modalInput:   { fontSize: 16, color: t.text, backgroundColor: t.inputBorder,
                    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16 },
    hintText:     { fontSize: 13, color: t.textFaint, lineHeight: 18, marginBottom: 20 },

    chipRow:      { flexDirection: "row", gap: 8 },
    chip:         { backgroundColor: t.input, borderWidth: 1, borderColor: t.cardBorder,
                    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
    chipActive:   { backgroundColor: t.accentBg, borderColor: t.accent },
    chipText:     { fontSize: 13, color: t.textSub, fontWeight: "500" },
    chipTextActive: { color: t.accent },

    modalButtons: { flexDirection: "row", gap: 12 },
    modalCancelBtn:{ flex: 1, backgroundColor: t.cardBorder, borderRadius: 12, padding: 14, alignItems: "center" },
    modalCancelText:{ fontSize: 15, color: t.textSub, fontWeight: "600" },
    modalSaveBtn: { flex: 1, backgroundColor: t.accent, borderRadius: 12, padding: 14, alignItems: "center" },
    modalSaveText:{ fontSize: 15, color: t.textOnAccent, fontWeight: "600" },
  });
}
