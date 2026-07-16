# familyhub-relay

First-party relay for FamilyHub's cloud lane (WiFi/cellular). One
**Durable Object per household** provides real-time WebSocket fan-out plus an
authoritative SQLite append-log of messages and shared-list ops. **The relay is
zero-knowledge**: it stores only ciphertext (sealed with a household key it never
receives) and device tokens (only their SHA-256 hashes). It never sees message
plaintext, the `householdSecret`, or the derived content/BLE keys — those travel
device→device via the QR pairing code, out of band.

## Endpoints

| Method + path | Auth | Purpose |
|---|---|---|
| `POST /household` | — | Create a household; returns `{ householdId, deviceId, deviceToken }` for the hub. |
| `POST /household/:id/pair/start` | hub Bearer | Mint a single-use pairing token + 6-digit code (5-min TTL). |
| `POST /household/:id/pair/redeem` | pairing token | Companion redeems → `{ deviceId, deviceToken }`. |
| `POST /household/:id/messages` | device Bearer | Append a sealed message; fan out; push offline devices. |
| `POST /household/:id/lists/:listId/ops` | device Bearer | Append a sealed list op; fan out. |
| `GET  /household/:id/state?since=<seq>` | device Bearer | Pull messages/ops/devices after a cursor (REST fallback). |
| `GET  /household/:id/ws?token=<deviceToken>` | device token | WebSocket: replay backlog + live fan-out. |
| `POST /household/:id/devices/:deviceId/revoke` | hub Bearer | Revoke a device (closes its socket, invalidates token). |
| `POST /household/:id/push/register` | device Bearer | Store an Expo push token for background nudges. |

Auth: every device holds an opaque `deviceToken`; the relay stores only
`SHA-256(deviceToken)` and checks `revokedAt IS NULL`. Households are isolated
structurally — one DO instance per `idFromName(householdId)`.

## Develop / deploy

```bash
cd relay-worker
npm install
npm run typecheck                       # needs @cloudflare/workers-types
npx wrangler secret put RELAY_SIGNING_KEY
npx wrangler secret put EXPO_ACCESS_TOKEN   # optional (background push)
npm run dev                             # local miniflare with DO + SQLite + WS
npm run deploy
```

Then point the apps at the deployed URL via `EXPO_PUBLIC_RELAY_URL`.

## Verify locally (smoke test)

```bash
# 1) create a household (hub)
curl -sX POST http://localhost:8787/household -d '{"name":"Smiths","hubName":"Kitchen"}'
#    → {"householdId":"...","deviceId":"...","deviceToken":"HUB_TOKEN"}

# 2) start pairing (as hub)
curl -sX POST http://localhost:8787/household/$HID/pair/start \
  -H "Authorization: Bearer $HUB_TOKEN"
#    → {"pairingToken":"...","code":"012345","expiresAt":...}

# 3) redeem (as a phone)
curl -sX POST http://localhost:8787/household/$HID/pair/redeem \
  -d '{"pairingToken":"'$PT'","name":"Mum","platform":"android"}'
#    → {"deviceId":"...","deviceToken":"PHONE_TOKEN"}

# 4) phone posts a (sealed) message; hub's open WS receives it, then
#    GET /state?since=0 as the hub returns it for the REST fallback path.
```

Unit tests for the pure helpers: `npx jest --config relay-worker/jest.config.js --rootDir relay-worker`.
The Durable Object itself is exercised with `wrangler dev` (miniflare) — add
`@cloudflare/workers-types` + `wrangler` via `npm install` first.
