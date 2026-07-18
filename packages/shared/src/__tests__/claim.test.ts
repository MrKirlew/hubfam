import {
  WebCryptoProvider,
  base32Encode,
  base32Decode,
  createClaimBlob,
  openClaimBlob,
  claimLookupId,
  normalizeClaimCode,
  createPairingInviteWithClaim,
  fetchAndOpenClaim,
  redeemPairing,
  createHubHousehold,
  RelayClient,
  type FetchLike,
  type HttpResponse,
  type PairingPayload,
} from "../index";

const provider = new WebCryptoProvider();

function res(status: number, body: unknown): HttpResponse {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

const PAYLOAD: PairingPayload = {
  v: 1,
  householdId: "H",
  relayUrl: "https://relay.example",
  wsUrl: "wss://relay.example/household/H/ws",
  serviceUuid: "svc-uuid",
  pairingToken: "PT",
  contentKey: "Y29udGVudA==",
  bleSecret: "Ymxl",
};

describe("base32 (Crockford)", () => {
  it("round-trips arbitrary bytes", () => {
    for (const len of [1, 5, 10, 32]) {
      const bytes = provider.randomBytes(len);
      expect(Array.from(base32Decode(base32Encode(bytes)))).toEqual(Array.from(bytes));
    }
  });

  it("is case-insensitive and tolerates dashes/spaces and I/L/O typos", () => {
    const bytes = provider.randomBytes(10);
    const enc = base32Encode(bytes);
    const withNoise = enc.toLowerCase().replace(/(.{4})/g, "$1- "); // dashes + spaces
    expect(Array.from(base32Decode(withNoise))).toEqual(Array.from(bytes));
  });
});

describe("claim blob crypto", () => {
  it("seals + opens a payload via the code, relay never sees the key", async () => {
    const { code, claimId, ciphertext } = await createClaimBlob(provider, PAYLOAD);

    // Code is a typeable 16-char base32 string (grouped as 4x4 with dashes).
    expect(normalizeClaimCode(code)).toHaveLength(16);
    // The ciphertext is opaque JSON {iv, ct} and contains none of the secrets.
    expect(ciphertext).not.toContain(PAYLOAD.contentKey);
    expect(ciphertext).not.toContain(PAYLOAD.pairingToken);
    // The claim id reveals nothing usable: it is not derivable back to the code.
    expect(claimId).not.toContain(normalizeClaimCode(code));

    // Companion recomputes the same lookup id from the code alone.
    expect(await claimLookupId(provider, code)).toBe(claimId);

    // ...and recovers the exact payload.
    expect(await openClaimBlob(provider, code, ciphertext)).toEqual(PAYLOAD);
  });

  it("rejects a wrong code (different key/id, cannot decrypt)", async () => {
    const { code, ciphertext } = await createClaimBlob(provider, PAYLOAD);
    const wrong = normalizeClaimCode(code) === "AAAAAAAAAAAAAAAA" ? "BBBBBBBBBBBBBBBB" : "AAAAAAAAAAAAAAAA";
    await expect(openClaimBlob(provider, wrong, ciphertext)).rejects.toThrow();
  });
});

describe("claim end-to-end (hub upload → companion fetch by code)", () => {
  it("companion pairs from a typed code and recovers the household keys", async () => {
    const claims = new Map<string, string>(); // relay's global claim store (ciphertext by id)

    const fetchFn: FetchLike = async (url, init) => {
      if (url.endsWith("/household")) return res(200, { householdId: "H", deviceId: "HUB", deviceToken: "HUBTOK" });
      if (url.endsWith("/pair/start")) return res(200, { pairingToken: "PT", code: "012345", expiresAt: 999 });
      if (url.endsWith("/claims/put")) {
        const b = JSON.parse(init!.body!);
        claims.set(b.claimId, b.ciphertext);
        return res(200, { ok: true, expiresAt: 999 });
      }
      if (url.endsWith("/claims/get")) {
        const b = JSON.parse(init!.body!);
        const ct = claims.get(b.claimId);
        return ct ? res(200, { ciphertext: ct }) : res(400, { error: "not found" });
      }
      if (url.endsWith("/pair/redeem")) {
        expect(JSON.parse(init!.body!).pairingToken).toBe("PT");
        return res(200, { deviceId: "PHONE", deviceToken: "PHONETOK", householdId: "H" });
      }
      return res(404, "nope");
    };

    const hubRelay = new RelayClient({ baseUrl: "https://relay.example", fetchFn });
    const hub = await createHubHousehold(hubRelay, provider, { hubName: "Kitchen" });

    const invite = await createPairingInviteWithClaim(hubRelay.withToken(hub.deviceToken), provider, {
      householdId: hub.householdId,
      relayUrl: "https://relay.example",
      wsUrl: "wss://relay.example/household/H/ws",
      serviceUuid: "svc-uuid",
      contentKey: hub.contentKey,
      bleSecret: hub.bleSecret,
    });

    expect(invite.claimCode).toBeDefined();
    expect(claims.size).toBe(1); // blob was uploaded

    // Companion knows only the relay URL (baked in) + the typed code.
    const payload = await fetchAndOpenClaim(fetchFn, "https://relay.example", provider, invite.claimCode!);
    const companion = await redeemPairing(fetchFn, JSON.stringify(payload), { name: "Mum", platform: "android" });

    expect(companion.deviceId).toBe("PHONE");
    expect(Array.from(companion.contentKey)).toEqual(Array.from(hub.contentKey));
    expect(Array.from(companion.bleSecret)).toEqual(Array.from(hub.bleSecret));
  });

  it("degrades to QR-only when the blob upload fails", async () => {
    const fetchFn: FetchLike = async (url) => {
      if (url.endsWith("/pair/start")) return res(200, { pairingToken: "PT", code: "012345", expiresAt: 999 });
      if (url.endsWith("/claims/put")) return res(500, { error: "boom" });
      return res(404, "nope");
    };
    const relay = new RelayClient({ baseUrl: "https://relay.example", fetchFn, deviceToken: "HUBTOK" });
    const invite = await createPairingInviteWithClaim(relay, provider, {
      householdId: "H",
      relayUrl: "https://relay.example",
      wsUrl: "wss://relay.example/household/H/ws",
      serviceUuid: "svc-uuid",
      contentKey: provider.randomBytes(32),
      bleSecret: provider.randomBytes(32),
    });
    expect(invite.qr).toBeDefined();
    expect(invite.claimCode).toBeUndefined(); // graceful fallback
  });
});
