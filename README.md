# REMOTE — News-to-preview automation

A preview-first build of REMOTE. It discovers unusual US-oriented news candidates through Google News RSS searches, lets Gemini rank and rewrite source-backed material, searches Openverse for wide photographs under commercially usable licences, and renders a 1080×1080 PNG in the fixed REMOTE template.

## Features

- Netlify static site with serverless endpoints for RSS news discovery, Openverse search, article text extraction, and same-origin photo loading for canvas export.
- Gemini API key field, connection test, live model list, automatic budget-oriented Flash/Flash-Lite choice, and manual model selection.
- Manual preview generation, browser-tab Auto timer (1–12 hours), step progress, event logs, source links, photo attribution/licence links, PNG download and caption copy.
- Template text fit checks and one AI rewrite attempt if the headline/paragraph exceeds the target.
- No Facebook credentials or publishing code in this version.

## Run locally

Requires Node.js 22+. From the repository root:

```sh
npm test
npm run build
npx netlify-cli dev
```

Open the local URL printed by Netlify Dev. Do not open `index.html` as a `file://` URL, because Netlify functions will not exist there.

## Deploy to Netlify

1. In Netlify, choose **Add new site → Import an existing project**.
2. Connect GitHub and choose `sarada2000sd/Whatsapp_bot`.
3. Choose branch `remote-news`.
4. Build command: `npm run build`; publish directory: `dist`. Functions directory is configured as `netlify/functions` in `netlify.toml`.
5. Deploy the site, then test **Check news feeds**, **Refresh models**, **Test Gemini**, and **Generate preview**.

A deployed site is not created automatically by a GitHub commit. The Netlify account owner must connect/import the branch once.

## Gemini key and model choice

Paste a Gemini API key in the website Settings panel. The browser calls Google's Gemini API directly and only saves the key in the current tab session by default. Checking **Remember key in this browser** stores it in browser local storage. Clearing site data or using a different browser removes the local saved copy. A key entered into browser storage is not safe for a public shared computer or a public multi-user product. Use a restricted key and review your Google AI Studio quota/billing settings.

The model selector fetches the models currently available to that key, filters to models supporting `generateContent`, and excludes image/audio/embedding/special-purpose models. AUTO prefers an available Flash-Lite identifier and then a stable Flash model. The Models API does not identify which models will be free on a user's account, and availability, quotas and billing can change. Confirm usage in Google AI Studio.

## Sources and photo licensing

- News discovery currently uses localized Google News RSS search feeds; this is feed discovery, not proof of a claim.
- Article text extraction is best-effort; paywalls, bot protection, publisher HTML changes and redirect restrictions may cause snippet-only retrieval.
- Image search calls Openverse with commercial-use, wide, large-photo filters and a second whitelist for `CC0`, public-domain, `CC BY`, and `CC BY`. CC BY-SA is excluded by default to avoid ShareAlike obligations in branded graphics. Always open the original landing/licence links before using a photo. Openverse metadata is not a legal guarantee.
- The system refuses to render a photo if it cannot find an eligible result or proxy/render the image.
- Gemini outputs are drafts, not independent fact-checking. Read the source links; low-confidence or snippet-only results require extra care.

## Automation boundaries

The browser Auto timer generates a first preview immediately and repeats after the selected interval while the page stays open. Closing the tab/browser stops it. This is intentional in this build: secure unattended scheduling needs server-side credential storage and scheduled functions, which are not wired to the browser-only API key field yet. Facebook publishing is deferred completely. No post is sent to Facebook.

## Tests

GitHub Actions runs `npm test` and `npm run build` on the `remote-news` branch. Runtime API tests require a deployed Netlify URL and a valid Gemini API key; they cannot be proved by a static syntax check alone.

## Current photo search and Gemini model behaviour

- Photo discovery queries Openverse without restrictive size, aspect-ratio, category, or licence query parameters. Returned assets are locally checked for HTTPS URLs, landscape orientation when dimensions are known, and reusable CC0/Public Domain/CC BY/CC BY-SA licences.
- If Openverse has a 5xx response or returns too few usable photos, the Netlify function searches Wikimedia Commons through its public API without an API key. Results include the file page, creator and licence information for attribution. The renderer crops landscape images to fit the square template.
- Gemini model discovery refreshes automatically when the site loads. The model list is cached in local storage, and the last model that successfully returns valid JSON is remembered. Each request tries that model first in Auto mode and falls back through other listed text-generation models if necessary. This cache does not bypass account quotas or restore a missing API key.
- Use the remote-news branch as the Netlify production branch; the main branch is unchanged.
