import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Share } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import QRCode from "react-native-qrcode-svg";
import { isDeviceActive, type PairingInvite } from "@familyhub/shared";
import { useAppStore } from "../store/appStore";
import { useTheme } from "../hooks/useTheme";
import type { Theme } from "../theme";
import {
  isRelayConfigured,
  isSharingSetUp,
  setupSharing,
  createPairingInvite,
  revokeDevice,
  resetSharing,
} from "../services/PairingService";

export default function PairingScreen() {
  const navigation = useNavigation<any>();
  const t = useTheme();
  const s = useMemo(() => getStyles(t), [t]);
  const household = useAppStore((st) => st.household);
  const devices = useAppStore((st) => st.pairedDevices);
  const hubName = useAppStore((st) => st.hubName);

  const [setup, setSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<PairingInvite | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const refreshingRef = useRef(false);
  const relayOk = isRelayConfigured();

  useEffect(() => {
    isSharingSetUp().then(setSetup);
  }, [household]);

  // Live countdown for the active invite; auto-refresh on expiry so the shown
  // QR/code is never stale (a stale token causes "Pairing failed" on the phone).
  useEffect(() => {
    if (!invite) {
      setRemainingMs(0);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      const left = invite.expiresAt - Date.now();
      if (left > 0) {
        setRemainingMs(left);
        return;
      }
      setRemainingMs(0);
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      try {
        const fresh = await createPairingInvite();
        if (!cancelled) setInvite(fresh);
      } catch {
        // Leave the expired code shown; the user can tap "Add a phone" again.
      } finally {
        refreshingRef.current = false;
      }
    };
    void tick();
    const iv = setInterval(() => void tick(), 1000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [invite]);

  const onSetup = useCallback(async () => {
    setBusy(true);
    try {
      await setupSharing(hubName);
      setSetup(true);
    } catch (e: any) {
      Alert.alert("Couldn't set up sharing", e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [hubName]);

  const onAddPhone = useCallback(async () => {
    setBusy(true);
    try {
      setInvite(await createPairingInvite());
    } catch (e: any) {
      Alert.alert("Couldn't create a pairing code", e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const onShareInvite = useCallback(async () => {
    if (!invite) return;
    try {
      // The invite payload contains the household keys — same data the QR
      // already shows openly. Offered only as a camera-free fallback; the user
      // should send it to their own phone over a trusted channel.
      await Share.share({ message: invite.qr });
    } catch {
      // User dismissed the share sheet.
    }
  }, [invite]);

  const onRevoke = useCallback((id: string, name: string) => {
    Alert.alert("Remove device?", `${name} will lose access to this hub.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => void revokeDevice(id).catch(() => {}) },
    ]);
  }, []);

  const onReset = useCallback(() => {
    Alert.alert(
      "Reset sharing?",
      "This unpairs all phones and clears this hub's sharing setup. You'll set it up again and re-pair phones.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            await resetSharing();
            setInvite(null);
            setSetup(false);
          },
        },
      ],
    );
  }, []);

  const companions = devices.filter((d) => d.role === "companion");

  return (
    <SafeAreaView style={s.root} edges={["top", "bottom"]}>
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={26} color={t.text} />
        </TouchableOpacity>
        <Text style={s.title}>Family Sharing</Text>
        <View style={s.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={s.body}>
        {!relayOk && (
          <View style={s.notice}>
            <Ionicons name="cloud-offline-outline" size={22} color={t.warning} />
            <Text style={s.noticeText}>
              Sharing needs a relay. Deploy relay-worker and set EXPO_PUBLIC_RELAY_URL, then rebuild.
            </Text>
          </View>
        )}

        <Text style={s.lead}>
          Let family members send messages and collaborative lists to this hub from their phones — over WiFi,
          cellular, or Bluetooth.
        </Text>

        {!setup ? (
          <TouchableOpacity
            style={[s.primaryBtn, (!relayOk || busy) && s.btnDisabled]}
            disabled={!relayOk || busy}
            onPress={onSetup}
            accessibilityRole="button"
            accessibilityLabel="Set up sharing"
          >
            {busy ? <ActivityIndicator color={t.textOnAccent} /> : <Text style={s.primaryBtnText}>Set up sharing</Text>}
          </TouchableOpacity>
        ) : (
          <>
            {invite ? (
              <View style={s.qrCard}>
                <Text style={s.qrHint}>Scan this in the Family Hub app on a phone</Text>
                <View style={s.qrBox}>
                  <QRCode value={invite.qr} size={220} />
                </View>
                <Text style={s.code}>Code: {invite.code}</Text>
                <Text style={s.codeSub}>
                  {remainingMs > 0 ? `Expires in ${fmtRemaining(remainingMs)}` : "Refreshing code…"}
                </Text>
                <TouchableOpacity
                  style={s.shareBtn}
                  onPress={() => void onShareInvite()}
                  accessibilityRole="button"
                  accessibilityLabel="Share invite for a phone that can't scan"
                >
                  <Ionicons name="share-outline" size={18} color={t.accent} />
                  <Text style={s.shareText}>Share invite (no camera)</Text>
                </TouchableOpacity>
                <Text style={s.shareCaveat}>Only send this to your own phone.</Text>
                <TouchableOpacity style={s.link} onPress={() => setInvite(null)}>
                  <Text style={s.linkText}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[s.primaryBtn, busy && s.btnDisabled]}
                disabled={busy}
                onPress={onAddPhone}
                accessibilityRole="button"
                accessibilityLabel="Add a phone"
              >
                {busy ? <ActivityIndicator color={t.textOnAccent} /> : <Text style={s.primaryBtnText}>+ Add a phone</Text>}
              </TouchableOpacity>
            )}

            <Text style={s.section}>Paired phones</Text>
            {companions.length === 0 ? (
              <Text style={s.empty}>No phones paired yet.</Text>
            ) : (
              companions.map((d) => (
                <View key={d.id} style={s.deviceRow}>
                  <Ionicons name="phone-portrait-outline" size={20} color={t.textSub} />
                  <Text style={[s.deviceName, !isDeviceActive(d) && s.revoked]}>
                    {d.name}
                    {!isDeviceActive(d) ? " (removed)" : ""}
                  </Text>
                  {isDeviceActive(d) && (
                    <TouchableOpacity
                      onPress={() => onRevoke(d.id, d.name)}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${d.name}`}
                    >
                      <Ionicons name="close-circle-outline" size={22} color={t.error} />
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
            <TouchableOpacity style={s.resetBtn} onPress={onReset} accessibilityRole="button" accessibilityLabel="Reset sharing">
              <Text style={s.resetText}>Reset sharing</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function fmtRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function getStyles(t: Theme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: t.divider,
    },
    title: { color: t.text, fontSize: 20, fontWeight: "700" },
    headerSpacer: { width: 26 },
    body: { padding: 20, gap: 16 },
    notice: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: t.accentBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.warning,
      padding: 12,
    },
    noticeText: { flex: 1, color: t.textSub, fontSize: 13, lineHeight: 18 },
    lead: { color: t.textSub, fontSize: 15, lineHeight: 21 },
    primaryBtn: {
      backgroundColor: t.accent,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: "center",
    },
    btnDisabled: { opacity: 0.5 },
    primaryBtnText: { color: t.textOnAccent, fontSize: 16, fontWeight: "700" },
    qrCard: {
      alignItems: "center",
      backgroundColor: t.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: t.cardBorder,
      padding: 20,
      gap: 10,
    },
    qrHint: { color: t.textSub, fontSize: 14, textAlign: "center" },
    qrBox: { backgroundColor: "#fff", padding: 14, borderRadius: 12 },
    code: { color: t.text, fontSize: 20, fontWeight: "800", letterSpacing: 2, marginTop: 4 },
    codeSub: { color: t.textFaint, fontSize: 12 },
    shareBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 8,
      paddingHorizontal: 16,
      marginTop: 6,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.cardBorder,
    },
    shareText: { color: t.accent, fontSize: 14, fontWeight: "600" },
    shareCaveat: { color: t.textFaint, fontSize: 11, textAlign: "center" },
    link: { paddingVertical: 8, paddingHorizontal: 24, marginTop: 4 },
    linkText: { color: t.accent, fontSize: 15, fontWeight: "600" },
    section: { color: t.text, fontSize: 16, fontWeight: "700", marginTop: 8 },
    empty: { color: t.textFaint, fontSize: 14 },
    deviceRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: t.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.cardBorder,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    deviceName: { flex: 1, color: t.text, fontSize: 15 },
    revoked: { color: t.textFaint, textDecorationLine: "line-through" },
    resetBtn: { marginTop: 24, alignSelf: "center", paddingVertical: 10, paddingHorizontal: 20 },
    resetText: { color: t.error, fontSize: 15, fontWeight: "600" },
  });
}
