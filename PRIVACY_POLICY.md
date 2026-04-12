# Privacy Policy — FamilyHub
**Last updated: April 11, 2026**
**Contact: familyhub@example.com**

## What Data We Collect

### Calendar Data
- Google Calendar events (synced via Google Calendar API)
- iCal/webcal feed events (fetched from URLs you provide)
- Manually created events within the app

### Task Data
- Google Tasks lists and items (synced via Google Tasks API)
- Locally created to-do lists and items

### Location Data
- Device GPS coordinates (used only for weather display)
- City/region name (derived from GPS for weather location label)

### Cleaning Data
- Cleaning log entries (what was cleaned, by whom, when, and notes)
- Stored entirely on-device

### Member Data
- Family member names, initials, colors, and roles
- Optional 4-digit hub PIN (stored locally, not transmitted)

## Where Data Is Stored

**All data is stored on-device only.** FamilyHub does not operate any cloud servers or databases.

- **Calendar/task/list data**: AsyncStorage (on-device, unencrypted local storage)
- **Google OAuth tokens**: Expo SecureStore (hardware-encrypted via Android Keystore)
- **Weather location**: AsyncStorage (latitude, longitude, city name)
- **Cleaning logs**: AsyncStorage (on-device)

## Third-Party Services

### Google Calendar API & Google Tasks API
- Used to read and write calendar events and tasks
- Data transmitted directly between your device and Google's servers
- Subject to [Google's Privacy Policy](https://policies.google.com/privacy)
- OAuth scopes requested:
  - `calendar.readonly` — read events
  - `calendar.events` — write/push events
  - `tasks.readonly` — read tasks
  - `tasks` — write tasks

### Open-Meteo Weather API
- Used to fetch current weather conditions
- Your device's GPS coordinates are sent to Open-Meteo to retrieve local weather
- Open-Meteo is a free, open-source API — [privacy info](https://open-meteo.com/en/terms)
- No API key or account required

### Expo Location
- Used to determine device GPS coordinates for weather display
- Location data is not transmitted to any server except Open-Meteo (for weather lookup)
- Location permission can be denied — weather will not display

## Data We Do NOT Collect
- No analytics or tracking
- No crash reporting (unless Sentry is added in the future)
- No advertising identifiers
- No data sold to third parties
- No cloud storage or server-side databases
- No biometric data (face recognition was removed)

## How to Delete Your Data
1. **Remove a family member**: Settings → tap member → Delete
2. **Clear all data**: Settings → Storage & Data → Reset App
3. **Revoke Google access**: Visit [Google Account Permissions](https://myaccount.google.com/permissions) and remove FamilyHub
4. **Uninstall the app**: All local data is permanently deleted

## Children's Privacy
FamilyHub supports child member profiles managed by adult administrators. The app does not independently collect data from children. All data is managed locally by the family.

## Changes to This Policy
We may update this privacy policy from time to time. The "Last updated" date at the top indicates the most recent revision.

## Contact
For privacy questions, contact: **familyhub@example.com**
