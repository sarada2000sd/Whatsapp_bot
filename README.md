# Gemini WhatsApp Friend

A Node.js WhatsApp companion bot that uses Google Gemini to decide whether a group message deserves a short, casual reply. It is designed to run as a persistent Railway worker, so the PC does not need to stay on.

## Important behaviour

- The bot uses an unofficial WhatsApp Web library (Baileys), not Meta's official WhatsApp Business API. WhatsApp can log out or restrict unofficial clients; use this at your own risk.
- Only group IDs in TARGET_GROUP_IDS are processed. If that list is empty, the bot only logs group names/IDs and sends no group message content to Gemini.
- DRY_RUN defaults to true. The AI's suggested reply is logged but not sent.
- In an approved group, a local filter selects likely conversational messages before Gemini sees them. Gemini then decides whether to reply.
- Recent text context is held in memory only; it is not written to disk. The WhatsApp authentication session is stored under AUTH_DIR.
- Let the group members know that an AI assistant may process selected messages. Avoid using the bot in groups where members would not expect this.

## 1. Create the Gemini API key

Create a key in Google AI Studio: https://aistudio.google.com/api-keys

Keep the key private. Do not commit it to GitHub, do not paste it into chat, and do not add it to this repository. Add it only in Railway Variables as GEMINI_API_KEY.

## 2. Deploy from GitHub to Railway

1. Sign in to https://railway.com using the GitHub account that owns this repository.
2. Create a new project and choose Deploy from GitHub Repo.
3. Select sarada2000sd/Whatsapp_bot.
4. Open the service settings and add a persistent volume mounted at /app/data.
5. Add the variables listed below. Railway reads railway.toml and starts the worker with npm start.
6. Deploy the service and open its logs.

Required/important Railway Variables:

- GEMINI_API_KEY — your Google AI Studio API key.
- GEMINI_MODEL — defaults to gemini-3.8-flash.
- PAIRING_NUMBER — your WhatsApp number with country code, digits only. For Sri Lanka use the 94 country code and omit the leading 0, plus sign, spaces, and dashes.
- AUTH_DIR — set to /app/data/auth.
- TARGET_GROUP_IDS — leave empty during initial discovery.
- DRY_RUN — keep true during setup.
- REPLY_MODE — smart (default) or mention.
- BOT_NAME — the name you want the persona prompt to use.

Optional limits can be adjusted with MIN_CANDIDATE_LENGTH, CONTEXT_MESSAGES, REPLY_COOLDOWN_SECONDS, MAX_AI_CALLS_PER_GROUP_PER_HOUR, MAX_REPLIES_PER_GROUP_PER_HOUR, and MAX_REPLY_LENGTH. See .env.example for defaults.

## 3. Link WhatsApp using a pairing code

1. Make sure /app/data is a persistent Railway volume before linking.
2. Set PAIRING_NUMBER and AUTH_DIR, then deploy/restart.
3. In Railway logs, find [PAIRING_CODE]. This is a one-time code; do not share it.
4. On your phone, open WhatsApp > Linked devices > Link a device > Link with phone number instead.
5. Enter the code shown in Railway logs.
6. Wait for the log message saying WhatsApp connected.

If pairing cannot start, check that the number contains digits only with the country code, and that the volume is mounted. Do not delete the volume or auth folder after linking unless you intend to link again.

## 4. Discover and allow the target group

1. With the linked account active, send a new ordinary message in the group you want to use.
2. In Railway logs, look for [GROUP_DISCOVERED]. It includes the group subject and its JID, ending with @g.us. The bot does not send any content from that group to Gemini while it is not allowlisted.
3. Copy the JID into Railway Variable TARGET_GROUP_IDS. If you want more than one group, separate JIDs with commas.
4. Redeploy the service so the new allowlist is loaded.

## 5. Test before enabling replies

1. Keep DRY_RUN=true.
2. Send messages in the approved group that look like questions or substantial conversation.
3. Check Railway logs for [AI_SKIP] and [DRY_RUN_REPLY]. In dry-run mode, no WhatsApp replies are sent.
4. If the suggestions are not suitable, adjust BOT_NAME, REPLY_MODE, MIN_CANDIDATE_LENGTH, and the personality instructions in src/personality.js.
5. When you are satisfied, have informed the group, and accept the account risk, set DRY_RUN=false and redeploy.

## Data and cost controls

- An empty TARGET_GROUP_IDS is a safe discovery-only state.
- The local filter skips many acknowledgements, link-only messages, media-only messages, and short noise before making a Gemini request.
- The context buffer is limited to CONTEXT_MESSAGES and only exists in process memory.
- Per-group hourly request/reply limits and a reply cooldown are applied in memory. They reset if the worker restarts, so also review usage/quotas in Google AI Studio.
- Only the selected message plus the recent in-memory conversation context for that approved group are included in the Gemini prompt.

## Troubleshooting

- No pairing code: check PAIRING_NUMBER, then inspect Railway logs after restarting the service.
- Code does not work: codes expire; restart the service to request a fresh code. Do not repeatedly restart after a successful link.
- Repeated pairing after every deploy: confirm the volume mount is /app/data and AUTH_DIR is /app/data/auth.
- Group not listed: make sure the linked device is online and a new message arrives in the group after connection.
- No AI decision: verify GEMINI_API_KEY and check for API quota/model errors in logs.
- No message sent: confirm the group JID is in TARGET_GROUP_IDS and DRY_RUN is false.
- Account logged out: the library is unofficial; inspect the logged-out status and re-link only if needed.

## Local syntax check

Use Node.js 20 or newer. Run npm install, then npm run check, then npm start.

Do not upload the data/auth folder, pairing codes, or session credentials to GitHub or share them with anyone.
