import React, { useState, useEffect, useRef, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import type { Theme } from "../../theme";

export default function TimerWidget({ compact }: { compact?: boolean }) {
  const [totalSeconds, setTotalSeconds] = useState(300); // default 5 min
  const [remaining, setRemaining] = useState(300);
  const [running, setRunning] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editMin, setEditMin] = useState("5");
  const [editSec, setEditSec] = useState("00");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const t = useTheme();
  const s = useMemo(() => getStyles(t), [t]);

  useEffect(() => {
    if (running && remaining > 0) {
      intervalRef.current = setInterval(() => {
        setRemaining(r => {
          if (r <= 1) {
            setRunning(false);
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

  const handleSaveEdit = () => {
    const m = parseInt(editMin) || 0;
    const sec = parseInt(editSec) || 0;
    const total = m * 60 + sec;
    setTotalSeconds(total);
    setRemaining(total);
    setRunning(false);
    setEditing(false);
  };

  const color = remaining === 0 ? t.error : running ? t.success : t.accent;

  if (editing) {
    return (
      <View style={s.container}>
        <Text style={[s.label, compact && { fontSize: 12 }]}>Set Timer</Text>
        <View style={s.editRow}>
          <TextInput
            style={s.editInput}
            value={editMin}
            onChangeText={v => setEditMin(v.replace(/[^0-9]/g, ""))}
            keyboardType="number-pad"
            maxLength={3}
            placeholder="min"
            placeholderTextColor={t.textFaint}
          />
          <Text style={s.editSep}>:</Text>
          <TextInput
            style={s.editInput}
            value={editSec}
            onChangeText={v => setEditSec(v.replace(/[^0-9]/g, ""))}
            keyboardType="number-pad"
            maxLength={2}
            placeholder="sec"
            placeholderTextColor={t.textFaint}
          />
        </View>
        <View style={s.btnRow}>
          <TouchableOpacity style={s.cancelBtn} onPress={() => setEditing(false)}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.saveBtn} onPress={handleSaveEdit}>
            <Text style={s.saveText}>Set</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <Text style={[s.label, compact && { fontSize: 12 }]}>Timer</Text>
      <TouchableOpacity onPress={() => !running && setEditing(true)}>
        <Text style={[s.time, compact && { fontSize: 28 }, { color }]}>
          {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
        </Text>
      </TouchableOpacity>
      {remaining === 0 && <Text style={s.done}>Time's up!</Text>}
      {/* Progress bar */}
      <View style={s.progressBg}>
        <View style={[s.progressFill, { width: `${progress * 100}%`, backgroundColor: color }]} />
      </View>
      <View style={s.btnRow}>
        {!running ? (
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: t.success + "33" }]} onPress={handleStart}>
            <Ionicons name="play" size={compact ? 16 : 20} color={t.success} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: t.warning + "33" }]} onPress={handlePause}>
            <Ionicons name="pause" size={compact ? 16 : 20} color={t.warning} />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[s.actionBtn, { backgroundColor: t.toolbar }]} onPress={handleReset}>
          <Ionicons name="refresh" size={compact ? 16 : 20} color={t.textSub} />
        </TouchableOpacity>
        <TouchableOpacity style={[s.actionBtn, { backgroundColor: t.toolbar }]} onPress={() => setEditing(true)}>
          <Ionicons name="create-outline" size={compact ? 16 : 20} color={t.textSub} />
        </TouchableOpacity>
      </View>
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
    editRow:     { flexDirection: "row", alignItems: "center", gap: 6 },
    editInput:   { backgroundColor: t.input, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
                   fontSize: 20, fontWeight: "600", color: t.text, textAlign: "center", width: 60,
                   borderWidth: 1, borderColor: t.inputBorder },
    editSep:     { fontSize: 20, fontWeight: "600", color: t.textFaint },
    cancelBtn:   { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: t.toolbar },
    cancelText:  { fontSize: 13, fontWeight: "600", color: t.textSub },
    saveBtn:     { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: t.accent },
    saveText:    { fontSize: 13, fontWeight: "600", color: t.textOnAccent },
  });
}
