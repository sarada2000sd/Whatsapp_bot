const ACK_ONLY =
  /^(හරි|හ්ම්+|ඔව්|නෑ|නැහැ|අඩෝ|අහ්|හපෝ|ela|elaa|ok|okay|k|lol|lmao|😂+|🤣+|❤️+|👍+|🙏+|💀+|අම්මෝ)\s*[.!?😂🤣❤️👍🙏💀]*$/i;

const URL_ONLY = /^(https?:\/\/\S+|www\.\S+)$/i;

const QUESTION_OR_DIRECT_CUES =
  /[?？]|මොකක්ද|මොකද්ද|කොහොමද|කවද්ද|කවදාද|ඇයි|කියපන්|කියන්න|දන්නවද|පුළුවන්ද|පුලුවන්ද|කරන්නෙ කොහොමද|මොකෝ|ද බලන්න|උඹලා|ඔයා|මචං|මචන්|අඩෝ|මල්ලි/i;

export function extractMessageText(message) {
  if (!message || typeof message !== "object") return "";

  let current = message;
  for (let depth = 0; depth < 5; depth += 1) {
    if (current.ephemeralMessage?.message) {
      current = current.ephemeralMessage.message;
      continue;
    }
    if (current.viewOnceMessage?.message) {
      current = current.viewOnceMessage.message;
      continue;
    }
    if (current.viewOnceMessageV2?.message) {
      current = current.viewOnceMessageV2.message;
      continue;
    }
    if (current.documentWithCaptionMessage?.message) {
      current = current.documentWithCaptionMessage.message;
      continue;
    }
    break;
  }

  const candidates = [
    current.conversation,
    current.extendedTextMessage?.text,
    current.imageMessage?.caption,
    current.videoMessage?.caption,
    current.documentMessage?.caption
  ];

  const text = candidates.find((candidate) => typeof candidate === "string" && candidate.trim());
  return typeof text === "string" ? text.trim().slice(0, 1200) : "";
}

export function isLocalCandidate(text, config) {
  const value = text.trim();
  if (!value || value.length < config.minCandidateLength) return false;
  if (URL_ONLY.test(value) || ACK_ONLY.test(value)) return false;

  const name = config.botName.trim().toLowerCase();
  const mentionsBot = name.length >= 2 && value.toLowerCase().includes(name);

  if (config.replyMode === "mention") {
    return mentionsBot || QUESTION_OR_DIRECT_CUES.test(value);
  }

  const questionOrDirect = QUESTION_OR_DIRECT_CUES.test(value);
  const words = value.split(/\s+/).filter(Boolean).length;
  const substantiveMessage = value.length >= 45 && words >= 7;

  // Only messages that look conversational or substantive are sent to Gemini.
  // Short acknowledgements, link-only messages, media-only posts, and most noise stay local.
  return mentionsBot || questionOrDirect || substantiveMessage;
}
