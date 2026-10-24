import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";
import pino from "pino";
import { mkdir } from "node:fs/promises";
import { config } from "./config.js";
import { decideReply, isGeminiConfigured } from "./gemini.js";
import { isLocalCandidate, extractMessageText } from "./local-filter.js";
import { GroupMemory, GroupLimits } from "./memory.js";

const logger = pino({ level: "silent" });
const memory = new GroupMemory(config.contextMessages);
const limits = new GroupLimits();
const seenMessageIds = new Set();
const discoveredGroups = new Set();

let reconnectTimer = null;
let startInProgress = false;

function rememberMessageId(id) {
  if (!id) return false;
  if (seenMessageIds.has(id)) return true;

  seenMessageIds.add(id);
  if (seenMessageIds.size > 2500) {
    const oldest = seenMessageIds.values().next().value;
    if (oldest) seenMessageIds.delete(oldest);
  }
  return false;
}

async function logGroupOnce(sock, groupId, enabled) {
  if (discoveredGroups.has(groupId)) return;
  discoveredGroups.add(groupId);

  let subject = groupId;
  try {
    const metadata = await sock.groupMetadata(groupId);
    if (metadata?.subject) subject = metadata.subject;
  } catch {
    // The JID itself is still enough to configure the allowlist.
  }

  console.log("[GROUP_DISCOVERED] " + JSON.stringify({
    subject,
    jid: groupId,
    enabled
  }));
}

function eligibleForGroup(jid) {
  return config.targetGroupIds.has(jid);
}

async function processMessage(sock, msg) {
  const key = msg?.key;
  const groupId = key?.remoteJid;

  if (!groupId || !groupId.endsWith("@g.us") || key.fromMe) return;
  if (rememberMessageId(key.id)) return;

  const enabled = eligibleForGroup(groupId);
  await logGroupOnce(sock, groupId, enabled);

  // Privacy-first default: never send messages from an unapproved group to Gemini.
  if (!enabled) return;

  const text = extractMessageText(msg.message);
  if (!text) return;

  // Keep a short, in-memory context only for explicitly approved groups.
  memory.add(groupId, text);

  if (!isLocalCandidate(text, config)) return;

  if (!isGeminiConfigured()) {
    console.warn("A candidate message was skipped because GEMINI_API_KEY is not set.");
    return;
  }

  if (limits.isCoolingDown(groupId, config.replyCooldownMs)) return;

  if (!limits.canCallAI(groupId, config.maxAiCallsPerGroupPerHour)) {
    console.warn("Hourly Gemini-call limit reached for group " + groupId + ".");
    return;
  }

  limits.markAICall(groupId);

  let decision;
  try {
    decision = await decideReply({
      targetText: text,
      context: memory.getContext(groupId)
    });
  } catch (error) {
    console.error("Gemini request failed: " + (error?.message || "unknown error"));
    return;
  }

  limits.markAttempt(groupId);

  if (!decision.shouldReply) {
    console.log("[AI_SKIP] group=" + groupId + " reason=" + decision.reason);
    return;
  }

  if (config.dryRun) {
    console.log("[DRY_RUN_REPLY] group=" + groupId + " reply=" + decision.reply);
    return;
  }

  if (!limits.canReply(
    groupId,
    config.replyCooldownMs,
    config.maxRepliesPerGroupPerHour
  )) {
    console.log("[SEND_LIMIT] reply suppressed for group " + groupId + ".");
    return;
  }

  try {
    // A short pause makes rapid replies less disruptive; it does not bypass local limits.
    await new Promise((resolve) => setTimeout(resolve, 1800));
    await sock.sendMessage(groupId, { text: decision.reply });
    limits.markReply(groupId);
    console.log("[REPLY_SENT] group=" + groupId);
  } catch (error) {
    console.error("WhatsApp send failed: " + (error?.message || "unknown error"));
  }
}

async function startSocket() {
  if (startInProgress) return;
  startInProgress = true;

  try {
    await mkdir(config.authDir, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(config.authDir);

    if (!state.creds.registered && !config.pairingNumber) {
      console.warn("WhatsApp is not linked. Set PAIRING_NUMBER (digits only, including country code) in Railway Variables.");
    }

    const sock = makeWASocket({
      auth: state,
      logger,
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 60_000,
      keepAliveIntervalMs: 25_000
    });

    let pairingCodeRequested = false;

    sock.ev.on("creds.update", async () => {
      try {
        await saveCreds();
      } catch (error) {
        console.error("Could not save WhatsApp session: " + (error?.message || "unknown error"));
      }
    });

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && !state.creds.registered && !pairingCodeRequested && config.pairingNumber) {
        pairingCodeRequested = true;
        try {
          const code = await sock.requestPairingCode(config.pairingNumber);
          console.log("[PAIRING_CODE] " + code);
          console.log("Enter this code in WhatsApp: Linked devices -> Link a device -> Link with phone number instead.");
          console.log("Treat this one-time pairing code as a password. Do not share it.");
        } catch (error) {
          pairingCodeRequested = false;
          console.error("Could not request WhatsApp pairing code: " + (error?.message || "unknown error"));
        }
      }

      if (connection === "open") {
        console.log("WhatsApp connected. Target groups allowed: " + config.targetGroupIds.size);
        if (config.targetGroupIds.size === 0) {
          console.log("Discovery-only mode: set TARGET_GROUP_IDS after reading [GROUP_DISCOVERED] logs.");
        }
        console.log("Dry run is " + (config.dryRun ? "ON (no messages will be sent)." : "OFF (AI replies can be sent)."));
        startInProgress = false;
      }

      if (connection === "close") {
        startInProgress = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        if (statusCode === DisconnectReason.loggedOut) {
          console.error("WhatsApp logged out. Check session/volume and re-link if needed.");
          return;
        }

        if (!reconnectTimer) {
          console.warn("WhatsApp disconnected. Reconnecting in 5 seconds.");
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            startSocket().catch((error) => {
              console.error("Reconnect failed: " + (error?.message || "unknown error"));
            });
          }, 5000);
        }
      }
    });

    // Serialize message work so bursts do not make overlapping AI requests.
    let queue = Promise.resolve();
    sock.ev.on("messages.upsert", ({ messages, type }) => {
      if (type !== "notify") return;
      queue = queue
        .then(async () => {
          for (const message of messages) {
            await processMessage(sock, message);
          }
        })
        .catch((error) => {
          console.error("Message processing failed: " + (error?.message || "unknown error"));
        });
    });
  } catch (error) {
    startInProgress = false;
    console.error("Startup failed: " + (error?.stack || error?.message || "unknown error"));
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        startSocket().catch(console.error);
      }, 10_000);
    }
  }
}

console.log("Gemini WhatsApp Friend is starting.");
console.log("Auth directory: " + config.authDir);
console.log("Gemini configured: " + (isGeminiConfigured() ? "yes" : "no"));
console.log("Approved group IDs: " + config.targetGroupIds.size);
if (!config.geminiApiKey) {
  console.warn("GEMINI_API_KEY is empty. WhatsApp can link, but AI replies will be disabled.");
}
if (config.targetGroupIds.size === 0) {
  console.log("TARGET_GROUP_IDS is empty; no group message text will be sent to Gemini.");
}
if (config.dryRun) {
  console.log("DRY_RUN=true; suggestions are logged, and WhatsApp messages are not sent.");
}

startSocket().catch(console.error);

process.on("SIGTERM", () => {
  console.log("SIGTERM received; Railway is stopping the worker.");
  if (reconnectTimer) clearTimeout(reconnectTimer);
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT received; exiting.");
  if (reconnectTimer) clearTimeout(reconnectTimer);
  process.exit(0);
});
