/**
 * Companion build-time config.
 *
 * The QR/paste pairing flows learn the relay URL from the invite itself, but the
 * manual *code* flow can't (a short code can't carry a URL) — so the companion
 * needs the relay's address baked in to fetch the pairing claim blob. The relay
 * URL is public (not a secret); override with EXPO_PUBLIC_RELAY_URL at build time
 * if the deployment moves.
 */
export const DEFAULT_RELAY_URL =
  process.env.EXPO_PUBLIC_RELAY_URL ?? "https://familyhub-relay.k9vision.workers.dev";
