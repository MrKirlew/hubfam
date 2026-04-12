# Implementation Plan: Fix Face Scanning & Reminders Crashes

## Objective
1. Improve face scanning precision to be >90% to prevent mistaken identities.
2. Fix the app crashes that occur when navigating to the "Spoken Reminders" and "Face Reminders" screens.
3. Rebuild and deploy the app to the connected tablet.

## Key Files Modified
1. `src/services/FaceRecognitionService.ts`: 
   - `MATCH_THRESHOLD` increased from 0.80 to 0.92.
   - `MIN_SCORE_GAP` increased from 0.05 to 0.07.
   - `CONFIRM_FRAMES` increased from 8 to 12.
   - `MIN_DETECTOR_CONFIDENCE` increased from 0.70 to 0.75.
2. `src/store/appStore.ts`:
   - Added interfaces `SpokenReminder` and `FaceReminder`.
   - Added `spokenReminders` and `faceReminders` state arrays to the Zustand store.
   - Implemented all necessary CRUD actions (`add`, `update`, `remove`) for both reminder types to satisfy the requirements of the Reminder screens.

## Implementation Steps
1. The code modifications have been prepared and inserted into the project files.
2. Build the Android APK using `npm run android` or `eas build`.
3. Install the newly built APK onto the connected tablet (`192.168.1.241:35217`).

## Verification
- Navigate to the "Spoken Reminders" and "Face Reminders" screens in the app to ensure they no longer crash.
- Ensure face enrollment and scanning on the lock screen accurately verify users with a >90% precision confidence.