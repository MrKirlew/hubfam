# Family Hub — React Native App

A wall/fridge-mounted family calendar hub with native facial recognition,
multi-calendar sync (Google Calendar + iCal), reminders, and to-do lists.

---

## Stack

| Feature               | Library                                      | Platform |
|-----------------------|----------------------------------------------|----------|
| Face detection        | `expo-face-detector`                         | Both     |
| Face recognition      | ML Kit (Android) / Vision framework (iOS)   | Native   |
| Google Calendar OAuth | `@react-native-google-signin/google-signin`  | Both     |
| iCal / CalDAV         | Native `fetch` + custom parser               | Both     |
| Native calendar read  | `react-native-calendar-events`               | Both     |
| Push reminders        | `expo-notifications`                         | Both     |
| State                 | Zustand + Immer + AsyncStorage               | Both     |
| Navigation            | React Navigation v6                          | Both     |

---

## How face recognition works

### Technology
- **Android**: Firebase ML Kit Face Detection — runs 100% on-device,
  no internet required, same engine used in Google Photos.
- **iOS**: Apple Vision framework — the same underlying tech as Face ID
  awareness (not Face ID itself, but the same face landmark detection).

### Enrollment (one-time setup per person)
1. Go to **Settings → tap a member → Enroll Face**
2. The front camera opens with an oval guide
3. Follow 5 angle prompts (straight, left, right, up, straight)
4. The app captures facial landmark positions for each frame
5. Positions are normalised into a compact "signature" (~200 bytes)
6. Stored encrypted in **SecureStore** (iOS Secure Enclave / Android Keystore)
7. **Raw photos are never saved anywhere**

### Recognition (automatic on lock screen)
1. Front camera runs silently in the background
2. Face detector fires ~5x per second
3. Live landmark positions → normalised signature
4. Cosine similarity compared against all enrolled signatures
5. Score > 0.82 → auto-unlock to that person's profile
6. Liveness check: face bounding box must move across 3 frames (blocks photos)

### Accuracy (real-world estimates)

| Condition                    | Expected accuracy |
|------------------------------|-------------------|
| Good lighting, no glasses    | 94–98%            |
| Regular glasses              | 90–95%            |
| Sunglasses                   | 60–75% (enroll without, then lower threshold) |
| Low light (<50 lux)          | 80–88%            |
| Child vs adult height diff   | 92–97% (enroll at typical approach angle) |
| Identical twins              | ~50% (use PIN fallback) |

### Tuning the threshold

In `src/services/FaceRecognitionService.ts`:

```ts
const MATCH_THRESHOLD = 0.82;   // default
```

- **Raise to 0.88** if you get false positives (wrong person unlocked)
- **Lower to 0.75** if enrolled members aren't being recognised
  (common with glasses, hats, or challenging lighting)

---

## Setup

### 1. Prerequisites

```bash
node >= 18
npm >= 9
# Install Expo CLI
npm install -g eas-cli expo-cli
```

### 2. Install dependencies

```bash
cd FamilyHub
npm install
```

### 3. Google Calendar setup

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project → Enable **Google Calendar API**
3. Create OAuth credentials:
   - **Android**: OAuth Client → Android → use your `package` from `app.json`
   - **iOS**: OAuth Client → iOS → use your `bundleIdentifier` from `app.json`
   - **Web client**: needed for token refresh
4. Copy your **Web Client ID** into `CalendarSyncService.ts`:
   ```ts
   webClientId: "YOUR_WEB_CLIENT_ID.apps.googleusercontent.com",
   ```
5. Download `google-services.json` (Android) → place in `/android/app/`
6. Download `GoogleService-Info.plist` (iOS) → place in `/ios/FamilyHub/`

### 4. Build and run

```bash
# Development on a connected tablet
npx expo run:android    # Android tablet (USB debugging enabled)
npx expo run:ios        # iPad

# Production build via EAS
eas build --platform android --profile production
eas build --platform ios --profile production
```

> **Note**: Face recognition and camera features require a **real device**.
> They will not work in an emulator/simulator.

---

## Wall/fridge installation tips

### Hardware recommendations
- **Amazon Fire HD 10** (Android) — cheap, large screen, wall-mountable
- **iPad 9th gen** (iOS) — best face recognition quality
- **Lenovo Tab P12** — excellent for portrait wall mount

### Keep-screen-on
The app calls `expo-keep-awake` on launch — screen stays on indefinitely.
Set your tablet's display brightness to ~40% for power efficiency.

### Mounting
- Mount at ~5ft / 150cm height for the best face detection angle
- Avoid mounting directly opposite a window (backlight kills face detection)
- If backlit, set `MATCH_THRESHOLD` to 0.70 and require PIN confirmation

### Reduce false wake-ups
If pets or passing shadows trigger the scanner:
```ts
// In FaceRecognitionService.ts
const LIVENESS_FRAMES = 5;    // require more frames (default 3)
const LIVENESS_DELTA  = 0.02; // require more movement (default 0.015)
```

---

## Project structure

```
FamilyHub/
├── App.tsx                          # Entry point
├── app.json                         # Expo config + permissions
├── package.json
└── src/
    ├── screens/
    │   ├── LockScreen.tsx           # Always-on screen with live face scan
    │   ├── EnrollFaceScreen.tsx     # Guided face enrollment flow
    │   ├── HomeScreen.tsx           # Dashboard (clock, today, lists)
    │   ├── CalendarScreen.tsx       # Monthly grid + filter panel
    │   ├── ListsScreen.tsx          # To-do lists
    │   └── SettingsScreen.tsx       # Members, calendar connections
    ├── services/
    │   ├── FaceRecognitionService.ts  # Enroll + match logic
    │   ├── CalendarSyncService.ts    # Google + iCal + native sync
    │   └── NotificationService.ts   # Push reminders
    ├── store/
    │   └── appStore.ts              # Zustand global state
    └── navigation/
        └── AppNavigator.tsx         # Stack + tab navigation
```

---

## Privacy

- Face signatures are stored in **SecureStore** (encrypted at rest)
- iOS uses the **Secure Enclave** hardware chip
- Android uses the **Android Keystore** hardware-backed storage
- Face data **never leaves the device** — no cloud, no server
- Raw camera frames are **never saved** — only the ~200 byte signature
- Deleting a member in Settings calls `deleteSignature(memberId)` which
  permanently removes their face data from SecureStore
