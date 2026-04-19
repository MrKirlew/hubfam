/**
 * ModalSheet — Reusable modal wrapper with keyboard avoidance.
 * Ensures modal content is never hidden behind the keyboard in any orientation.
 * Uses ScrollView so content is always accessible even on small screens.
 */
import React from "react";
import {
  Modal, View, TouchableOpacity, KeyboardAvoidingView,
  ScrollView, Platform, StyleSheet,
} from "react-native";
import { useTheme } from "../hooks/useTheme";

interface Props {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: number;
}

export default function ModalSheet({ visible, onClose, children, maxWidth = 440 }: Props) {
  const t = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} accessibilityViewIsModal={true}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close modal">
          <View
            style={[styles.sheet, { maxWidth, backgroundColor: t.modal, borderColor: t.cardBorder }]}
            onStartShouldSetResponder={() => true}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {children}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex:     { flex: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,.55)", justifyContent: "center", alignItems: "center" },
  sheet:    { width: "85%", borderRadius: 16, padding: 20, borderWidth: 1, maxHeight: "80%" },
});
