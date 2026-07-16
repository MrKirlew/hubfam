/**
 * SettingsScreen.tsx
 *
 * Full settings hub: manage family members (add/edit/remove),
 * calendar feed management (add Google Cal, add iCal feed),
 * tools, and app info.
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  View, Text, Switch, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Modal, Alert, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import WeatherSettings from "../components/settings/WeatherSettings";
import { useNavigation } from "@react-navigation/native";
import { useAppStore, type Member, type CalendarFeed } from "../store/appStore";
import { connectGoogleCalendar, fetchCalendarList, type GCalListEntry } from "../services/CalendarSyncService";
import * as SecureStore from "expo-secure-store";
import { verifyHubPin, setHubPinSecure, isLockedOut, getLockoutRemainingMs, isDigitsOnly } from "../services/PinService";
import strings from "../i18n/strings";
import { performSync } from "../services/SyncOrchestrator";
import GoogleTasksSettings from "../components/GoogleTasksSettings";
import { getBatteryInfo } from "../services/BatteryService";
import {
  hasDndPermission, requestDndPermission,
  enableDnd, disableDnd, setScreenBrightness as nativeSetBrightness,
} from "../../modules/app-manager";
import { useTheme } from "../hooks/useTheme";
import type { Theme } from "../theme";

const MEMBER_COLORS = ["#f87171","#60a5fa","#c084fc","#34d399","#fbbf24","#fb923c","#38bdf8","#e879f9","#a78bfa","#f472b6"];

function exportAllLogs(store: any, ShareAPI: any): void {
  const items = store.cleaningItems || [];
  if (items.length === 0) { Alert.alert("No Data", "No cleaning items to export."); return; }
  let text = "FAMILY HUB — CLEANING LOG REPORT\n";
  text += `Generated: ${new Date().toLocaleString()}\n\n`;
  for (const item of items) {
    text += `${item.icon} ${item.name} (every ${item.frequencyDays} days)\n`;
    if (item.lastCleaned) {
      text += `  Last: ${new Date(item.lastCleaned).toLocaleString()} by ${item.cleanedBy || "unknown"}\n`;
    } else {
      text += `  Status: Not cleaned\n`;
    }
    if (item.log && item.log.length > 0) {
      text += `  History (${item.log.length} entries):\n`;
      for (const e of item.log) {
        text += `    ${new Date(e.timestamp).toLocaleString()} — ${e.memberName}`;
        if (e.notes) text += `: ${e.notes}`;
        text += "\n";
      }
    }
    text += "\n";
  }
  ShareAPI.share({ message: text, title: "Cleaning Log Report" }).catch(() => {});
}

export default function SettingsScreen() {
  const navigation  = useNavigation<any>();
  const t           = useTheme();
  const styles      = useMemo(() => getStyles(t), [t]);
  const themeName   = useAppStore(s => s.themeName);
  const setThemeName = useAppStore(s => s.setThemeName);
  const members     = useAppStore(s => s.members);
  const feeds       = useAppStore(s => s.feeds);
  const addMember   = useAppStore(s => s.addMember);
  const updateMember= useAppStore(s => s.updateMember);
  const removeMember= useAppStore(s => s.removeMember);
  const addFeed     = useAppStore(s => s.addFeed);
  const removeFeed  = useAppStore(s => s.removeFeed);
  const toggleFeed  = useAppStore(s => s.toggleFeed);
  const updateFeed  = useAppStore(s => s.updateFeed);
  const hubName     = useAppStore(s => s.hubName);
  const setHubName  = useAppStore(s => s.setHubName);
  const lists       = useAppStore(s => s.lists);
  const removeList  = useAppStore(s => s.removeList);
  const events      = useAppStore(s => s.events);
  const removeEvent = useAppStore(s => s.removeEvent);
  const notificationsEnabled    = useAppStore(s => s.notificationsEnabled);
  const setNotificationsEnabled = useAppStore(s => s.setNotificationsEnabled);
  const dndEnabled              = useAppStore(s => s.dndEnabled);
  const setDndEnabled           = useAppStore(s => s.setDndEnabled);
  const batteryAlertPercents       = useAppStore(s => s.batteryAlertPercents);
  const toggleBatteryAlertPercent  = useAppStore(s => s.toggleBatteryAlertPercent);
  const clearBatteryAlertPercents  = useAppStore(s => s.clearBatteryAlertPercents);
  const screenBrightness         = useAppStore(s => s.screenBrightness);
  const setScreenBrightnessStore = useAppStore(s => s.setScreenBrightness);
  const lockShowContent    = useAppStore(s => s.lockShowContent);
  const setLockShowContent = useAppStore(s => s.setLockShowContent);
  const lockMuteAlarms     = useAppStore(s => s.lockMuteAlarms);
  const setLockMuteAlarms  = useAppStore(s => s.setLockMuteAlarms);
  const syncToGoogle       = useAppStore(s => s.syncToGoogle);
  const setSyncToGoogle    = useAppStore(s => s.setSyncToGoogle);
  const showClockBar       = useAppStore(s => s.showClockBar);
  const setShowClockBar    = useAppStore(s => s.setShowClockBar);
  const showWidgetDates    = useAppStore(s => s.showWidgetDates);
  const setShowWidgetDates = useAppStore(s => s.setShowWidgetDates);
  const rolloverIncomplete = useAppStore(s => s.rolloverIncomplete);
  const setRolloverIncomplete = useAppStore(s => s.setRolloverIncomplete);
  const smartInputEnabled = useAppStore(s => s.smartInputEnabled);
  const setSmartInputEnabled = useAppStore(s => s.setSmartInputEnabled);
  const keepAwakeEnabled   = useAppStore(s => s.keepAwakeEnabled);
  const setKeepAwakeEnabled = useAppStore(s => s.setKeepAwakeEnabled);
  const hubPin             = useAppStore(s => s.hubPin);
  const setHubPin          = useAppStore(s => s.setHubPin);
  // Battery info state
  const [batteryLevel, setBatteryLevel] = useState(100);
  const [isCharging, setIsCharging] = useState(false);

  // Poll battery info
  useEffect(() => {
    const load = async () => {
      try {
        const info = await getBatteryInfo();
        setBatteryLevel(info.level);
        setIsCharging(info.isCharging);
      } catch {}
    };
    load();
    const timer = setInterval(load, 300_000); // every 5 minutes (battery-efficient)
    return () => clearInterval(timer);
  }, []);

  // Hub name edit state
  const [editingHubName, setEditingHubName] = useState(false);
  const [hubNameDraft, setHubNameDraft] = useState(hubName);

  // Add Member modal state
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberColor, setNewMemberColor] = useState(MEMBER_COLORS[0]);
  const [newMemberRole, setNewMemberRole] = useState<"adult" | "child">("adult");
  const [newMemberIsAdmin, setNewMemberIsAdmin] = useState(false);

  // Edit Member modal state
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editRole, setEditRole] = useState<"adult" | "child">("adult");
  const [editIsAdmin, setEditIsAdmin] = useState(false);

  // Admin access check
  const activeProfile = useAppStore(s => s.activeProfile);
  const activeMember = members.find(m => m.id === activeProfile);
  const isCurrentUserAdmin = activeProfile === "all" || activeMember?.isAdmin === true;

  // Add Calendar modal state
  const [showAddCal, setShowAddCal] = useState(false);
  const [calType, setCalType] = useState<"gcal" | "apple" | "ical">("gcal");
  const [calName, setCalName] = useState("");
  const [calAccount, setCalAccount] = useState("");
  const [calMemberId, setCalMemberId] = useState<string | null>(null);
  const [calColor, setCalColor] = useState("#60a5fa");
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  // Google calendar picker state (step 2 of gcal add flow)
  const [showCalPicker, setShowCalPicker] = useState(false);
  const [gcalList, setGcalList] = useState<GCalListEntry[]>([]);
  const [gcalEmail, setGcalEmail] = useState("");
  const [gcalSelected, setGcalSelected] = useState<Set<string>>(new Set());
  const [loadingCalList, setLoadingCalList] = useState(false);

  // PIN change modal state (replaces Alert.prompt which is iOS-only)
  const [pinModalMode, setPinModalMode] = useState<"verify-old" | "enter-new" | "export-verify" | null>(null);
  const [pinModalEntry, setPinModalEntry] = useState("");

  const handleAddMember = () => {
    const name = newMemberName.trim();
    if (!name) return;
    const initials = name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
    addMember({
      id: Date.now().toString(),
      name,
      initials,
      color: newMemberColor,
      role: newMemberRole,
      isAdmin: newMemberIsAdmin,
    });
    setNewMemberName("");
    setNewMemberColor(MEMBER_COLORS[0]);
    setNewMemberRole("adult");
    setNewMemberIsAdmin(false);
    setShowAddMember(false);
  };

  const handleEditMember = () => {
    if (!editingMember || !editName.trim()) return;
    const name = editName.trim();
    const initials = name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

    // If promoting a CHILD to admin — require all adult admins to approve
    const isPromotingChildToAdmin = editRole === "child" && editIsAdmin && !editingMember.isAdmin;
    if (isPromotingChildToAdmin) {
      const adultAdmins = members.filter(m => m.role === "adult" && m.isAdmin);
      if (adultAdmins.length > 1) {
        // Start approval flow — current admin approves, need others
        const currentAdminId = activeProfile !== "all" ? activeProfile : adultAdmins[0]?.id;
        useAppStore.getState().setPendingChildAdmin({
          childId: editingMember.id,
          approvedBy: currentAdminId ? [currentAdminId] : [],
        });
        Alert.alert(
          "Admin Approval Required",
          `All adult admins must approve ${name} as admin.\n\n${adultAdmins.length - 1} more approval(s) needed.\n\nOther admins will see a prompt to approve.`,
          [{ text: "OK" }]
        );
        // Save other changes but NOT isAdmin yet
        updateMember(editingMember.id, { name, initials, color: editColor, role: editRole });
        setEditingMember(null);
        return;
      }
      // Only 1 adult admin — approve immediately
    }

    updateMember(editingMember.id, { name, initials, color: editColor, role: editRole, isAdmin: editIsAdmin });
    setEditingMember(null);
  };

  const handleDeleteMember = (m: Member) => {
    Alert.alert(
      `Remove ${m.name}?`,
      "This will remove their profile, calendar connections, to-do lists, events, and reminders.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove", style: "destructive",
          onPress: () => {
            feeds.filter(f => f.memberId === m.id).forEach(f => removeFeed(f.id));
            lists.filter(l => l.memberId === m.id).forEach(l => removeList(l.id));
            events.filter(e => e.memberId === m.id).forEach(e => removeEvent(e.id));
            removeMember(m.id);
          },
        },
      ]
    );
  };

  const handleAddCalendar = async () => {
    if (calType === "gcal") {
      // Step 1: Google OAuth → get email
      setConnectingGoogle(true);
      try {
        const email = await connectGoogleCalendar();
        // Step 2: Fetch calendar list for this account
        setLoadingCalList(true);
        const calList = await fetchCalendarList(email);
        // Filter out calendars already added for this member+account
        const alreadyAdded = new Set(
          feeds
            .filter(f => f.type === "gcal" && f.account === email)
            .map(f => f.googleCalendarId)
            .filter(Boolean)
        );
        const available = calList.filter(c => !alreadyAdded.has(c.id));
        if (available.length === 0) {
          Alert.alert("No New Calendars", "All calendars from this account have already been added.");
          return;
        }
        setGcalList(available);
        setGcalEmail(email);
        setGcalSelected(new Set());
        setShowAddCal(false);
        setShowCalPicker(true);
      } catch (err: any) {
        if (err?.code !== "SIGN_IN_CANCELLED" && err?.code !== "12501") {
          // Surface the raw Google Play Services status code so config mismatches
          // (e.g. DEVELOPER_ERROR = 10, meaning the SHA-1/package combo is not
          // registered against the Android OAuth client in Google Cloud Console)
          // are diagnosable instead of showing a blank "failed" toast.
          const code = err?.code ? ` (code ${err.code})` : "";
          const hint =
            err?.code === "DEVELOPER_ERROR" || err?.code === 10 || err?.code === "10"
              ? "\n\nThe app's signing certificate isn't registered in Google Cloud Console. The Android OAuth client must list package com.familyhub.app with this build's SHA-1."
              : "";
          Alert.alert(
            "Google Sign-In Failed",
            `${err?.message || "Please try again."}${code}${hint}`,
          );
        }
      } finally {
        setConnectingGoogle(false);
        setLoadingCalList(false);
      }
    } else {
      // iCal or Apple feed — manual URL entry
      const name = calName.trim();
      const account = calAccount.trim();
      if (!name || !account) return;
      addFeed({
        id: Date.now().toString(),
        name,
        type: calType === "apple" ? "apple" : "ical",
        memberId: calMemberId,
        color: calColor,
        account,
        enabled: true,
        lastSynced: null,
      });
      setCalName("");
      setCalAccount("");
      setCalMemberId(null);
      setCalColor("#60a5fa");
      setShowAddCal(false);
      performSync();
    }
  };

  // Re-authenticate an already-connected Google account when its refresh token
  // expires. Without this path, users had to open Add Calendar → Google →
  // Sign-in and accept a confusing "No New Calendars" alert just to refresh
  // credentials. connectGoogleCalendar() writes a fresh refresh_token to
  // SecureStore; performSync() then drains the auth-failure backlog.
  const handleReconnectGoogle = async () => {
    if (reconnecting) return;
    setReconnecting(true);
    try {
      const email = await connectGoogleCalendar();
      await performSync();
      Alert.alert(
        "Reconnected",
        `Signed in as ${email}. Your calendars are syncing now.`,
      );
    } catch (err: any) {
      if (err?.code !== "SIGN_IN_CANCELLED" && err?.code !== "12501") {
        const code = err?.code ? ` (code ${err.code})` : "";
        Alert.alert(
          "Sign-In Failed",
          `${err?.message || "Please try again."}${code}`,
        );
      }
    } finally {
      setReconnecting(false);
    }
  };

  const handleConfirmCalPicker = () => {
    if (gcalSelected.size === 0) return;
    const member = members.find(m => m.id === calMemberId);
    const memberLabel = member?.name || "Family";
    for (const cal of gcalList.filter(c => gcalSelected.has(c.id))) {
      addFeed({
        id: Date.now().toString() + "_" + cal.id.slice(0, 8),
        name: `${memberLabel} – ${cal.summary}`,
        type: "gcal",
        memberId: calMemberId,
        color: cal.backgroundColor || calColor,
        account: gcalEmail,
        googleCalendarId: cal.id,
        enabled: true,
        lastSynced: null,
      });
    }
    // Reset state
    setShowCalPicker(false);
    setGcalList([]);
    setGcalEmail("");
    setGcalSelected(new Set());
    setCalMemberId(null);
    setCalColor("#60a5fa");
    setCalName("");
    performSync();
  };

  const toggleCalSelection = (calId: string) => {
    setGcalSelected(prev => {
      const next = new Set(prev);
      if (next.has(calId)) next.delete(calId);
      else next.add(calId);
      return next;
    });
  };

  const handleDeleteFeed = (feed: CalendarFeed) => {
    Alert.alert(`Remove "${feed.name}"?`, "This calendar will no longer sync.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => {
        // Remove token in background — don't let it block feed removal
        if (feed.type === "gcal" && feed.account) {
          const key = `google_token_${feed.account.replace(/@/g, "_at_").replace(/\./g, "_dot_")}`;
          SecureStore.deleteItemAsync(key).catch(() => {});
        }
        removeFeed(feed.id);
      }},
    ]);
  };

  const getMember = (id: string | null) => members.find(m => m.id === id);
  const [activeTab, setActiveTab] = useState<"general" | "accounts" | "display" | "security">("general");
  // PIN modal digit handler
  const handlePinModalDigit = async (digit: string) => {
    if (!isDigitsOnly(digit)) return;
    const next = pinModalEntry + digit;
    setPinModalEntry(next);
    if (next.length === 4) {
      if (pinModalMode === "verify-old") {
        if (isLockedOut()) {
          const secs = Math.ceil(getLockoutRemainingMs() / 1000);
          Alert.alert(strings.pin.tooManyAttempts, strings.pin.tryAgainIn(secs));
          setPinModalEntry("");
          return;
        }
        const match = await verifyHubPin(next);
        if (match) {
          setPinModalEntry("");
          setPinModalMode("enter-new");
        } else {
          setPinModalEntry("");
          Alert.alert(strings.pin.wrongPin, strings.pin.wrongCurrentPin);
        }
      } else if (pinModalMode === "enter-new") {
        if (!isDigitsOnly(next)) {
          Alert.alert(strings.pin.wrongPin, strings.pin.invalid);
          setPinModalEntry("");
          return;
        }
        await setHubPinSecure(next);
        setHubPin("SECURE");
        setPinModalEntry("");
        setPinModalMode(null);
        Alert.alert(strings.settings.changePin, strings.pin.pinChanged);
      } else if (pinModalMode === "export-verify") {
        if (isLockedOut()) {
          const secs = Math.ceil(getLockoutRemainingMs() / 1000);
          Alert.alert(strings.pin.tooManyAttempts, strings.pin.tryAgainIn(secs));
          setPinModalEntry("");
          return;
        }
        const match = await verifyHubPin(next);
        setPinModalEntry("");
        if (match) {
          setPinModalMode(null);
          const Share = require("react-native").Share;
          const store = useAppStore.getState();
          exportAllLogs(store, Share);
        } else {
          Alert.alert(strings.pin.wrongPin, strings.pin.wrongPin);
        }
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>

        <Text style={styles.header}>Settings</Text>

        {/* Tab bar */}
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 16, marginHorizontal: 4 }}>
          {([
            { key: "general", label: "General", icon: "⚙️" },
            { key: "accounts", label: "Accounts", icon: "📧" },
            { key: "display", label: "Display", icon: "🎨" },
            { key: "security", label: "Security", icon: "🔒" },
          ] as const).map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={{
                flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center",
                backgroundColor: activeTab === tab.key ? t.accent : t.card,
                borderWidth: activeTab === tab.key ? 0 : 1,
                borderColor: t.cardBorder,
              }}
              onPress={() => setActiveTab(tab.key)}
              accessibilityRole="button"
              accessibilityLabel={`${tab.label} tab`}
              accessibilityState={{ selected: activeTab === tab.key }}
            >
              <Text style={{
                fontSize: 12, fontWeight: "600",
                color: activeTab === tab.key ? t.textOnAccent : t.textSub,
              }}>
                {tab.icon} {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ═══════ GENERAL TAB ═══════ */}
        {activeTab === "general" && (<>

        {/* ── Pending Child Admin Approval Banner ──────────────── */}
        {useAppStore.getState().pendingChildAdmin && isCurrentUserAdmin && (() => {
          const pending = useAppStore.getState().pendingChildAdmin!;
          const child = members.find(m => m.id === pending.childId);
          const adultAdmins = members.filter(m => m.role === "adult" && m.isAdmin);
          const currentId = activeProfile !== "all" ? activeProfile : null;
          const alreadyApproved = currentId ? pending.approvedBy.includes(currentId) : false;
          const approvalsNeeded = adultAdmins.length;
          const approvalsGot = pending.approvedBy.length;

          if (!child) return null;
          return (
            <View style={{ backgroundColor: `${t.warning}1A`, borderRadius: 12, padding: 14,
                           marginBottom: 12, borderWidth: 1, borderColor: `${t.warning}4D` }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: t.warning }}>
                ⚠️ Admin Approval Pending
              </Text>
              <Text style={{ fontSize: 13, color: t.text, marginTop: 4 }}>
                {child.name} has been requested as admin.
                {"\n"}{approvalsGot}/{approvalsNeeded} admin(s) approved.
              </Text>
              {!alreadyApproved && currentId ? (
                <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                  <TouchableOpacity
                    style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: t.success }}
                    onPress={() => {
                      const newApprovals = [...pending.approvedBy, currentId];
                      if (newApprovals.length >= approvalsNeeded) {
                        // All admins approved — promote child
                        updateMember(pending.childId, { isAdmin: true });
                        useAppStore.getState().setPendingChildAdmin(null);
                        Alert.alert("Approved", `${child.name} is now an admin!`);
                      } else {
                        useAppStore.getState().setPendingChildAdmin({ ...pending, approvedBy: newApprovals });
                        Alert.alert("Approved", `Your approval recorded. ${approvalsNeeded - newApprovals.length} more needed.`);
                      }
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Approve ${child.name} as admin`}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: t.textOnAccent }}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: `${t.error}33` }}
                    onPress={() => {
                      useAppStore.getState().setPendingChildAdmin(null);
                      Alert.alert("Denied", `Request for ${child.name} to be admin was denied.`);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Deny ${child.name} as admin`}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: t.error }}>Deny</Text>
                  </TouchableOpacity>
                </View>
              ) : alreadyApproved ? (
                <Text style={{ fontSize: 12, color: `${t.success}B3`, marginTop: 6 }}>
                  ✅ You already approved. Waiting for other admins.
                </Text>
              ) : null}
            </View>
          );
        })()}

        {/* ── Hub Name ────────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Hub Name</Text>
        <View style={styles.card}>
          {editingHubName ? (
            <View style={styles.hubNameEditRow}>
              <TextInput
                style={styles.hubNameInput}
                value={hubNameDraft}
                onChangeText={setHubNameDraft}
                autoFocus
                selectTextOnFocus
                onSubmitEditing={() => {
                  const name = hubNameDraft.trim();
                  if (name) setHubName(name);
                  setEditingHubName(false);
                }}
                accessibilityRole="text"
                accessibilityLabel="Hub name"
              />
              <TouchableOpacity
                style={styles.hubNameSaveBtn}
                onPress={() => {
                  const name = hubNameDraft.trim();
                  if (name) setHubName(name);
                  setEditingHubName(false);
                }}
                accessibilityRole="button"
                accessibilityLabel="Save hub name"
              >
                <Ionicons name="checkmark" size={20} color={t.success} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.hubNameCancelBtn}
                onPress={() => { setHubNameDraft(hubName); setEditingHubName(false); }}
                accessibilityRole="button"
                accessibilityLabel="Cancel editing hub name"
              >
                <Ionicons name="close" size={20} color={t.textSub} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.hubNameRow}
              onPress={() => { setHubNameDraft(hubName); setEditingHubName(true); }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Hub name: ${hubName}`}
              accessibilityHint="Double tap to edit hub name"
            >
              <Ionicons name="home-outline" size={20} color={t.accent} />
              <Text style={styles.hubNameText}>{hubName}</Text>
              <Ionicons name="pencil-outline" size={16} color={t.textFaint} />
            </TouchableOpacity>
          )}
        </View>

        {/* ── Family Members ──────────────────────────────────────── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Family Members</Text>
          {isCurrentUserAdmin && (
            <TouchableOpacity
              style={styles.sectionBtn}
              onPress={() => setShowAddMember(true)}
              accessibilityRole="button"
              accessibilityLabel="Add family member"
            >
              <Ionicons name="person-add-outline" size={16} color={t.accent} />
              <Text style={styles.sectionBtnText}>Add</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.card}>
          {members.map((m, i) => (
            <View key={m.id}>
              <View
                style={[styles.memberRow, i < members.length - 1 && styles.rowBorder]}
              >
                <TouchableOpacity
                  style={styles.memberLeft}
                  onPress={() => { setEditingMember(m); setEditName(m.name); setEditColor(m.color); setEditRole(m.role || "adult"); setEditIsAdmin(m.isAdmin || false); }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${m.name}`}
                  accessibilityHint="Double tap to edit this member"
                >
                  <View style={[styles.avatar, { backgroundColor: m.color + "33", borderColor: m.color }]}>
                    <Text style={[styles.avatarText, { color: m.color }]}>{m.initials}</Text>
                  </View>
                  <View style={styles.memberInfo}>
                    <View style={styles.memberNameRow}>
                      <Text style={styles.memberName}>{m.name}</Text>
                      <View style={[styles.roleBadge, { backgroundColor: (m.role || "adult") === "child" ? "#fbbf2433" : `${t.accent}33` }]}>
                        <Text style={[styles.roleBadgeText, { color: (m.role || "adult") === "child" ? t.warning : t.accent }]}>
                          {(m.role || "adult") === "child" ? "Child" : "Adult"}
                        </Text>
                      </View>
                      {m.isAdmin && (
                        <View style={[styles.roleBadge, { backgroundColor: "#c084fc33" }]}>
                          <Text style={[styles.roleBadgeText, { color: "#c084fc" }]}>Admin</Text>
                        </View>
                      )}
                      <Ionicons name="pencil-outline" size={14} color={t.textFaint} />
                    </View>
                    <Text style={styles.memberMeta} numberOfLines={1}>
                      {(() => {
                        const emails = [...new Set(feeds.filter(f => f.type === "gcal" && f.memberId === m.id && f.account).map(f => f.account!))];
                        return emails.length > 0 ? emails.join(", ") : "No account assigned";
                      })()}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {members.length === 0 && (
            <View style={styles.emptyRow}>
              <Text style={styles.emptyText}>No family members yet. Tap "Add" above.</Text>
            </View>
          )}
        </View>

        </>)}

        {/* ═══════ ACCOUNTS TAB ═══════ */}
        {activeTab === "accounts" && (<>

        {/* ── Reconnect banner — shown whenever any Google-backed feed exists ── */}
        {feeds.some(f => f.type === "gcal") && (
          <TouchableOpacity
            style={styles.reconnectBanner}
            onPress={handleReconnectGoogle}
            disabled={reconnecting}
            accessibilityRole="button"
            accessibilityLabel={reconnecting ? "Reconnecting Google account" : "Reconnect a Google account"}
            accessibilityHint="Refreshes Google sign-in when calendar events stop appearing"
            accessibilityState={{ disabled: reconnecting, busy: reconnecting }}
          >
            <Ionicons
              name={reconnecting ? "sync-circle" : "refresh-circle-outline"}
              size={26}
              color={t.accent}
            />
            <View style={styles.reconnectText}>
              <Text style={styles.reconnectTitle}>
                {reconnecting ? "Reconnecting…" : "Reconnect a Google account"}
              </Text>
              <Text style={styles.reconnectSub}>
                Tap if calendar events stop appearing. Re-authenticates the account and refreshes your events.
              </Text>
            </View>
            {reconnecting && <ActivityIndicator size="small" color={t.accent} />}
          </TouchableOpacity>
        )}

        {/* ── Calendar Feeds ─────────────────────────────────────── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Calendar Accounts</Text>
          <TouchableOpacity
            style={styles.sectionBtn}
            onPress={() => setShowAddCal(true)}
            accessibilityRole="button"
            accessibilityLabel="Add calendar account"
          >
            <Ionicons name="add-circle-outline" size={16} color={t.accent} />
            <Text style={styles.sectionBtnText}>Add</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          {feeds.map((f, i) => {
            const member = getMember(f.memberId);
            return (
              <View key={f.id} style={[styles.feedRow, i < feeds.length - 1 && styles.rowBorder]}>
                <TouchableOpacity
                  onPress={() => toggleFeed(f.id)}
                  style={styles.feedToggle}
                  accessibilityRole="switch"
                  accessibilityLabel={`${f.name} calendar`}
                  accessibilityState={{ checked: f.enabled }}
                  accessibilityHint="Double tap to toggle this calendar"
                >
                  <Ionicons
                    name={f.enabled ? "checkbox" : "square-outline"}
                    size={22}
                    color={f.enabled ? f.color : t.textFaint}
                  />
                </TouchableOpacity>
                <View style={[styles.feedDot, { backgroundColor: f.color }]} />
                <View style={styles.feedInfo}>
                  <Text style={styles.feedName}>{f.name}</Text>
                  <Text style={styles.feedMeta}>
                    {f.type === "gcal" ? "Google Calendar" : f.type === "ical" ? "iCal Feed" : "Manual"}
                    {member ? ` · ${member.name}` : " · Family"}
                  </Text>
                </View>
                {f.type !== "manual" && (
                  <TouchableOpacity
                    onPress={() => handleDeleteFeed(f)}
                    style={styles.feedDelete}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${f.name} calendar`}
                  >
                    <Ionicons name="trash-outline" size={20} color={t.textSub} />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          {feeds.length === 0 && (
            <View style={styles.emptyRow}>
              <Text style={styles.emptyText}>No calendars connected. Tap "Add" above.</Text>
            </View>
          )}
        </View>

        {/* ── Google Tasks ────────────────────────────────────────── */}
        <GoogleTasksSettings />

        {/* ── Weather (extracted component) ────────────────────── */}
        <WeatherSettings />

        </>)}

        {/* ═══════ SECURITY TAB ═══════ */}
        {activeTab === "security" && (<>

        {/* ── Quick Actions ────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.card}>
          <View style={[styles.toolRow, styles.rowBorder]}>
            <View style={styles.toolIcon}>
              <Text style={styles.toolIconText}>🔔</Text>
            </View>
            <View style={[styles.toolInfo, { flex: 1 }]}>
              <Text style={styles.toolName}>Device Notifications</Text>
              <Text style={styles.toolDesc}>Show notifications in the device notification bar (not in-app alerts)</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: t.cardBorder, true: `${t.accent}66` }}
              thumbColor={notificationsEnabled ? t.accent : "#888"}
              accessibilityRole="switch"
              accessibilityLabel="Device notifications"
              accessibilityState={{ checked: notificationsEnabled }}
            />
          </View>
        </View>

        {/* ── PIN Management ──────────────────────────────────── */}
        <Text style={styles.sectionTitle}>PIN Management</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.toolRow}
            onPress={() => {
              if (hubPin) {
                setPinModalEntry("");
                setPinModalMode("verify-old");
              } else {
                Alert.alert("No PIN Set", "Use the lock button on the dashboard to set a PIN first.");
              }
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Change hub PIN"
          >
            <View style={styles.toolIcon}>
              <Text style={styles.toolIconText}>🔑</Text>
            </View>
            <View style={styles.toolInfo}>
              <Text style={styles.toolName}>Change Hub PIN</Text>
              <Text style={styles.toolDesc}>{hubPin ? "Update your 4-digit lock PIN" : "No PIN set — use lock button to create one"}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={t.textFaint} />
          </TouchableOpacity>
        </View>

        </>)}

        {/* ═══════ DISPLAY TAB ═══════ */}
        {activeTab === "display" && (<>

        {/* ── Theme ────────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Theme</Text>
        <View style={styles.card}>
          <View style={styles.toolRow}>
            <View style={styles.toolIcon}>
              <Text style={styles.toolIconText}>🎨</Text>
            </View>
            <View style={[styles.toolInfo, { flex: 1 }]}>
              <Text style={styles.toolName}>Color Theme</Text>
              <Text style={styles.toolDesc}>Choose the app's visual style</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingBottom: 16 }}>
            <TouchableOpacity
              style={{ flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center",
                backgroundColor: themeName === "dark" ? t.accent : t.toolbar,
                borderWidth: 2, borderColor: themeName === "dark" ? t.accent : t.cardBorder }}
              onPress={() => setThemeName("dark")}
              accessibilityRole="button"
              accessibilityLabel="Dark theme"
              accessibilityState={{ selected: themeName === "dark" }}
            >
              <Text style={{ fontSize: 14, fontWeight: "700",
                color: themeName === "dark" ? t.textOnAccent : t.textSub }}>🌙 Dark</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center",
                backgroundColor: themeName === "ocean" ? "#4A9CC7" : t.toolbar,
                borderWidth: 2, borderColor: themeName === "ocean" ? "#4A9CC7" : t.cardBorder }}
              onPress={() => setThemeName("ocean")}
              accessibilityRole="button"
              accessibilityLabel="Ocean theme"
              accessibilityState={{ selected: themeName === "ocean" }}
            >
              <Text style={{ fontSize: 14, fontWeight: "700",
                color: themeName === "ocean" ? t.textOnAccent : t.textSub }}>🌊 Ocean</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Lock Screen ─────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Lock Screen</Text>
        <View style={styles.card}>
          <View style={[styles.toolRow, styles.rowBorder]}>
            <View style={styles.toolIcon}>
              <Text style={styles.toolIconText}>👁️</Text>
            </View>
            <View style={[styles.toolInfo, { flex: 1 }]}>
              <Text style={styles.toolName}>Show Content When Locked</Text>
              <Text style={styles.toolDesc}>Display dashboard behind PIN screen (view-only, nothing can be tapped)</Text>
            </View>
            <Switch
              value={lockShowContent}
              onValueChange={(v) => setLockShowContent(v)}
              trackColor={{ false: t.cardBorder, true: `${t.accent}66` }}
              thumbColor={lockShowContent ? t.accent : "#888"}
              accessibilityRole="switch"
              accessibilityLabel="Show content when locked"
              accessibilityState={{ checked: lockShowContent }}
            />
          </View>
          <View style={styles.toolRow}>
            <View style={styles.toolIcon}>
              <Text style={styles.toolIconText}>🔇</Text>
            </View>
            <View style={[styles.toolInfo, { flex: 1 }]}>
              <Text style={styles.toolName}>Mute Alarms When Locked</Text>
              <Text style={styles.toolDesc}>Silence alarm popups and sounds while the hub is locked</Text>
            </View>
            <Switch
              value={lockMuteAlarms}
              onValueChange={(v) => setLockMuteAlarms(v)}
              trackColor={{ false: t.cardBorder, true: `${t.warning}66` }}
              thumbColor={lockMuteAlarms ? t.warning : "#888"}
              accessibilityRole="switch"
              accessibilityLabel="Mute alarms when locked"
              accessibilityState={{ checked: lockMuteAlarms }}
            />
          </View>
        </View>

        {/* ── Sync ─────────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Sync</Text>
        <View style={styles.card}>
          <View style={styles.toolRow}>
            <View style={styles.toolIcon}>
              <Text style={styles.toolIconText}>🔄</Text>
            </View>
            <View style={[styles.toolInfo, { flex: 1 }]}>
              <Text style={styles.toolName}>Sync Changes to Google</Text>
              <Text style={styles.toolDesc}>Push local edits (events, tasks) back to your Google account</Text>
            </View>
            <Switch
              value={syncToGoogle}
              onValueChange={(v) => setSyncToGoogle(v)}
              trackColor={{ false: t.cardBorder, true: `${t.success}66` }}
              thumbColor={syncToGoogle ? t.success : "#888"}
              accessibilityRole="switch"
              accessibilityLabel="Sync changes to Google"
              accessibilityState={{ checked: syncToGoogle }}
            />
          </View>
        </View>

        {/* ── Display & Power ──────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Display & Power</Text>
        <View style={styles.card}>
          <View style={[styles.toolRow, styles.rowBorder]}>
            <View style={styles.toolIcon}>
              <Text style={styles.toolIconText}>🕐</Text>
            </View>
            <View style={[styles.toolInfo, { flex: 1 }]}>
              <Text style={styles.toolName}>Show Clock in Toolbar</Text>
              <Text style={styles.toolDesc}>Display time and date at the top of the dashboard</Text>
            </View>
            <Switch
              value={showClockBar}
              onValueChange={(v) => setShowClockBar(v)}
              trackColor={{ false: t.cardBorder, true: `${t.accent}66` }}
              thumbColor={showClockBar ? t.accent : "#888"}
              accessibilityRole="switch"
              accessibilityLabel="Show clock in toolbar"
              accessibilityState={{ checked: showClockBar }}
            />
          </View>
          <View style={styles.toolRow}>
            <View style={styles.toolIcon}>
              <Text style={styles.toolIconText}>💡</Text>
            </View>
            <View style={[styles.toolInfo, { flex: 1 }]}>
              <Text style={styles.toolName}>Always On Display</Text>
              <Text style={styles.toolDesc}>Keep screen on (for wall/fridge mount). Uses more battery.</Text>
            </View>
            <Switch
              value={keepAwakeEnabled}
              onValueChange={(v) => setKeepAwakeEnabled(v)}
              trackColor={{ false: t.cardBorder, true: `${t.warning}66` }}
              thumbColor={keepAwakeEnabled ? t.warning : "#888"}
              accessibilityRole="switch"
              accessibilityLabel="Always on display"
              accessibilityState={{ checked: keepAwakeEnabled }}
            />
          </View>
          <View style={[styles.toolRow, styles.rowBorder]}>
            <View style={styles.toolIcon}>
              <Text style={styles.toolIconText}>📅</Text>
            </View>
            <View style={[styles.toolInfo, { flex: 1 }]}>
              <Text style={styles.toolName}>Show Dates on Widgets</Text>
              <Text style={styles.toolDesc}>Display date reference next to Today/Tomorrow</Text>
            </View>
            <Switch
              value={showWidgetDates}
              onValueChange={(v) => setShowWidgetDates(v)}
              trackColor={{ false: t.cardBorder, true: `${t.accent}66` }}
              thumbColor={showWidgetDates ? t.accent : "#888"}
              accessibilityRole="switch"
              accessibilityLabel="Show dates on widgets"
              accessibilityState={{ checked: showWidgetDates }}
            />
          </View>
          <View style={[styles.toolRow, styles.rowBorder]}>
            <View style={styles.toolIcon}>
              <Text style={styles.toolIconText}>🔄</Text>
            </View>
            <View style={[styles.toolInfo, { flex: 1 }]}>
              <Text style={styles.toolName}>Roll Over Incomplete Tasks</Text>
              <Text style={styles.toolDesc}>Move unfinished tasks to the next day automatically</Text>
            </View>
            <Switch
              value={rolloverIncomplete}
              onValueChange={(v) => setRolloverIncomplete(v)}
              trackColor={{ false: t.cardBorder, true: `${t.accent}66` }}
              thumbColor={rolloverIncomplete ? t.accent : "#888"}
              accessibilityRole="switch"
              accessibilityLabel="Roll over incomplete tasks"
              accessibilityState={{ checked: rolloverIncomplete }}
            />
          </View>
          <View style={styles.toolRow}>
            <View style={styles.toolIcon}>
              <Text style={styles.toolIconText}>✨</Text>
            </View>
            <View style={[styles.toolInfo, { flex: 1 }]}>
              <Text style={styles.toolName}>Smart Input</Text>
              <Text style={styles.toolDesc}>Parse dates, times, repeats from quick-add text; ask only what's missing</Text>
            </View>
            <Switch
              value={smartInputEnabled}
              onValueChange={(v) => setSmartInputEnabled(v)}
              trackColor={{ false: t.cardBorder, true: `${t.accent}66` }}
              thumbColor={smartInputEnabled ? t.accent : "#888"}
              accessibilityRole="switch"
              accessibilityLabel="Smart input"
              accessibilityHint="When on, QuickAddBar detects dates, times, and repeats from what you type"
              accessibilityState={{ checked: smartInputEnabled }}
            />
          </View>
        </View>

        {/* ── Device & Battery ──────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Device & Battery</Text>
        <View style={styles.card}>
          {/* Battery status */}
          <View style={[styles.toolRow, styles.rowBorder]}>
            <View style={styles.toolIcon}>
              <Text style={styles.toolIconText}>{isCharging ? "⚡" : "🔋"}</Text>
            </View>
            <View style={[styles.toolInfo, { flex: 1 }]}>
              <Text style={styles.toolName}>Battery: {batteryLevel}%</Text>
              <Text style={styles.toolDesc}>{isCharging ? "Charging" : "On battery"}</Text>
            </View>
            <View style={{ backgroundColor: batteryLevel <= 20 ? `${t.error}33` : `${t.success}33`, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: batteryLevel <= 20 ? t.error : t.success, fontWeight: "700", fontSize: 13 }}>{batteryLevel}%</Text>
            </View>
          </View>

          {/* DND toggle */}
          <View style={[styles.toolRow, styles.rowBorder]}>
            <View style={styles.toolIcon}>
              <Text style={styles.toolIconText}>🔕</Text>
            </View>
            <View style={[styles.toolInfo, { flex: 1 }]}>
              <Text style={styles.toolName}>Do Not Disturb</Text>
              <Text style={styles.toolDesc}>Silence all other app notifications</Text>
            </View>
            <Switch
              value={dndEnabled}
              accessibilityRole="switch"
              accessibilityLabel="Do not disturb"
              accessibilityState={{ checked: dndEnabled }}
              onValueChange={async (val) => {
                try {
                  const hasPermission = await hasDndPermission();
                  if (!hasPermission) {
                    Alert.alert(
                      "DND Permission Required",
                      "FamilyHub needs permission to control Do Not Disturb. Tap OK to open settings.",
                      [
                        { text: "Cancel", style: "cancel" },
                        { text: "OK", onPress: () => requestDndPermission() },
                      ]
                    );
                    return;
                  }
                  if (val) await enableDnd(); else await disableDnd();
                  setDndEnabled(val);
                } catch (err: any) {
                  Alert.alert("Error", err?.message || "Failed to toggle DND.");
                }
              }}
              trackColor={{ false: t.cardBorder, true: `${t.accent}66` }}
              thumbColor={dndEnabled ? t.accent : "#888"}
            />
          </View>

          {/* Screen Brightness */}
          <View style={[styles.toolRow, styles.rowBorder]}>
            <View style={styles.toolIcon}>
              <Text style={styles.toolIconText}>☀️</Text>
            </View>
            <View style={[styles.toolInfo, { flex: 1 }]}>
              <Text style={styles.toolName}>Screen Brightness</Text>
              <Text style={styles.toolDesc}>{Math.round(screenBrightness * 100)}% — Lower saves battery</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <TouchableOpacity
                onPress={() => {
                  const val = Math.max(0.1, screenBrightness - 0.1);
                  setScreenBrightnessStore(val);
                  nativeSetBrightness(val);
                }}
                style={{ padding: 4 }}
                accessibilityRole="button"
                accessibilityLabel="Decrease brightness"
              >
                <Ionicons name="remove-circle-outline" size={24} color={t.textSub} />
              </TouchableOpacity>
              <Text style={{ color: t.text, fontWeight: "700", fontSize: 15, width: 40, textAlign: "center" }}>
                {Math.round(screenBrightness * 100)}%
              </Text>
              <TouchableOpacity
                onPress={() => {
                  const val = Math.min(1.0, screenBrightness + 0.1);
                  setScreenBrightnessStore(val);
                  nativeSetBrightness(val);
                }}
                style={{ padding: 4 }}
                accessibilityRole="button"
                accessibilityLabel="Increase brightness"
              >
                <Ionicons name="add-circle-outline" size={24} color={t.textSub} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Battery Alert (multi-select) */}
          <View style={styles.toolRow}>
            <View style={styles.toolIcon}>
              <Text style={styles.toolIconText}>🔊</Text>
            </View>
            <View style={[styles.toolInfo, { flex: 1 }]}>
              <Text style={styles.toolName}>Low Battery Alerts</Text>
              <Text style={styles.toolDesc}>
                {batteryAlertPercents.length === 0
                  ? "Off"
                  : `Ring at ${[...batteryAlertPercents].sort((a, b) => b - a).map(p => `${p}%`).join(", ")}`}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 280 }}>
              <TouchableOpacity
                onPress={clearBatteryAlertPercents}
                style={{
                  paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
                  backgroundColor: batteryAlertPercents.length === 0 ? t.accentBg : t.card,
                }}
                accessibilityRole="button"
                accessibilityLabel="Turn off all battery alerts"
                accessibilityState={{ selected: batteryAlertPercents.length === 0 }}
              >
                <Text style={{
                  fontSize: 12, fontWeight: "600",
                  color: batteryAlertPercents.length === 0 ? t.accent : t.textSub,
                }}>
                  Off
                </Text>
              </TouchableOpacity>
              {[10, 15, 20, 30, 50].map(pct => {
                const selected = batteryAlertPercents.includes(pct);
                return (
                  <TouchableOpacity
                    key={pct}
                    onPress={() => toggleBatteryAlertPercent(pct)}
                    style={{
                      paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
                      backgroundColor: selected ? t.accentBg : t.card,
                    }}
                    accessibilityRole="checkbox"
                    accessibilityLabel={`Battery alert at ${pct}%`}
                    accessibilityState={{ checked: selected }}
                  >
                    <Text style={{
                      fontSize: 12, fontWeight: "600",
                      color: selected ? t.accent : t.textSub,
                    }}>
                      {pct}%
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        {/* ── Tools ───────────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Tools</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={[styles.toolRow, styles.rowBorder]}
            onPress={() => navigation.navigate("CalendarSubscriptions")}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Calendar subscriptions"
          >
            <View style={styles.toolIcon}>
              <Text style={styles.toolIconText}>📅</Text>
            </View>
            <View style={styles.toolInfo}>
              <Text style={styles.toolName}>Calendar Subscriptions</Text>
              <Text style={styles.toolDesc}>Browse and manage Google Calendar subscriptions</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={t.textFaint} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toolRow, styles.rowBorder]}
            onPress={() => navigation.navigate("AlarmSchedule")}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Alarm schedules"
          >
            <View style={styles.toolIcon}>
              <Text style={styles.toolIconText}>⏰</Text>
            </View>
            <View style={styles.toolInfo}>
              <Text style={styles.toolName}>Alarm Schedules</Text>
              <Text style={styles.toolDesc}>Set reminders to check FamilyHub throughout the day</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={t.textFaint} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toolRow, styles.rowBorder]}
            onPress={() => navigation.navigate("Pairing")}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Family sharing"
          >
            <View style={styles.toolIcon}>
              <Text style={styles.toolIconText}>📲</Text>
            </View>
            <View style={styles.toolInfo}>
              <Text style={styles.toolName}>Family Sharing</Text>
              <Text style={styles.toolDesc}>Pair phones to send messages &amp; lists to this hub</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={t.textFaint} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toolRow, styles.rowBorder]}
            onPress={() => navigation.navigate("AppManager")}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="App manager"
          >
            <View style={styles.toolIcon}>
              <Text style={styles.toolIconText}>📦</Text>
            </View>
            <View style={styles.toolInfo}>
              <Text style={styles.toolName}>App Manager</Text>
              <Text style={styles.toolDesc}>Find and uninstall apps from this device</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={t.textFaint} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.toolRow}
            onPress={() => {
              const store = useAppStore.getState();
              if (store.hubPin) {
                setPinModalEntry("");
                setPinModalMode("export-verify");
              } else {
                const Share = require("react-native").Share;
                exportAllLogs(store, Share);
              }
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Export cleaning log"
          >
            <View style={styles.toolIcon}>
              <Text style={styles.toolIconText}>📊</Text>
            </View>
            <View style={styles.toolInfo}>
              <Text style={styles.toolName}>Export Cleaning Log</Text>
              <Text style={styles.toolDesc}>Share cleaning history via email or messaging</Text>
            </View>
            <Ionicons name="share-outline" size={20} color={t.accent} />
          </TouchableOpacity>
        </View>

        {/* ── Storage & Data ──────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Storage & Data</Text>
        <View style={styles.card}>
          {/* Clear App Cache — double confirm */}
          <TouchableOpacity
            style={[styles.toolRow, styles.rowBorder]}
            accessibilityRole="button"
            accessibilityLabel="Clear app cache"
            onPress={() => {
              Alert.alert(
                "Clear FamilyHub Cache?",
                "This will remove cached calendar data and temporary files. Your settings and accounts will NOT be affected.",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Continue", style: "destructive", onPress: () => {
                    Alert.alert(
                      "Confirm Clear Cache",
                      "Cached calendars and temp files will be deleted. The app may take a moment to reload data.",
                      [
                        { text: "Go Back", style: "cancel" },
                        { text: "Clear Cache Now", style: "destructive", onPress: async () => {
                          try {
                            const FS = require("expo-file-system");
                            const cacheDir = FS.cacheDirectory;
                            if (cacheDir) {
                              await FS.deleteAsync(cacheDir, { idempotent: true });
                              await FS.makeDirectoryAsync(cacheDir, { intermediates: true });
                            }
                          } catch {}
                          Alert.alert("Done", "FamilyHub cache has been cleared.");
                        }},
                      ]
                    );
                  }},
                ]
              );
            }}
            activeOpacity={0.7}
          >
            <View style={styles.toolIcon}><Text style={styles.toolIconText}>🗑️</Text></View>
            <View style={styles.toolInfo}>
              <Text style={styles.toolName}>Clear App Cache</Text>
              <Text style={styles.toolDesc}>Free up space by removing temporary files</Text>
            </View>
            <Ionicons name="trash-outline" size={20} color={t.error} />
          </TouchableOpacity>

          {/* Manage Other Apps — open system app info to clear cache/storage */}
          <TouchableOpacity
            style={[styles.toolRow, styles.rowBorder]}
            onPress={() => navigation.navigate("AppManager")}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Manage other apps"
          >
            <View style={styles.toolIcon}><Text style={styles.toolIconText}>📱</Text></View>
            <View style={styles.toolInfo}>
              <Text style={styles.toolName}>Manage Other Apps</Text>
              <Text style={styles.toolDesc}>Clear cache & storage for other installed apps</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={t.textFaint} />
          </TouchableOpacity>

          {/* Reset App — double confirm */}
          <TouchableOpacity
            style={styles.toolRow}
            accessibilityRole="button"
            accessibilityLabel="Reset app"
            accessibilityHint="Double tap to erase all data and reset the app"
            onPress={() => {
              Alert.alert(
                "Reset FamilyHub?",
                "This will erase EVERYTHING:\n\n• All family members\n• All calendar connections\n• All to-do lists\n• All app settings\n\nThe app will return to its initial state.",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Continue", style: "destructive", onPress: () => {
                    Alert.alert(
                      "FINAL WARNING",
                      "ALL data will be permanently destroyed. This absolutely cannot be undone. Are you sure?",
                      [
                        { text: "Go Back", style: "cancel" },
                        { text: "Yes, Reset Everything", style: "destructive", onPress: async () => {
                          try {
                            const AS = require("@react-native-async-storage/async-storage").default;
                            await AS.clear();
                          } catch {}
                          Alert.alert("Done", "App has been reset. Please restart the app.");
                        }},
                      ]
                    );
                  }},
                ]
              );
            }}
            activeOpacity={0.7}
          >
            <View style={styles.toolIcon}><Text style={styles.toolIconText}>⚠️</Text></View>
            <View style={styles.toolInfo}>
              <Text style={styles.toolName}>Reset App</Text>
              <Text style={styles.toolDesc}>Erase ALL data and start completely fresh</Text>
            </View>
            <Ionicons name="trash-outline" size={20} color={t.error} />
          </TouchableOpacity>
        </View>

        {/* ── About ───────────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.card}>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>App Version</Text>
            <Text style={styles.aboutValue}>1.0.0</Text>
          </View>
          <View style={[styles.aboutRow, styles.rowBorder, { borderTopWidth: 1 }]}>
            <Text style={styles.aboutLabel}>Members</Text>
            <Text style={styles.aboutValue}>{members.length}</Text>
          </View>
          <View style={[styles.aboutRow, styles.rowBorder, { borderTopWidth: 1 }]}>
            <Text style={styles.aboutLabel}>Calendar Feeds</Text>
            <Text style={styles.aboutValue}>{feeds.length}</Text>
          </View>
        </View>

        </>)}

      </ScrollView>

      {/* ── Add Member Modal ─────────────────────────────────────── */}
      <Modal visible={showAddMember} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Family Member</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Name (e.g. Mom, Dad, Emma)"
              placeholderTextColor={t.textFaint}
              value={newMemberName}
              onChangeText={setNewMemberName}
              autoFocus
              accessibilityRole="text"
              accessibilityLabel="Member name"
            />

            <Text style={styles.modalLabel}>Role</Text>
            <View style={styles.typeRow}>
              <TouchableOpacity
                style={[styles.typeBtn, newMemberRole === "adult" && styles.typeBtnActive]}
                onPress={() => setNewMemberRole("adult")}
                accessibilityRole="button"
                accessibilityLabel="Adult role"
                accessibilityState={{ selected: newMemberRole === "adult" }}
              >
                <Ionicons name="person" size={16} color={newMemberRole === "adult" ? t.accent : t.textFaint} />
                <Text style={[styles.typeBtnText, newMemberRole === "adult" && styles.typeBtnTextActive]}>Adult</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, newMemberRole === "child" && styles.typeBtnActive]}
                onPress={() => { setNewMemberRole("child"); setNewMemberIsAdmin(false); }}
                accessibilityRole="button"
                accessibilityLabel="Child role"
                accessibilityState={{ selected: newMemberRole === "child" }}
              >
                <Ionicons name="happy" size={16} color={newMemberRole === "child" ? t.warning : t.textFaint} />
                <Text style={[styles.typeBtnText, newMemberRole === "child" && styles.typeBtnTextActive]}>Child</Text>
              </TouchableOpacity>
            </View>

            {newMemberRole === "adult" && (
              <View style={styles.adminRow}>
                <Text style={styles.modalLabel}>Admin</Text>
                <Switch
                  value={newMemberIsAdmin}
                  onValueChange={setNewMemberIsAdmin}
                  trackColor={{ false: t.cardBorder, true: "#c084fc55" }}
                  thumbColor={newMemberIsAdmin ? "#c084fc" : "#555"}
                  accessibilityRole="switch"
                  accessibilityLabel="Admin privileges"
                  accessibilityState={{ checked: newMemberIsAdmin }}
                />
              </View>
            )}

            <Text style={styles.modalLabel}>Color</Text>
            <View style={styles.colorGrid}>
              {MEMBER_COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorOption, { backgroundColor: c }, newMemberColor === c && styles.colorSelected]}
                  onPress={() => setNewMemberColor(c)}
                  accessibilityRole="button"
                  accessibilityLabel={`Color ${c}`}
                  accessibilityState={{ selected: newMemberColor === c }}
                />
              ))}
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowAddMember(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalCreateBtn}
                onPress={handleAddMember}
                accessibilityRole="button"
                accessibilityLabel="Add member"
              >
                <Text style={styles.modalCreateText}>Add Member</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Edit Member Modal ────────────────────────────────────── */}
      <Modal visible={!!editingMember} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Member</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Name"
              placeholderTextColor={t.textFaint}
              value={editName}
              onChangeText={setEditName}
              autoFocus
              accessibilityRole="text"
              accessibilityLabel="Member name"
            />

            <Text style={styles.modalLabel}>Role</Text>
            <View style={styles.typeRow}>
              <TouchableOpacity
                style={[styles.typeBtn, editRole === "adult" && styles.typeBtnActive]}
                onPress={() => setEditRole("adult")}
                accessibilityRole="button"
                accessibilityLabel="Adult role"
                accessibilityState={{ selected: editRole === "adult" }}
              >
                <Ionicons name="person" size={16} color={editRole === "adult" ? t.accent : t.textFaint} />
                <Text style={[styles.typeBtnText, editRole === "adult" && styles.typeBtnTextActive]}>Adult</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, editRole === "child" && styles.typeBtnActive]}
                onPress={() => { setEditRole("child"); setEditIsAdmin(false); }}
                accessibilityRole="button"
                accessibilityLabel="Child role"
                accessibilityState={{ selected: editRole === "child" }}
              >
                <Ionicons name="happy" size={16} color={editRole === "child" ? t.warning : t.textFaint} />
                <Text style={[styles.typeBtnText, editRole === "child" && styles.typeBtnTextActive]}>Child</Text>
              </TouchableOpacity>
            </View>

            {editRole === "adult" && (
              <View style={styles.adminRow}>
                <Text style={styles.modalLabel}>Admin</Text>
                <Switch
                  value={editIsAdmin}
                  onValueChange={setEditIsAdmin}
                  trackColor={{ false: t.cardBorder, true: "#c084fc55" }}
                  thumbColor={editIsAdmin ? "#c084fc" : "#555"}
                  accessibilityRole="switch"
                  accessibilityLabel="Admin privileges"
                  accessibilityState={{ checked: editIsAdmin }}
                />
              </View>
            )}

            {/* Account Assignment */}
            {(() => {
              const allEmails = [...new Set(feeds.filter(f => f.type === "gcal" && f.account).map(f => f.account!))];
              if (allEmails.length === 0) return null;
              const memberId = editingMember?.id;
              const assignedEmails = new Set(feeds.filter(f => f.type === "gcal" && f.memberId === memberId && f.account).map(f => f.account!));
              return (
                <>
                  <Text style={styles.modalLabel}>Google Account</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                    {allEmails.map(email => {
                      const isAssigned = assignedEmails.has(email);
                      return (
                        <TouchableOpacity
                          key={email}
                          style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: isAssigned ? t.accent : t.cardBorder, backgroundColor: isAssigned ? t.accent + "22" : "transparent" }}
                          onPress={() => {
                            if (!memberId) return;
                            const accountFeeds = feeds.filter(f => f.type === "gcal" && f.account === email);
                            for (const feed of accountFeeds) {
                              updateFeed(feed.id, { memberId: isAssigned ? null : memberId });
                            }
                          }}
                          accessibilityRole="checkbox"
                          accessibilityLabel={`Assign ${email}`}
                          accessibilityState={{ checked: isAssigned }}
                        >
                          <Ionicons name={isAssigned ? "checkmark-circle" : "ellipse-outline"} size={18} color={isAssigned ? t.accent : t.textFaint} />
                          <Text style={{ color: isAssigned ? t.accent : t.textSub, fontSize: 13, marginLeft: 6 }}>{email}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              );
            })()}

            <Text style={styles.modalLabel}>Color</Text>
            <View style={styles.colorGrid}>
              {MEMBER_COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorOption, { backgroundColor: c }, editColor === c && styles.colorSelected]}
                  onPress={() => setEditColor(c)}
                  accessibilityRole="button"
                  accessibilityLabel={`Color ${c}`}
                  accessibilityState={{ selected: editColor === c }}
                />
              ))}
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { backgroundColor: `${t.error}26` }]}
                onPress={() => {
                  if (!editingMember) return;
                  const memberToDelete = editingMember;
                  setEditingMember(null);
                  // Delay Alert so modal closes first, then show confirm
                  setTimeout(() => handleDeleteMember(memberToDelete), 300);
                }}
                accessibilityRole="button"
                accessibilityLabel="Delete member"
              >
                <Text style={[styles.modalCancelText, { color: t.error }]}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setEditingMember(null)}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalCreateBtn}
                onPress={handleEditMember}
                accessibilityRole="button"
                accessibilityLabel="Save member"
              >
                <Text style={styles.modalCreateText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Add Calendar Modal ───────────────────────────────────── */}
      <Modal visible={showAddCal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Calendar</Text>

            {/* Type selector */}
            <View style={styles.typeRow}>
              <TouchableOpacity
                style={[styles.typeBtn, calType === "gcal" && styles.typeBtnActive]}
                onPress={() => setCalType("gcal")}
                accessibilityRole="button"
                accessibilityLabel="Google Calendar"
                accessibilityState={{ selected: calType === "gcal" }}
              >
                <Ionicons name="logo-google" size={16} color={calType === "gcal" ? t.accent : t.textFaint} />
                <Text style={[styles.typeBtnText, calType === "gcal" && styles.typeBtnTextActive]}>Google Calendar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, calType === "apple" && styles.typeBtnActive]}
                onPress={() => setCalType("apple")}
                accessibilityRole="button"
                accessibilityLabel="Apple Calendar"
                accessibilityState={{ selected: calType === "apple" }}
              >
                <Ionicons name="logo-apple" size={16} color={calType === "apple" ? t.accent : t.textFaint} />
                <Text style={[styles.typeBtnText, calType === "apple" && styles.typeBtnTextActive]}>Apple</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, calType === "ical" && styles.typeBtnActive]}
                onPress={() => setCalType("ical")}
                accessibilityRole="button"
                accessibilityLabel="iCal Feed"
                accessibilityState={{ selected: calType === "ical" }}
              >
                <Ionicons name="globe-outline" size={16} color={calType === "ical" ? t.accent : t.textFaint} />
                <Text style={[styles.typeBtnText, calType === "ical" && styles.typeBtnTextActive]}>iCal Feed</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder={calType === "gcal" ? "Calendar name (optional)" : "Calendar name (e.g. Mom – Work)"}
              placeholderTextColor={t.textFaint}
              value={calName}
              onChangeText={setCalName}
              accessibilityRole="text"
              accessibilityLabel="Calendar name"
            />

            {calType === "gcal" ? (
              <TouchableOpacity
                style={[styles.modalInput, { justifyContent: "center", alignItems: "center", borderStyle: "dashed", flexDirection: "row", gap: 8 }]}
                onPress={handleAddCalendar}
                disabled={connectingGoogle || loadingCalList}
                accessibilityRole="button"
                accessibilityLabel={connectingGoogle ? "Connecting to Google" : loadingCalList ? "Loading calendars" : "Sign in to pick specific Google calendars"}
                accessibilityState={{ disabled: connectingGoogle || loadingCalList, busy: connectingGoogle || loadingCalList }}
              >
                {(connectingGoogle || loadingCalList) && <ActivityIndicator size="small" color={t.accent} />}
                <Ionicons name="logo-google" size={16} color={t.textSub} />
                <Text style={{ color: t.textSub, fontSize: 13, fontWeight: "600" }}>
                  {connectingGoogle ? "Connecting..." : loadingCalList ? "Loading calendars..." : "Sign in to pick specific calendars"}
                </Text>
              </TouchableOpacity>
            ) : (
              <>
                <TextInput
                  style={styles.modalInput}
                  placeholder={calType === "apple"
                    ? "iCloud calendar URL (webcal://p##-caldav.icloud.com/...)"
                    : "iCal URL (webcal:// or https://)"}
                  placeholderTextColor={t.textFaint}
                  value={calAccount}
                  onChangeText={setCalAccount}
                  keyboardType="url"
                  autoCapitalize="none"
                  accessibilityRole="text"
                  accessibilityLabel={calType === "apple" ? "iCloud calendar URL" : "iCal URL"}
                />
                {calType === "apple" && (
                  <Text style={{ color: t.textFaint, fontSize: 11, marginTop: 4, paddingHorizontal: 4 }}>
                    On iCloud.com, open Calendar, click Share next to your calendar, and copy the public URL.
                  </Text>
                )}
              </>
            )}

            {/* Assign to member */}
            <Text style={styles.modalLabel}>Assign to</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 16 }}>
              <View style={styles.assignRow}>
                <TouchableOpacity
                  style={[styles.assignChip, calMemberId === null && styles.assignChipActive]}
                  onPress={() => setCalMemberId(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Assign to Family"
                  accessibilityState={{ selected: calMemberId === null }}
                >
                  <Text style={[styles.assignText, calMemberId === null && styles.assignTextActive]}>Family</Text>
                </TouchableOpacity>
                {members.map(m => (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.assignChip, calMemberId === m.id && { backgroundColor: m.color + "22", borderColor: m.color + "55" }]}
                    onPress={() => setCalMemberId(m.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Assign to ${m.name}`}
                    accessibilityState={{ selected: calMemberId === m.id }}
                  >
                    <View style={[styles.assignDot, { backgroundColor: m.color }]} />
                    <Text style={[styles.assignText, calMemberId === m.id && { color: m.color }]}>{m.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Color */}
            <Text style={styles.modalLabel}>Color</Text>
            <View style={styles.colorGrid}>
              {MEMBER_COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorOption, { backgroundColor: c }, calColor === c && styles.colorSelected]}
                  onPress={() => setCalColor(c)}
                  accessibilityRole="button"
                  accessibilityLabel={`Color ${c}`}
                  accessibilityState={{ selected: calColor === c }}
                />
              ))}
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowAddCal(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalCreateBtn}
                onPress={handleAddCalendar}
                accessibilityRole="button"
                accessibilityLabel="Add calendar"
              >
                <Text style={styles.modalCreateText}>Add Calendar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Google Calendar Picker Modal ──────────────────────────── */}
      <Modal visible={showCalPicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: "80%" }]}>
            <Text style={styles.modalTitle}>Select Calendars</Text>
            <Text style={{ color: t.textSub, fontSize: 13, marginBottom: 12 }}>
              {gcalEmail} — {members.find(m => m.id === calMemberId)?.name || "Family"}
            </Text>

            {loadingCalList ? (
              <ActivityIndicator size="large" color={t.accent} style={{ marginVertical: 32 }} />
            ) : (
              <ScrollView style={{ flexGrow: 0, maxHeight: 340 }}>
                {gcalList.map(cal => {
                  const selected = gcalSelected.has(cal.id);
                  return (
                    <TouchableOpacity
                      key={cal.id}
                      style={{
                        flexDirection: "row", alignItems: "center", paddingVertical: 12,
                        paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: t.divider,
                      }}
                      onPress={() => toggleCalSelection(cal.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`${cal.summary}${cal.primary ? ", primary" : ""}`}
                      accessibilityState={{ selected }}
                    >
                      <Ionicons
                        name={selected ? "checkbox" : "square-outline"}
                        size={22}
                        color={selected ? (cal.backgroundColor || t.accent) : t.textFaint}
                      />
                      <View style={{
                        width: 12, height: 12, borderRadius: 6, marginLeft: 12,
                        backgroundColor: cal.backgroundColor || t.accent,
                      }} />
                      <View style={{ marginLeft: 10, flex: 1 }}>
                        <Text style={{ color: t.text, fontSize: 15 }}>
                          {cal.summary}{cal.primary ? " (Primary)" : ""}
                        </Text>
                        {cal.description ? (
                          <Text style={{ color: t.textSub, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                            {cal.description}
                          </Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => { setShowCalPicker(false); setShowAddCal(true); }}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <Text style={styles.modalCancelText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalCreateBtn, gcalSelected.size === 0 && { opacity: 0.4 }]}
                onPress={handleConfirmCalPicker}
                accessibilityRole="button"
                accessibilityLabel={gcalSelected.size > 0 ? `Add ${gcalSelected.size} calendar${gcalSelected.size > 1 ? "s" : ""}` : "Add calendar"}
              >
                <Text style={styles.modalCreateText}>
                  Add {gcalSelected.size > 0 ? `${gcalSelected.size} Calendar${gcalSelected.size > 1 ? "s" : ""}` : "Calendar"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* ── PIN Entry Modal (replaces iOS-only Alert.prompt) ── */}
      <Modal visible={pinModalMode !== null} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center" }}>
          <View style={{ backgroundColor: t.card, borderRadius: 16, padding: 24, width: 280, alignItems: "center" }}>
            <Text style={{ color: t.text, fontSize: 18, fontWeight: "bold", marginBottom: 4 }}>
              {pinModalMode === "verify-old" ? strings.pin.enterCurrent : pinModalMode === "enter-new" ? strings.pin.enterNew : strings.pin.enterPin}
            </Text>
            <Text style={{ color: t.textFaint, fontSize: 13, marginBottom: 16, textAlign: "center" }}>
              {pinModalMode === "verify-old" ? strings.pin.verifyCurrent : pinModalMode === "enter-new" ? strings.pin.chooseNew : strings.pin.requiredToExport}
            </Text>
            {/* Dot indicators */}
            <View style={{ flexDirection: "row", gap: 12, marginBottom: 20 }}>
              {[0, 1, 2, 3].map(i => (
                <View key={i} style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: i < pinModalEntry.length ? t.accent : t.textFaint + "33" }} />
              ))}
            </View>
            {/* Keypad */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, width: 220 }}>
              {["1","2","3","4","5","6","7","8","9","","0","<"].map((key) => (
                <TouchableOpacity
                  key={key || "empty"}
                  style={{ width: 64, height: 48, borderRadius: 8, backgroundColor: key ? (t.card === "#0f1729" ? "#1e293b" : "#1a2236") : "transparent", justifyContent: "center", alignItems: "center" }}
                  onPress={() => {
                    if (key === "<") { setPinModalEntry(pinModalEntry.slice(0, -1)); }
                    else if (key) { handlePinModalDigit(key); }
                  }}
                  disabled={!key}
                  accessibilityRole="button"
                  accessibilityLabel={key === "<" ? "Backspace" : key ? `Digit ${key}` : undefined}
                >
                  <Text style={{ color: t.text, fontSize: 22, fontWeight: "600" }}>
                    {key === "<" ? "⌫" : key}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Cancel button */}
            <TouchableOpacity
              onPress={() => { setPinModalMode(null); setPinModalEntry(""); }}
              style={{ marginTop: 16, paddingVertical: 8, paddingHorizontal: 24 }}
              accessibilityRole="button"
              accessibilityLabel="Cancel PIN entry"
            >
              <Text style={{ color: t.textFaint, fontSize: 15 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

function getStyles(t: Theme) {
  return StyleSheet.create({
    container:       { flex: 1, backgroundColor: t.bg },
    scroll:          { padding: 24, paddingBottom: 40 },

    header:          { fontSize: 28, fontWeight: "700", color: t.text, marginBottom: 24 },

    sectionHeader:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10, marginTop: 20 },
    sectionTitle:    { fontSize: 13, fontWeight: "600", color: t.textSub,
                       letterSpacing: 1, textTransform: "uppercase", marginBottom: 10, marginTop: 20 },
    sectionBtn:      { flexDirection: "row", alignItems: "center", gap: 4,
                       backgroundColor: t.accentBg, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
    sectionBtnText:  { fontSize: 13, fontWeight: "600", color: t.accent },

    card:            { backgroundColor: t.card, borderWidth: 1,
                       borderColor: t.cardBorder, borderRadius: 16, overflow: "hidden" },

    // Hub name
    hubNameRow:      { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
    hubNameText:     { flex: 1, fontSize: 17, fontWeight: "600", color: t.text },
    hubNameEditRow:  { flexDirection: "row", alignItems: "center", padding: 10, gap: 8 },
    hubNameInput:    { flex: 1, fontSize: 17, fontWeight: "600", color: t.text,
                       backgroundColor: t.input, borderRadius: 10,
                       paddingHorizontal: 14, paddingVertical: 10 },
    hubNameSaveBtn:  { padding: 8, backgroundColor: `${t.success}26`, borderRadius: 8 },
    hubNameCancelBtn:{ padding: 8 },

    // Member rows
    memberRow:       { flexDirection: "row", alignItems: "center", padding: 16 },
    rowBorder:       { borderBottomWidth: 1, borderBottomColor: t.cardBorder },
    memberLeft:      { flexDirection: "row", alignItems: "center", flex: 1, gap: 14 },
    avatar:          { width: 44, height: 44, borderRadius: 22, borderWidth: 2,
                       alignItems: "center", justifyContent: "center" },
    avatarText:      { fontSize: 16, fontWeight: "600" },
    memberInfo:      { flex: 1 },
    memberNameRow:   { flexDirection: "row", alignItems: "center", gap: 6 },
    memberName:      { fontSize: 16, fontWeight: "600", color: t.text },
    memberMeta:      { fontSize: 13, color: t.textSub, marginTop: 2 },
    enrollBtn:       { flexDirection: "row", alignItems: "center", gap: 6,
                       backgroundColor: t.accentBg, borderWidth: 1,
                       borderColor: `${t.accent}4D`, borderRadius: 10,
                       paddingHorizontal: 14, paddingVertical: 8 },
    enrollBtnText:   { fontSize: 13, fontWeight: "600", color: t.accent },

    // Feed rows
    feedRow:         { flexDirection: "row", alignItems: "center", padding: 14, gap: 10 },
    feedToggle:      { padding: 2 },
    feedDot:         { width: 10, height: 10, borderRadius: 5 },
    feedInfo:        { flex: 1 },
    feedName:        { fontSize: 15, fontWeight: "600", color: t.text },
    feedMeta:        { fontSize: 12, color: t.textSub, marginTop: 2 },
    feedDelete:      { padding: 14 },

    // Reconnect banner (Accounts tab)
    reconnectBanner: { flexDirection: "row", alignItems: "center", gap: 12,
                       backgroundColor: t.accentBg, borderWidth: 1,
                       borderColor: `${t.accent}4D`, borderRadius: 12,
                       paddingHorizontal: 14, paddingVertical: 12, marginTop: 8 },
    reconnectText:   { flex: 1 },
    reconnectTitle:  { fontSize: 15, fontWeight: "600", color: t.accent },
    reconnectSub:    { fontSize: 12, color: t.textSub, marginTop: 2 },

    // Tool rows
    toolRow:         { flexDirection: "row", alignItems: "center", padding: 16, gap: 14 },
    toolIcon:        { width: 44, height: 44, borderRadius: 12, backgroundColor: t.accentBg,
                       alignItems: "center", justifyContent: "center" },
    toolIconText:    { fontSize: 22 },
    toolInfo:        { flex: 1 },
    toolName:        { fontSize: 16, fontWeight: "600", color: t.text },
    toolDesc:        { fontSize: 13, color: t.textSub, marginTop: 2 },

    // About rows
    aboutRow:        { flexDirection: "row", justifyContent: "space-between",
                       alignItems: "center", padding: 16 },
    aboutLabel:      { fontSize: 15, color: t.textSub },
    aboutValue:      { fontSize: 15, color: t.text, fontWeight: "500" },

    // Empty
    emptyRow:        { padding: 24, alignItems: "center" },
    emptyText:       { fontSize: 14, color: t.textFaint },

    // Modals
    modalOverlay:    { flex: 1, backgroundColor: t.modalBd, justifyContent: "center", alignItems: "center", padding: 24 },
    modalCard:       { backgroundColor: t.modal, borderRadius: 20, padding: 24, width: "100%", maxWidth: 460 },
    modalTitle:      { fontSize: 20, fontWeight: "700", color: t.text, marginBottom: 20 },
    modalInput:      { fontSize: 16, color: t.text, backgroundColor: t.input,
                       borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16 },
    modalLabel:      { fontSize: 13, color: t.textSub, fontWeight: "600", marginBottom: 8,
                       letterSpacing: 1, textTransform: "uppercase" },
    colorGrid:       { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 24 },
    colorOption:     { width: 32, height: 32, borderRadius: 16 },
    colorSelected:   { borderWidth: 3, borderColor: t.textOnAccent },
    modalButtons:    { flexDirection: "row", gap: 12 },
    modalCancelBtn:  { flex: 1, backgroundColor: t.inputBorder, borderRadius: 12, padding: 14, alignItems: "center" },
    modalCancelText: { fontSize: 15, color: t.textSub, fontWeight: "600" },
    modalCreateBtn:  { flex: 1, backgroundColor: t.accent, borderRadius: 12, padding: 14, alignItems: "center" },
    modalCreateText: { fontSize: 15, color: t.textOnAccent, fontWeight: "600" },

    // Calendar type selector
    typeRow:         { flexDirection: "row", gap: 10, marginBottom: 16 },
    typeBtn:         { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                       backgroundColor: t.input, borderWidth: 1, borderColor: t.inputBorder,
                       borderRadius: 12, padding: 12 },
    typeBtnActive:   { backgroundColor: t.accentBg, borderColor: `${t.accent}4D` },
    typeBtnText:     { fontSize: 14, color: t.textSub, fontWeight: "500" },
    typeBtnTextActive:{ color: t.accent },

    // Assign to member
    assignRow:       { flexDirection: "row", gap: 8, paddingBottom: 4 },
    assignChip:      { flexDirection: "row", alignItems: "center", gap: 6,
                       backgroundColor: t.input, borderWidth: 1, borderColor: t.inputBorder,
                       borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
    assignChipActive:{ backgroundColor: t.accentBg, borderColor: `${t.accent}4D` },
    assignDot:       { width: 8, height: 8, borderRadius: 4 },
    assignText:      { fontSize: 13, color: t.textSub, fontWeight: "500" },
    assignTextActive:{ color: t.accent },

    roleBadge:       { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginLeft: 6 },
    roleBadgeText:   { fontSize: 10, fontWeight: "600" },
    adminRow:        { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  });
}
