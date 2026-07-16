import React, { useMemo } from "react";
import { View, Text, StyleSheet, Modal, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../store/appStore";
import { useTheme } from "../hooks/useTheme";
import type { Theme } from "../theme";

/**
 * Full-screen override for "alert" messages sent from a phone — mirrors the
 * dashboard lock overlay. Driven by store.activeAlertMessage; dismiss clears it.
 */
export default function AlertMessageOverlay() {
  const t = useTheme();
  const s = useMemo(() => getStyles(t), [t]);
  const alert = useAppStore((st) => st.activeAlertMessage);
  const dismiss = useAppStore((st) => st.dismissHubMessage);

  const close = () => {
    if (alert) dismiss(alert.id);
  };

  return (
    <Modal visible={!!alert} transparent animationType="fade" onRequestClose={close}>
      <View style={s.backdrop}>
        <View style={s.box}>
          <Ionicons name="alert-circle" size={44} color={t.error} />
          <Text style={s.title}>{alert?.title || "Alert"}</Text>
          <Text style={s.body}>{alert?.body}</Text>
          <Text style={s.meta}>From {alert?.from === "hub" ? "Family Hub" : alert?.from ?? ""}</Text>
          <TouchableOpacity style={s.btn} onPress={close} accessibilityRole="button" accessibilityLabel="Dismiss alert">
            <Text style={s.btnText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function getStyles(t: Theme) {
  return StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: t.modalBd,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    box: {
      backgroundColor: t.modal,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: t.error,
      padding: 28,
      alignItems: "center",
      maxWidth: 480,
      width: "100%",
    },
    title: { color: t.text, fontSize: 22, fontWeight: "800", marginTop: 12, textAlign: "center" },
    body: { color: t.textSub, fontSize: 17, lineHeight: 24, marginTop: 10, textAlign: "center" },
    meta: { color: t.textFaint, fontSize: 13, marginTop: 12 },
    btn: { marginTop: 22, backgroundColor: t.accent, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 40 },
    btnText: { color: t.textOnAccent, fontSize: 16, fontWeight: "700" },
  });
}
