import {
  getRemoteStore, readSettings, patchSettings, readHistory, writeHistory, rememberStory
} from "./lib/remote-state.mjs";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

function validToken(request) {
  const expected = String(process.env.REMOTE_CONTROL_TOKEN || "");
  const provided = String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!expected || !provided || expected.length !== provided.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  return mismatch === 0;
}

function siteBase() {
  const value = process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL || "";
  return value ? value.replace(/\/+$/, "") : "";
}

async function launchBackgroundRunner() {
  const base = siteBase();
  const token = String(process.env.REMOTE_CONTROL_TOKEN || "");
  if (!base) throw new Error("Netlify URL environment variable is missing.");
  if (!token) throw new Error("Set REMOTE_CONTROL_TOKEN in Netlify environment variables.");
  const response = await fetch(base + "/.netlify/functions/automation-run-background", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
    body: JSON.stringify({ source: "control-panel" }),
    signal: AbortSignal.timeout(9000)
  });
  if (!response.ok && response.status !== 202 && response.status !== 204) {
    throw new Error("Background worker request failed with HTTP " + response.status + ".");
  }
  return response.status;
}

export default async function handler(request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: HEADERS });
  let store;
  try {
    store = getRemoteStore();
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "status";

    if (request.method === "GET") {
      const settings = await readSettings(store);
      if (action === "latest") {
        const latest = await store.get("latest", { type: "json", consistency: "strong" });
        return json(200, { latest: latest || null, status: publicStatus(settings) });
      }
      if (action === "history") {
        const history = await readHistory(store);
        return json(200, { count: history.length, recent: history.slice(-30).reverse() });
      }
      return json(200, { status: publicStatus(settings) });
    }

    if (request.method !== "POST") return json(405, { error: "Method not allowed." });
    if (!validToken(request)) return json(401, { error: "Remote control token is missing or incorrect." });

    let body = {};
    try { body = await request.json(); } catch {}
    const actionName = String(body.action || "");
    if (actionName === "mark-used") {
      const history = await readHistory(store);
      const updated = rememberStory(history, body.story || {});
      await writeHistory(updated, store);
      return json(200, { ok: true, historyCount: updated.length, alreadyUsed: updated === history });
    }

    const settings = await readSettings(store);
    if (actionName === "start") {
      if (!process.env.GEMINI_API_KEY) {
        return json(503, { error: "Set GEMINI_API_KEY in Netlify environment variables before enabling unattended Auto." });
      }
      const intervalHours = Math.min(12, Math.max(1, Number(body.intervalHours) || 3));
      await patchSettings({
        enabled: true,
        intervalHours,
        lastRunAt: new Date().toISOString(),
        lastStatus: "queued",
        lastMessage: "Remote Auto is enabled. The first server-side run has been queued."
      }, store);
      let dispatch = "queued";
      try {
        await launchBackgroundRunner();
      } catch (error) {
        dispatch = "scheduled-retry";
        await patchSettings({
          lastRunAt: new Date(Date.now() - Math.max(0, intervalHours - 1) * 3600000).toISOString(),
          lastStatus: "waiting",
          lastMessage: "Auto is enabled; immediate dispatch was unavailable. The hourly server scheduler will retry. " + String(error.message || error).slice(0, 180)
        }, store);
      }
      return json(200, { ok: true, dispatch, status: publicStatus(await readSettings(store)) });
    }

    if (actionName === "stop") {
      const updated = await patchSettings({
        enabled: false,
        lastStatus: "stopped",
        lastMessage: "Remote Auto is stopped. A run already in progress may finish; no further run will start."
      }, store);
      return json(200, { ok: true, status: publicStatus(updated) });
    }

    if (actionName === "interval") {
      const intervalHours = Math.min(12, Math.max(1, Number(body.intervalHours) || settings.intervalHours || 3));
      const updated = await patchSettings({
        intervalHours,
        lastMessage: settings.enabled
          ? "Remote Auto is active on the server; the new interval is saved."
          : "Interval saved. Press Run now to enable server-side Auto."
      }, store);
      return json(200, { ok: true, status: publicStatus(updated) });
    }

    if (actionName === "run-now") {
      if (!process.env.GEMINI_API_KEY) return json(503, { error: "Set GEMINI_API_KEY in Netlify environment variables first." });
      await patchSettings({
        lastRunAt: new Date().toISOString(),
        lastStatus: "queued",
        lastMessage: "A one-time server-side run has been queued."
      }, store);
      await launchBackgroundRunner();
      return json(200, { ok: true, status: publicStatus(await readSettings(store)) });
    }

    return json(400, { error: "Unknown automation action." });
  } catch (error) {
    return json(503, { error: "Remote automation storage is not ready: " + String(error.message || error).slice(0, 220) });
  }
}

function publicStatus(settings) {
  const last = Date.parse(settings.lastRunAt || "");
  const interval = Math.min(12, Math.max(1, Number(settings.intervalHours) || 3));
  return {
    enabled: Boolean(settings.enabled),
    intervalHours: interval,
    lastRunAt: settings.lastRunAt || null,
    lastCompletedAt: settings.lastCompletedAt || null,
    lastStatus: settings.lastStatus || "idle",
    lastMessage: String(settings.lastMessage || ""),
    latestAt: settings.latestAt || null,
    nextRunAt: settings.enabled && Number.isFinite(last) ? new Date(last + interval * 3600000).toISOString() : null,
    serverConfigured: Boolean(process.env.REMOTE_CONTROL_TOKEN && process.env.GEMINI_API_KEY)
  };
}
