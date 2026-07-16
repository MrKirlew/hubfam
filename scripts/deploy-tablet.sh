#!/usr/bin/env bash
#
# deploy-tablet.sh — rebuild the standalone release APK and (re)install it on the
# wall-mounted hub tablet over wireless adb. Run this after code changes to keep
# the tablet on the latest build. Data + default-launcher status are preserved
# (install -r replace, same debug-keystore signature).
#
#   ./scripts/deploy-tablet.sh                 # uses the default tablet address
#   TABLET=192.168.1.241:41613 ./scripts/deploy-tablet.sh   # override address
#
set -euo pipefail

TABLET="${TABLET:-192.168.1.241:41613}"
PKG="com.familyhub.app"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APK="$ROOT/android/app/build/outputs/apk/release/app-release.apk"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
ADB="$ANDROID_HOME/platform-tools/adb"

echo "▸ Connecting to tablet $TABLET ..."
"$ADB" connect "$TABLET" >/dev/null 2>&1 || true
if [ "$("$ADB" -s "$TABLET" get-state 2>/dev/null)" != "device" ]; then
  echo "✗ Tablet not reachable at $TABLET."
  echo "  On the tablet: Settings → Developer options → Wireless debugging → ON,"
  echo "  then re-pair if needed. Its IP:port can change after a reboot — pass a new"
  echo "  one with:  TABLET=<ip:port> ./scripts/deploy-tablet.sh"
  exit 1
fi

echo "▸ Building release APK (a few minutes) ..."
ANDROID_HOME="$ANDROID_HOME" "$ROOT/android/gradlew" \
  -p "$ROOT/android" :app:assembleRelease --console=plain

echo "▸ Installing to tablet ..."
"$ADB" -s "$TABLET" install -r -d "$APK"

echo "▸ Relaunching FamilyHub ..."
"$ADB" -s "$TABLET" shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true

echo "✓ Tablet updated to the latest build ($(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo '?'))."
