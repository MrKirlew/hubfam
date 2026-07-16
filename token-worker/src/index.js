/**
 * FamilyHub token-exchange Worker
 *
 * The app (@react-native-google-signin, offlineAccess) receives a one-time
 * serverAuthCode. Exchanging it — and later refreshing — against Google's Web
 * OAuth client REQUIRES the client secret, which must never ship inside the app.
 * This Worker performs that exchange server-side so the app can store per-account
 * refresh tokens and sync every account in the background (not just the SDK's
 * single live session).
 *
 * POST JSON, one of:
 *   { "grant": "code",    "code": "<serverAuthCode>" }   -> { access_token, refresh_token, expires_in }
 *   { "grant": "refresh", "refresh_token": "<token>" }   -> { access_token, expires_in }
 *
 * Requires header  X-Hub-Token: <SHARED_TOKEN>  (basic abuse gate).
 * Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SHARED_TOKEN.
 */

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Hub-Token",
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    // Basic shared-secret gate so this isn't an open token proxy. Checked FIRST
    // so unauthenticated callers can't probe configuration state.
    if (env.SHARED_TOKEN && request.headers.get("X-Hub-Token") !== env.SHARED_TOKEN) {
      return json({ error: "unauthorized" }, 401);
    }

    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      return json({ error: "worker_misconfigured" }, 500);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "bad_json" }, 400);
    }

    const params = new URLSearchParams();
    params.set("client_id", env.GOOGLE_CLIENT_ID);
    params.set("client_secret", env.GOOGLE_CLIENT_SECRET);

    if (body.grant === "code") {
      if (!body.code) return json({ error: "missing_code" }, 400);
      params.set("grant_type", "authorization_code");
      params.set("code", body.code);
      // serverAuthCode from the mobile SDK is exchanged with an empty redirect_uri.
      params.set("redirect_uri", "");
    } else if (body.grant === "refresh") {
      if (!body.refresh_token) return json({ error: "missing_refresh_token" }, 400);
      params.set("grant_type", "refresh_token");
      params.set("refresh_token", body.refresh_token);
    } else {
      return json({ error: "bad_grant" }, 400);
    }

    let googleRes, data;
    try {
      googleRes = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      data = await googleRes.json();
    } catch {
      return json({ error: "upstream_unreachable" }, 502);
    }

    if (!googleRes.ok) {
      // Surface Google's error (e.g. invalid_grant) without leaking secrets.
      return json({ error: data.error || "google_error", error_description: data.error_description }, googleRes.status);
    }

    return json({
      access_token: data.access_token,
      refresh_token: data.refresh_token, // present only on the code grant
      expires_in: data.expires_in,
      scope: data.scope,
      token_type: data.token_type,
    });
  },
};
