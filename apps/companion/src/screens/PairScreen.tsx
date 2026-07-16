import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useCompanionStore } from "../store/companionStore";
import { pairFromQR } from "../services/PairingService";

export default function PairScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const memberName = useCompanionStore((s) => s.memberName);
  const setMemberName = useCompanionStore((s) => s.setMemberName);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);

  const onScanned = useCallback(
    async ({ data }: { data: string }) => {
      if (busy) return;
      setBusy(true);
      setScanning(false);
      try {
        await pairFromQR(data, memberName || "Me");
        // store.paired flips -> App switches to HomeScreen
      } catch (e: any) {
        Alert.alert("Pairing failed", e?.message ?? String(e));
        setBusy(false);
      }
    },
    [busy, memberName],
  );

  const startScan = useCallback(async () => {
    if (!permission?.granted) {
      const r = await requestPermission();
      if (!r.granted) {
        Alert.alert("Camera needed", "Allow camera access to scan the hub's pairing QR.");
        return;
      }
    }
    setScanning(true);
  }, [permission, requestPermission]);

  if (scanning) {
    return (
      <View style={styles.cameraWrap}>
        <CameraView
          style={StyleSheet.absoluteFill}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={onScanned}
        />
        <SafeAreaView style={styles.cameraOverlay}>
          <Text style={styles.scanHint}>Point at the hub&apos;s pairing QR</Text>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setScanning(false)}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </SafeAreaView>
        {busy && (
          <View style={styles.busyOverlay}>
            <ActivityIndicator color="#fff" size="large" />
          </View>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.body}>
        <Text style={styles.logo}>Family Hub Remote</Text>
        <Text style={styles.lead}>Pair with your family&apos;s hub to send messages and lists to it — over WiFi, cellular, or Bluetooth.</Text>
        <Text style={styles.label}>Your name</Text>
        <TextInput
          style={styles.input}
          value={memberName}
          onChangeText={setMemberName}
          placeholder="e.g. Mum"
          placeholderTextColor="#5b6478"
        />
        <TouchableOpacity style={styles.primaryBtn} onPress={startScan} accessibilityRole="button" accessibilityLabel="Scan pairing QR">
          <Text style={styles.primaryBtnText}>Scan pairing QR</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>On the hub: Settings → Family Sharing → Add a phone.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#080c18" },
  body: { flex: 1, padding: 24, justifyContent: "center", gap: 14 },
  logo: { color: "#e8eeff", fontSize: 28, fontWeight: "800", textAlign: "center" },
  lead: { color: "rgba(232,238,255,.6)", fontSize: 16, lineHeight: 22, textAlign: "center", marginBottom: 8 },
  label: { color: "rgba(232,238,255,.6)", fontSize: 13, marginTop: 8 },
  input: {
    backgroundColor: "rgba(255,255,255,.06)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.08)",
    color: "#e8eeff",
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  primaryBtn: { backgroundColor: "#60a5fa", borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 10 },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  hint: { color: "rgba(232,238,255,.5)", fontSize: 13, textAlign: "center", marginTop: 6 },
  cameraWrap: { flex: 1, backgroundColor: "#000" },
  cameraOverlay: { flex: 1, alignItems: "center", justifyContent: "space-between", paddingVertical: 40 },
  scanHint: { color: "#fff", fontSize: 17, fontWeight: "600", backgroundColor: "rgba(0,0,0,.5)", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  cancelBtn: { backgroundColor: "rgba(0,0,0,.6)", paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
  cancelText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  busyOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,.5)" },
});
