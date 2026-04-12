# TEAM_STANDARDS.md — Code Reliability Standards
# FamilyHub · Read on startup after CLAUDE.md
# ============================================================
# Every piece of code shipped by Team FamHub meets ALL of these.
# ============================================================

## 1. CODE RELIABILITY
**Definition**: Software performs its intended functions without failure,
consistently, across all supported devices and conditions.

### Rules — no exceptions
- Every function has a defined success path AND a failure path
- All failure paths are handled explicitly — no silent failures
- No function returns `undefined` when a value is expected
- Every async operation has `.catch()` or `try/catch`
- All state mutations are predictable and reversible where possible
- No magic numbers — all constants named and documented
- Every exported function has JSDoc:
  ```typescript
  /**
   * [What it does — one sentence]
   * @param memberId - [description]
   * @returns [what it returns]
   * @throws [what conditions cause failure]
   */
  ```

**Reliability gate**: SAGE flags any function without error handling
or JSDoc as a blocking issue — task is not done until resolved.

---

## 2. TESTING

### Required test types
| Type        | Tool              | Covers                              | Owner  |
|-------------|-------------------|-------------------------------------|--------|
| Unit        | Jest              | Functions, pure logic, utilities    | SAGE   |
| Integration | Jest              | Service interactions, store mutations| SAGE  |
| Component   | Jest + RNTL       | React Native component rendering    | JORDAN |
| E2E         | Detox             | Critical flows (enroll → unlock)    | SAGE   |
| Security    | Manual + Riley    | Face data handling, token storage   | RILEY  |

### Coverage thresholds — CI fails if below these
| Directory       | Minimum Coverage |
|-----------------|-----------------|
| src/services/   | 80%             |
| src/store/      | 90%             |
| src/screens/    | 60%             |
| src/utils/      | 95%             |
| src/components/ | 60%             |
| src/hooks/      | 70%             |

### Test-first rule
For any service or utility function: write the test BEFORE the
implementation (TDD where practical). For UI screens: write the test
immediately after the component is functional.

**Test file location**: `src/__tests__/[module-name].test.ts`

### Required test cases per function
1. Happy path — expected inputs, expected outputs
2. Edge case — empty, null, undefined, boundary values
3. Failure case — what happens when a dependency fails

### Example structure
```typescript
describe('FaceRecognitionService', () => {
  describe('extractSignature', () => {
    it('returns null when landmarks are missing', () => { ... });
    it('returns a 25-element array for valid face', () => { ... });
    it('normalises values to be scale-invariant', () => { ... });
  });
  describe('cosineSimilarity', () => {
    it('returns 1.0 for identical vectors', () => { ... });
    it('returns 0 for orthogonal vectors', () => { ... });
    it('clamps result between 0 and 1', () => { ... });
  });
});
```

**No code ships without tests.** SAGE blocks any task where coverage
drops below the thresholds above.

---

## 3. REFACTORING

**Definition**: Improving structure without changing functionality.

### When required (SAGE flags, assigned member executes)
- Function exceeds **50 lines** → split into smaller functions
- File exceeds **300 lines** → split by logical boundary
- Cyclomatic complexity > 10 → simplify branching
- Duplicated code ≥5 lines → extract to utility
- Nested callbacks >3 levels → use async/await or extract
- Any `any` TypeScript type → replace with proper type
- Magic numbers → named constants with comments
- Commented-out code → delete (git has the history)

### Refactoring protocol
1. Confirm existing tests pass BEFORE refactoring
2. Refactor in a focused commit — no mixing features + refactors
3. Confirm existing tests pass AFTER refactoring
4. Update JSDoc if function signature changed
5. Log refactor in PROJECT_SUMMARY with reason

### Naming conventions
```typescript
// Functions: verb + noun, camelCase
extractSignature()   fetchGoogleEvents()   scheduleReminder()

// Constants: SCREAMING_SNAKE_CASE + comment
const MATCH_THRESHOLD = 0.78;  // tunable 0.75–0.88, lowered for ML Kit
const MAX_FILE_TOKENS = 24800; // hard Claude Code file size limit
const CLAUDE_MD_CHAR_LIMIT = 40000; // Claude Code CLAUDE.md limit

// Types/Interfaces: PascalCase, descriptive
interface FaceSignature {}   type CalendarFeed = {}

// Booleans: is/has/can/should prefix
isLocked   hasFace   canEnroll   shouldRefresh
```

---

## 4. CONTINUOUS INTEGRATION

**Definition**: Code changes verified by automated builds to catch errors early.

### CI Pipeline — GitHub Actions (`/.github/workflows/ci.yml`)
Triggers: push to any branch, PR to main or develop

**Stage 1 — Code Quality** (blocks everything if fails)
```yaml
- run: npm ci
- run: npx tsc --noEmit
- run: npx eslint . --max-warnings 0
- run: npx prettier --check .
```

**Stage 2 — Tests** (blocks build if fails)
```yaml
- run: npx jest --coverage --ci
# Fails if coverage drops below thresholds
```

**Stage 3 — Build** (main branch only)
```yaml
- run: eas build --platform all --non-interactive --profile preview
```

**Stage 4 — Deploy** (version tag only)
```yaml
- run: eas submit --platform all
```

### CI Rules — non-negotiable
- No merge with failing CI — not for any reason, not even "hotfix"
- If CI is red, fixing it is the HIGHEST priority task
- SAGE owns CI health. Reports status at every "Team FamHub In"
- ALEX maintains the CI workflow file
- Branch naming: `feature/`, `fix/`, `refactor/`, `test/`, `chore/`

### ESLint Config (zero-warning policy)
```json
{
  "extends": ["expo", "@react-native", "plugin:@typescript-eslint/recommended"],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": "error",
    "no-console": ["warn", { "allow": ["warn", "error"] }],
    "prefer-const": "error",
    "no-magic-numbers": ["warn", { "ignore": [0, 1, -1] }]
  }
}
```

### TypeScript Config (strict mode)
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true
  }
}
```

### CI Status Format (reported at "Team FamHub In")
```
CI: ✅ GREEN | Tests: 47 pass, 0 fail | Coverage: 84% | Build: ✅ Android ✅ iOS
CI: ❌ RED   | Tests: 44 pass, 3 fail | Coverage: 71% | Build: ⚠️  Android only
```

---

## 5. MAINTAINABILITY

**Definition**: Code that is easy to fix, update, and debug by any team member.

### File header (every file)
```typescript
/**
 * [FileName].ts
 * [One sentence: what this file does]
 *
 * Owner: [Team member]
 * Last refactored: [date]
 * Test coverage: [%]
 * Dependencies: [key libraries]
 */
```

### Code consistency rules
- Prettier: 2-space indent, single quotes, trailing commas
- File length: soft warning 200 lines, hard limit 300 lines
- Import order: React → React Native → Expo → third-party → local
- No dead code — remove unused imports/variables/functions immediately

### Debugging support
- All services log errors with context:
  `console.error('[ServiceName] functionName failed:', err, { context })`
- Error messages must be actionable — not "Error occurred" but:
  `"FaceRecognitionService: extractSignature failed — no landmarks
   returned. Ensure FaceDetectorLandmarks.all is set in detector options."`
- Dev builds: verbose logging enabled
- Production builds: all console.log stripped via Babel plugin

### Change management
- CHANGELOG.md updated on every meaningful change
- Format: `## [version] [date] \n ### Added / Changed / Fixed / Removed`
- Semver: PATCH (bug fixes), MINOR (new features), MAJOR (breaking changes)
- Version bumped in package.json + app.json on every release

### TODO format
```typescript
// TODO(ALEX): migrate to v2 API endpoint — 2026-04-02
// FIXME(SAGE): retry logic missing on token refresh — 2026-04-02
// HACK(JORDAN): CameraX fix — remove when RN 0.75 releases
```

---

## RELIABILITY GATE CHECKLIST
### Run before every task is marked done (SAGE enforces)

```
RELIABILITY GATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ CHALLENGE (from TEAM_CHALLENGE.md)
□ Q1–Q5 all clear or owner confirmed

□ ALEX:   Async functions have try/catch with typed errors
□ ALEX:   CI pipeline is green
□ ALEX:   No console.log in production paths
□ ALEX:   All constants named (no magic numbers)

□ JORDAN: Component renders on Fire HD 10 profile
□ JORDAN: Component has render test in src/__tests__/
□ JORDAN: All props typed — zero `any`
□ JORDAN: No function >50 lines inside a component

□ RILEY:  No sensitive data in logs, AsyncStorage, or network URLs
□ RILEY:  All error paths explicit — no silent failures
□ RILEY:  SecureStore used for all face + token data
□ RILEY:  Failure scenarios tested (network drop, storage fail)

□ MORGAN: User-facing error messages are clear and helpful
□ MORGAN: No unexpected paywalls introduced
□ MORGAN: Push notification copy reviewed

□ SAGE:   Jest coverage thresholds met
□ SAGE:   ESLint passes — zero warnings
□ SAGE:   TypeScript strict — zero errors
□ SAGE:   No file exceeds 24,800 tokens
□ SAGE:   CLAUDE.md under 40,000 chars
□ SAGE:   PROJECT_SUMMARY updated with entry + timestamp
□ SAGE:   CHANGELOG.md updated
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GATE: ✅ ALL CLEAR  /  ❌ BLOCKED — [reason]
```
