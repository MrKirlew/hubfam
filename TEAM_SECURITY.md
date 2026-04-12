# TEAM_SECURITY.md — Security, Privacy & Compliance
# FamilyHub · Read on startup after CLAUDE.md
# Owner: Riley · Signed off on every release
# ============================================================

## SECURITY PRINCIPLES

FamilyHub handles sensitive data:
1. **Calendar/task data** — personal schedules, Google tokens, iCal URLs
2. **Member PINs** — stored locally for lock screen access control

These require protection. One breach ends the product.
Privacy is not a feature — it is the foundation of user trust.

---

## GOOGLE OAUTH TOKEN RULES

- ✅ Access tokens stored in SecureStore only
- ✅ Key format: sanitised email (@ → _at_, dots → _dot_)
  e.g. `mom@gmail.com` → `google_token_mom_at_gmail_com`
- ✅ Auto-refresh on 401 response — silent, never a crash
- ❌ NEVER log tokens, even partial
- ❌ NEVER include tokens in URLs (use Authorization header)
- ❌ NEVER store tokens in AsyncStorage
- ❌ NEVER commit tokens or client IDs to source code
- Client IDs live in .env only → reference via EAS Secrets in CI

### OAuth Scopes — minimum required
```
calendar.readonly          ← read events
calendar.events            ← write/push events (two-way sync)
tasks.readonly             ← read tasks
tasks                      ← write tasks (two-way sync)
```
Do not request broader scopes than above. Riley reviews any scope addition.

---

## CREDENTIALS POLICY

- All secrets (client IDs, API keys, tokens) live in `.env`
- `.env` is in `.gitignore` — never committed
- EAS Secrets used for CI/CD builds
- PROJECT_SUMMARY files reference env var names only:
  - ✅ `EAS_GOOGLE_WEB_CLIENT_ID`
  - ❌ `348848169100-t9k78...apps.googleusercontent.com`
- Riley flags any credential found outside `.env` immediately

---

## SECURITY CHECKLIST — run before every release

### Data Handling
- [ ] No API keys or client IDs in source code or markdown files
- [ ] No face data in AsyncStorage (SecureStore only)
- [ ] Google OAuth tokens in SecureStore, not logged anywhere
- [ ] iCal URLs not logged or transmitted to external services
- [ ] No sensitive data in crash reports or analytics events

### Network
- [ ] All network calls use HTTPS
- [ ] Tokens sent in Authorization header — never in URL params
- [ ] Certificate pinning active on Google API calls (production)
- [ ] No third-party SDK making unexpected outbound connections

### App Store
- [ ] Camera usage string: accurate and specific to face recognition
- [ ] Calendar usage string: accurate and specific to sync
- [ ] Tasks usage string added (new — Tasks scope requires justification)
- [ ] QUERY_ALL_PACKAGES justified for Play Store (issue 016)
- [ ] Privacy policy URL live and accessible
- [ ] Privacy policy covers: face data, calendar data, Tasks data
- [ ] Data safety form updated (Google Play)
- [ ] Privacy nutrition label updated (Apple App Store)

### Build
- [ ] All console.log stripped from production build (Babel plugin)
- [ ] No debug logs in production paths
- [ ] No hardcoded dev URLs or test credentials

---

## RELIABILITY CHECKLIST — run before every release

- [ ] All async functions have typed try/catch
- [ ] All error paths produce user-friendly messages (Morgan reviewed)
- [ ] No function returns undefined when a value is expected
- [ ] Calendar permission denial handled gracefully
- [ ] Tasks permission denial handled gracefully
- [ ] Network loss during sync handled gracefully (show cached data)
- [ ] SecureStore read failure handled gracefully
- [ ] Google token expiry: silent refresh, not a crash or sign-out
- [ ] App recovers from background → foreground without state loss
- [ ] Low memory condition tested on Fire HD 10 (3GB RAM)

---

## CHAOS TESTING SCENARIOS — Riley validates each release

| Scenario | Expected behaviour | Tested? |
|----------|--------------------|---------|
| Google token expired mid-sync | Silent refresh, retry sync | — |
| Network drops during OAuth | Show retry prompt, no crash | — |
| iCal URL returns 404 | Show feed error, keep other feeds | — |
| App killed during sync | Next open: cached data shown, re-sync | — |
| Low memory on Fire HD 10 | No crash, graceful degradation | — |
| AsyncStorage full | Graceful error, no crash | — |
| Calendar permission revoked | Show explanation, offer re-grant | — |

---

## APP STORE COMPLIANCE

### Apple App Store
- **Calendar string**: "FamilyHub reads your calendar events to display
  them on the shared family hub screen."
- **Age rating**: 4+ (family content, no objectionable material)
- **Privacy nutrition label**:
  - Calendar data: collected, not linked to identity
  - No data sold to third parties

### Google Play
- **READ_CALENDAR**: declared — calendar event sync
- **WRITE_CALENDAR**: declared — two-way calendar push
- **READ_TASKS / WRITE_TASKS**: declared — Google Tasks two-way sync
- **QUERY_ALL_PACKAGES**: justify in declaration (issue 016 — pending)
- **SCHEDULE_EXACT_ALARM**: declared — event reminders
- **Target API**: 34 (Android 14) — required for new apps
- **Data safety form**: calendar data synced via Google APIs, stored on-device

---

## PRIVACY POLICY REQUIREMENTS

Must cover (update on every new data type — Morgan + Riley):
1. What data is collected: calendar events, task data, member PINs
2. Where it is stored: on-device only (AsyncStorage + SecureStore), no cloud storage
3. Who can access it: only the family members on this device
4. How to delete it: remove member from Settings or reset app
5. Third-party services: Google Calendar API, Google Tasks API
6. Google's privacy policy link
7. Contact email for privacy questions
8. Last updated date

**Current status**: Needs update for Google Tasks scope (issue 030)

---

## SECURITY AUDIT LOG
*(Riley updates after each audit)*

| Date       | Scope                          | Findings            | Status   |
|------------|-------------------------------|---------------------|----------|
| 2026-04-02 | Face data + SecureStore keys  | Key sanitization fixed (@ → _at_) | ✅ Done |
| —          | Google Tasks/Calendar write   | Pending             | ⚠️ Issue 029 |
| —          | OAuth scope review            | Pending             | ⚠️ Issue 029 |
