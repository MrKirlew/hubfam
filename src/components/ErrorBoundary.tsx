import React, { Component, ErrorInfo, ReactNode } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface Props {
  children: ReactNode;
  fallbackLabel?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

const MAX_AUTO_RETRIES = 2;
const AUTO_RETRY_DELAY = 3000;

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, retryCount: 0 };
  retryTimer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.log("[ErrorBoundary]", error.message);

    // Auto-retry: silently recover if under the retry limit
    if (this.state.retryCount < MAX_AUTO_RETRIES) {
      this.retryTimer = setTimeout(() => {
        this.setState(prev => ({
          hasError: false,
          error: null,
          retryCount: prev.retryCount + 1,
        }));
      }, AUTO_RETRY_DELAY);
    }
  }

  componentWillUnmount() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  handleManualRetry = () => {
    this.setState({ hasError: false, error: null, retryCount: 0 });
  };

  render() {
    if (this.state.hasError) {
      // During auto-retry countdown, show minimal loading state
      if (this.state.retryCount < MAX_AUTO_RETRIES) {
        return (
          <View style={s.container}>
            <Text style={s.retrying}>Recovering...</Text>
          </View>
        );
      }

      // Max retries exhausted — show manual retry
      return (
        <View style={s.container}>
          <Ionicons name="warning-outline" size={24} color="#f59e0b" />
          <Text style={s.title}>{this.props.fallbackLabel || "Something went wrong"}</Text>
          <Text style={s.detail} numberOfLines={2}>{this.state.error?.message}</Text>
          <TouchableOpacity
            style={s.retryBtn}
            onPress={this.handleManualRetry}
            accessibilityLabel="Retry loading this widget"
            accessibilityRole="button"
          >
            <Ionicons name="refresh" size={14} color="#60a5fa" />
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    gap: 6,
  },
  retrying: {
    fontSize: 12,
    color: "#94a3b8",
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
    color: "#f59e0b",
    textAlign: "center",
  },
  detail: {
    fontSize: 11,
    color: "#94a3b8",
    textAlign: "center",
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(96,165,250,0.15)",
    marginTop: 4,
  },
  retryText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#60a5fa",
  },
});
