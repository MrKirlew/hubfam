import React, { useState, useEffect, useRef, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Vibration } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { createAudioPlayer } from "expo-audio";
import { useTheme } from "../../hooks/useTheme";
import type { Theme } from "../../theme";
import ModalSheet from "../ModalSheet";
import strings from "../../i18n/strings";

export default function TimerWidget({ compact }: { compact?: boolean }) {
  const [totalSeconds, setTotalSeconds] = useState(300);
  const [remaining, setRemaining] = useState(300);
  const [running, setRunning] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editMin, setEditMin] = useState("5");
  const [editSec, setEditSec] = useState("00");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const t = useTheme();
  const s = useMemo(() => getStyles(t), [t]);

  const playTimerSound = async () => {
    try {
      Vibration.vibrate([0, 300, 200, 300, 200, 300]);
      const player = createAudioPlayer(require("../../assets/sounds/alert.mp3"));
      player.play();
      setTimeout(() => { try { player.remove(); } catch {} }, 5000);
    } catch (err) {
      console.log("[Timer] Sound failed:", err);
    }
  };

  useEffect(() => {
    if (running && remaining > 0) {
      intervalRef.current = setInterval(() => {
        setRemaining(r => {
          if (r <= 1) {
            setRunning(false);
            playTimerSound();
            return 0;
          }
          return r - 1;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, remaining]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const progress = totalSeconds > 0 ? remaining / totalSeconds : 0;

  const handleStart = () => setRunning(true);
  const handlePause = () => setRunning(false);
  const handleReset = () => { setRunning(false); setRemaining(totalSeconds); };

  const openEdit = () => {
    setEditMin(String(Math.floor(totalSeconds / 60)));
    setEditSec(String(totalSeconds % 60).padStart(2, "0"));
    setShowEdit(true);
  };

  const handleSaveEdit = () => {
    const m = parseInt(editMin) || 0;
    const sec = parseInt(editSec) || 0;
    const total = m * 60 + sec;
    setTotalSeconds(total);
    setRemaining(total);
    setRunning(false);
    setShowEdit(false);
  };

  const color = remaining === 0 ? t.error : running ? t.success : t.accent;

  return (
    <View style={s.container} accessibilityLiveRegion="polite">
      <Text style={[s.label, compact && { fontSize: 12 }]}>{strings.widgets.timer}</Text>
      <TouchableOpacity onPress={() => !running && openEdit()} accessibilityRole="button" accessibilityLabel={`Timer: ${mins} minutes ${secs} seconds${remaining === 0 ? ", finished" : ""}`} accessibilityHint={running ? undefined : "Tap to edit timer"} accessibilityState={{ busy: running }}>
        <Text style={[s.time, compact && { fontSize: 28 }, { color }]}>
          {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
        </Text>
      </TouchableOpacity>
      {remaining === 0 && <Text style={s.done}>{strings.widgets.timesUp}</Text>}
      <View style={s.progressBg}>
        <View style={[s.progressFill, { width: `${progress * 100}%`, backgroundColor: color }]} />
      </View>
      <View style={s.btnRow}>
        {!running ? (
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: t.success + "33" }]} onPress={handleStart} accessibilityRole="button" accessibilityLabel="Play timer">
            <Ionicons name="play" size={compact ? 16 : 20} color={t.success} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: t.warning + "33" }]} onPress={handlePause} accessibilityRole="button" accessibilityLabel="Pause timer">
            <Ionicons name="pause" size={compact ? 16 : 20} color={t.warning} />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[s.actionBtn, { backgroundColor: t.toolbar }]} onPress={handleReset} accessibilityRole="button" accessibilityLabel="Reset timer">
          <Ionicons name="refresh" size={compact ? 16 : 20} color={t.textSub} />
        </TouchableOpacity>
        <TouchableOpacity style={[s.actionBtn, { backgroundColor: t.toolbar }]} onPress={openEdit} accessibilityRole="button" accessibilityLabel="Edit timer duration">
          <Ionicons name="create-outline" size={compact ? 16 : 20} color={t.textSub} />
        </TouchableOpacity>
      </View>

      {/* Edit timer modal — keyboard-safe */}
      <ModalSheet visible={showEdit} onClose={() => setShowEdit(false)} maxWidth={320}>
        <Text style={s.editTitle}>{strings.widgets.setTimer}</Text>
        <View style={s.editRow}>
          <View style={s.editField}>
            <TextInput
              style={s.editInput}
              value={editMin}
              onChangeText={v => setEditMin(v.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              maxLength={3}
              autoFocus
              accessibilityLabel="Minutes"
            />
            <Text style={s.editLabel}>min</Text>
          </View>
          <Text style={s.editSep}>:</Text>
          <View style={s.editField}>
            <TextInput
              style={s.editInput}
              value={editSec}
              onChangeText={v => setEditSec(v.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              maxLength={2}
              accessibilityLabel="Seconds"
            />
            <Text style={s.editLabel}>sec</Text>
          </View>
        </View>
        <View style={s.editActions}>
          <TouchableOpacity style={s.cancelBtn} onPress={() => setShowEdit(false)} accessibilityRole="button" accessibilityLabel="Cancel">
            <Text style={s.cancelText}>{strings.cancel}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.saveBtn} onPress={handleSaveEdit} accessibilityRole="button" accessibilityLabel="Set timer">
            <Ionicons name="timer-outline" size={16} color={t.textOnAccent} />
            <Text style={s.saveText}>{strings.widgets.setTimer}</Text>
          </TouchableOpacity>
        </View>
      </ModalSheet>
    </View>
  );
}

function getStyles(t: Theme) {
  return StyleSheet.create({
    container:   { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
    label:       { fontSize: 14, fontWeight: "600", color: t.textSub },
    time:        { fontSize: 40, fontWeight: "700", letterSpacing: -1 },
    done:        { fontSize: 12, fontWeight: "600", color: t.error },
    progressBg:  { width: "80%", height: 4, backgroundColor: t.cardBorder, borderRadius: 2, overflow: "hidden" },
    progressFill:{ height: 4, borderRadius: 2 },
    btnRow:      { flexDirection: "row", gap: 12 },
    actionBtn:   { padding: 10, borderRadius: 12 },
    editTitle:   { fontSize: 16, fontWeight: "700", color: t.text, textAlign: "center", marginBottom: 16 },
    editRow:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
    editField:   { alignItems: "center", gap: 4 },
    editInput:   { backgroundColor: t.input, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12,
                   fontSize: 24, fontWeight: "700", color: t.text, textAlign: "center", width: 80,
                   borderWidth: 1, borderColor: t.inputBorder },
    editLabel:   { fontSize: 11, color: t.textFaint },
    editSep:     { fontSize: 24, fontWeight: "700", color: t.textFaint },
    editActions: { flexDirection: "row", gap: 10, marginTop: 20 },
    cancelBtn:   { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: t.input },
    cancelText:  { fontSize: 14, fontWeight: "600", color: t.textSub },
    saveBtn:     { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center",
                   flexDirection: "row", justifyContent: "center", gap: 6, backgroundColor: t.accent },
    saveText:    { fontSize: 14, fontWeight: "600", color: t.textOnAccent },
  });
}
