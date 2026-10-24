import path from "node:path";

function parseBoolean(value, fallback) {
  if (value == null || value.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parsePositiveInt(value, fallback, min = 1, max = 100000) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizePhone(value) {
  return (value ?? "").replace(/\D/g, "");
}

const rawPhone = process.env.PAIRING_NUMBER ?? "";
const pairingNumber = normalizePhone(rawPhone);

if (rawPhone.trim() && !/^\d{8,15}$/.test(pairingNumber)) {
  throw new Error(
    "PAIRING_NUMBER must contain 8–15 digits including the country code, with no plus sign or spaces."
  );
}

const targetGroupIds = new Set(
  (process.env.TARGET_GROUP_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.endsWith("@g.us"))
);

const replyMode = (process.env.REPLY_MODE ?? "smart").trim().toLowerCase();
if (!["smart", "mention"].includes(replyMode)) {
  throw new Error('REPLY_MODE must be either "smart" or "mention".');
}

export const config = {
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() ?? "",
  geminiModel: process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash",
  pairingNumber,
  authDir: path.resolve(process.env.AUTH_DIR || "./data/auth"),
  targetGroupIds,
  dryRun: parseBoolean(process.env.DRY_RUN, true),
  replyMode,
  botName: (process.env.BOT_NAME ?? "Sarada").trim().slice(0, 40),
  minCandidateLength: parsePositiveInt(process.env.MIN_CANDIDATE_LENGTH, 12, 4, 250),
  contextMessages: parsePositiveInt(process.env.CONTEXT_MESSAGES, 6, 1, 12),
  replyCooldownMs: parsePositiveInt(process.env.REPLY_COOLDOWN_SECONDS, 90, 15, 3600) * 1000,
  maxAiCallsPerGroupPerHour: parsePositiveInt(
    process.env.MAX_AI_CALLS_PER_GROUP_PER_HOUR,
    12,
    1,
    100
  ),
  maxRepliesPerGroupPerHour: parsePositiveInt(
    process.env.MAX_REPLIES_PER_GROUP_PER_HOUR,
    4,
    1,
    30
  ),
  maxReplyLength: parsePositiveInt(process.env.MAX_REPLY_LENGTH, 500, 40, 1200)
};
