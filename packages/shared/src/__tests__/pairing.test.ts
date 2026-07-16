import {
  WebCryptoProvider,
  deriveHouseholdKeys,
  createHubHousehold,
  startPairing,
  redeemPairing,
  encodePairingQR,
  decodePairingQR,
  RelayClient,
  type FetchLike,
  type HttpResponse,
  type PairingPayload,
} from "../index";

const provider = new WebCryptoProvider();

function res(status: number, body: unknown): HttpResponse {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

describe("pairing key derivation + QR", () => {
  it("derives stable, distinct content and BLE keys", async () => {
    const secret = provider.randomBytes(32);
    const a = await deriveHouseholdKeys(provider, secret);
    const b = await deriveHouseholdKeys(provider, secret);
    expect(Array.from(a.contentKey)).toEqual(Array.from(b.contentKey)); // deterministic
    expect(a.contentKey.length).toBe(32);
    expect(Array.from(a.contentKey)).not.toEqual(Array.from(a.bleSecret)); // different labels
  });

  it("QR round-trips and rejects malformed input", () => {
    const p: PairingPayload = {
      v: 1,
      householdId: "h1",
      relayUrl: "https://r",
      wsUrl: "wss://r/ws",
      serviceUuid: "uuid",
      pairingToken: "pt",
      contentKey: "AA==",
      bleSecret: "BB==",
    };
    expect(decodePairingQR(encodePairingQR(p))).toEqual(p);
    expect(() => decodePairingQR('{"householdId":"h1"}')).toThrow();
    expect(() => decodePairingQR("not json")).toThrow();
  });
});

describe("pairing end-to-end (hub → QR → companion)", () => {
  it("companion recovers the same household keys via the QR, without the root secret", async () => {
    const fetchFn: FetchLike = async (url, init) => {
      if (url.endsWith("/household")) return res(200, { householdId: "H", deviceId: "HUBDEV", deviceToken: "HUBTOK" });
      if (url.endsWith("/pair/start")) return res(200, { pairingToken: "PT", code: "012345", expiresAt: 999 });
      if (url.endsWith("/pair/redeem")) {
        expect(JSON.parse(init!.body!).pairingToken).toBe("PT");
        return res(200, { deviceId: "PHONE", deviceToken: "PHONETOK", householdId: "H" });
      }
      return res(404, "nope");
    };

    const hubRelay = new RelayClient({ baseUrl: "https://relay.example", fetchFn });

    // Hub creates the household (root secret stays local).
    const hub = await createHubHousehold(hubRelay, provider, { name: "Smiths", hubName: "Kitchen" });
    expect(hub.householdId).toBe("H");
    expect(hub.householdSecret.length).toBe(32);

    // Hub mints a pairing invite + QR.
    const invite = await startPairing(hubRelay.withToken(hub.deviceToken), {
      householdId: hub.householdId,
      relayUrl: "https://relay.example",
      wsUrl: "wss://relay.example/household/H/ws",
      serviceUuid: "svc-uuid",
      contentKey: hub.contentKey,
      bleSecret: hub.bleSecret,
    });
    expect(invite.code).toBe("012345");
    // The root secret is NOT in the QR.
    expect(invite.qr).not.toContain(Buffer.from(hub.householdSecret).toString("base64"));

    // Companion scans + redeems.
    const companion = await redeemPairing(fetchFn, invite.qr, { name: "Mum", platform: "android" });
    expect(companion.deviceId).toBe("PHONE");
    expect(companion.deviceToken).toBe("PHONETOK");
    expect(companion.householdId).toBe("H");
    expect(companion.serviceUuid).toBe("svc-uuid");
    // Same derived keys on both sides → they can seal/open each other's content.
    expect(Array.from(companion.contentKey)).toEqual(Array.from(hub.contentKey));
    expect(Array.from(companion.bleSecret)).toEqual(Array.from(hub.bleSecret));
  });
});
