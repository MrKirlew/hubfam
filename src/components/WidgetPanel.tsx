import React, { useState, useMemo } from "react";
import { View, StyleSheet, TouchableOpacity, LayoutChangeEvent, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { WidgetConfig } from "../store/appStore";
import { useTheme } from "../hooks/useTheme";
import type { Theme } from "../theme";
import ErrorBoundary from "./ErrorBoundary";
import ClockWidget from "./widgets/ClockWidget";
import CalendarWidget from "./widgets/CalendarWidget";
import TodoListWidget from "./widgets/TodoListWidget";
import DailyTasksWidget from "./widgets/DailyTasksWidget";
import WeeklyTasksWidget from "./widgets/WeeklyTasksWidget";
import CalendarListWidget from "./widgets/CalendarListWidget";
import CleaningWidget from "./widgets/CleaningWidget";
import MonthCalendarWidget from "./widgets/MonthCalendarWidget";
import TimerWidget from "./widgets/TimerWidget";
import MessageBoardWidget from "./widgets/MessageBoardWidget";

interface Props {
  config: WidgetConfig;
  onConfigure: () => void;
  onClose?: () => void;
  compact?: boolean;
}

export default function WidgetPanel({ config, onConfigure, onClose, compact: compactProp }: Props) {
  const [size, setSize] = useState({ w: 400, h: 300 });

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
  };

  const isCompact = compactProp || size.w < 300 || size.h < 200;
  const t = useTheme();
  const s = useMemo(() => getStyles(t), [t]);

  const renderWidget = () => {
    switch (config.type) {
      case "calendar-today":
      case "calendar-tomorrow":
      case "calendar-date":
        return <CalendarWidget config={config} compact={isCompact} />;
      case "todo-list":
        return <TodoListWidget config={config} />;
      case "calendar-list":
        return <CalendarListWidget config={config} />;
      case "cleaning":
        return <CleaningWidget compact={isCompact} />;
      case "month-calendar":
        return <MonthCalendarWidget config={config} compact={isCompact} />;
      case "daily-tasks":
        return <DailyTasksWidget compact={isCompact} />;
      case "weekly-tasks":
        return <WeeklyTasksWidget compact={isCompact} />;
      case "timer":
        return <TimerWidget compact={isCompact} />;
      case "message-board":
        return <MessageBoardWidget />;
      case "clock":
      default:
        return <ClockWidget compact={isCompact} />;
    }
  };

  return (
    <View style={s.panel} onLayout={handleLayout}>
      {/* Header row with close + edit buttons */}
      <View style={s.headerRow}>
        {onClose && (
          <TouchableOpacity
            style={s.closeBtn}
            onPress={onClose}
            activeOpacity={0.6}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={`Close ${config.type} widget`}
          >
            <Ionicons name="close" size={12} color={t.textFaint} />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={s.configBtn}
          onPress={onConfigure}
          activeOpacity={0.6}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={`Configure ${config.type} widget`}
        >
          <Ionicons name="pencil-outline" size={14} color={t.accent} />
        </TouchableOpacity>
      </View>
      <View style={s.content}>
        <ErrorBoundary fallbackLabel={`${config.type} widget error`}>
          {renderWidget()}
        </ErrorBoundary>
      </View>
    </View>
  );
}

function getStyles(t: Theme) {
  return StyleSheet.create({
    panel: {
      flex: 1,
      backgroundColor: t.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: t.cardBorder,
      padding: 10,
      margin: 3,
      ...((!t.isDark && Platform.OS === "android") ? { elevation: 2 } : {}),
      ...((!t.isDark && Platform.OS === "ios") ? {
        shadowColor: t.shadow.color,
        shadowOpacity: t.shadow.opacity,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      } : {}),
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 2,
      minHeight: 18,
    },
    configBtn: {
      padding: 4,
      borderRadius: 8,
      backgroundColor: t.accentBg,
      borderWidth: 1,
      borderColor: t.accent + "33",
    },
    closeBtn: {
      padding: 3,
      borderRadius: 6,
      backgroundColor: t.toolbar,
    },
    content: {
      flex: 1,
    },
  });
}
