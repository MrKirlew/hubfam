# SECURITY_AUDIT.md — FamilyHub
# Owner: Riley · Last audit: 2026-04-11
# ============================================================

## AUDIT RESULTS — 2026-04-11

### Data Handling
- [x] No API keys or client IDs in source code — all via `process.env.EXPO_PUBLIC_*`
- [x] Google OAuth tokens stored in SecureStore (hardware-encrypted) — not AsyncStorage
- [x] Token key format: `google_refresh_token_{sanitized_email}`
- [x] No sensitive data in AsyncStorage (only calendar cache, app state, lists)
- [x] Hub PIN stored in AsyncStorage (acceptable — not a high-security credential)
- [x] Weather API (Open-Meteo) requires no API key — public endpoint

### Network
- [x] All Google API calls use HTTPS
- [x] Tokens sent in Authorization header — never in URL params
- [x] Weather API uses HTTPS (api.open-meteo.com)
- [x] Geocoding API uses HTTPS (geocoding-api.open-meteo.com)
- [ ] Certificate pinning not implemented (backlog — low priority for family app)

### Credentials
- [x] `.env` contains: EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID, EXPO_PUBLIC_GOOGLE_CLIENT_SECRET
- [x] `.env` is in `.gitignore`
- [x] No credentials in PROJECT_SUMMARY or CLAUDE.md
- [x] Client secret used only for token exchange (server-side pattern in client — acceptable for installed apps)

### Permissions (Android)
- [x] READ_CALENDAR — justified (calendar sync)
- [x] WRITE_CALENDAR — justified (two-way push)
- [x] ACCESS_COARSE_LOCATION — justified (weather)
- [x] ACCESS_FINE_LOCATION — justified (weather precision)
- [x] SCHEDULE_EXACT_ALARM — justified (alarm schedules)
- [x] WAKE_LOCK — justified (keep-awake for wall mount)
- [x] RECEIVE_BOOT_COMPLETED — justified (auto-start on tablet boot)
- [x] VIBRATE — justified (notifications)

### Console Logging
- 29 console.log/warn/error calls in production code
- All are diagnostic logs (service errors, sync status)
- [x] No sensitive data logged (no tokens, no PINs, no credentials)
- [ ] Should be stripped in production build via Babel plugin (backlog)

### Error Handling
- [x] Weather fetch: try/catch with fallback
- [x] Google token exchange: try/catch with error logging
- [x] Calendar sync: try/catch per feed
- [x] Location permission: graceful denial handling
- [x] SecureStore: accessed via try/catch in CalendarSyncService

### Known Issues
| Issue | Severity | Status |
|-------|----------|--------|
| Console logs not stripped in prod | LOW | Backlog |
| Certificate pinning not implemented | LOW | Backlog |
| Google Tasks write audit incomplete | MEDIUM | Issue 029 |
| Privacy policy needs location update | MEDIUM | Issue 030 |

### Verdict
**✅ PASS** — No critical security vulnerabilities found. All credentials properly stored. No data leakage in logs or storage. Permissions justified.
