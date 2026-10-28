# REMOTE — News-to-preview automation

A preview-first build of REMOTE. It discovers unusual US-oriented news candidates through Google News RSS searches, lets Gemini rank and rewrite source-backed material, searches Openverse and Wikimedia Commons for matching photo candidates, and renders a 1080×1080 PNG in the fixed REMOTE template. Photo lookup is best-effort and cannot block a post from rendering.

## Features

- Netlify static site with serverless endpoints for RSS news discovery, concurrent Openverse/Wikimedia Commons photo search, article text extraction, and same-origin photo loading for canvas export.
- Gemini API key field, connection test, live model list, automatic budget-oriented Flash/Flash-Lite choice, and manual model selection.
- Manual preview generation, browser-tab Auto timer (1–12 hours), step progress, event logs, source details in the validation panel, PNG download and caption copy. Captions are written for readers and include eight relevant hashtags without a Sources block or links.
- Template text fit checks with a larger proportional headline/body type scale and fixed inner margins; eight relevant hashtags are appended to captions. If photo sources time out or return no images, fallback artwork is rendered instead of failing the post.
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

## Sources and photo search

- News discovery currently uses localized Google News RSS search feeds; this is feed discovery, not proof of a claim.
- Article text extraction is best-effort; paywalls, bot protection, publisher HTML changes and redirect restrictions may cause snippet-only retrieval.
- Image search uses a general category query derived from the story (for example, a dinosaur fossil story searches for a museum dinosaur fossil exhibition, not the exact auction/event). It sends no licence, commercial-use, orientation, or minimum-size filters. Creator/source/licence metadata is displayed when the provider supplies it, but it does not control whether a photo is returned.
- Photo results are best-effort: if a source times out, returns no image, or a photo cannot load, the system still renders the post using built-in editorial fallback artwork.
- Gemini outputs are drafts, not independent fact-checking. Read the source links; low-confidence or snippet-only results require extra care.

## Automation boundaries

The browser Auto timer generates a first preview immediately and repeats after the selected interval while the page stays open. Closing the tab/browser stops it. This is intentional in this build: secure unattended scheduling needs server-side credential storage and scheduled functions, which are not wired to the browser-only API key field yet. Facebook publishing is deferred completely. No post is sent to Facebook.

## Tests

GitHub Actions runs `npm test` and `npm run build` on the `remote-news` branch. Runtime API tests require a deployed Netlify URL and a valid Gemini API key; they cannot be proved by a static syntax check alone.

## Current photo search and Gemini model behaviour

- Photo discovery uses generic category/setting queries rather than trying to locate the exact rare event: fossil and skeleton stories search for museum exhibits, auctions for auction-house scenes, legal stories for courtrooms, and so on. Openverse and Wikimedia Commons are queried concurrently. There is no landscape, minimum-size, commercial-use, or licence eligibility filter; portrait images can be cropped into the square card. Public HTTPS URL validation remains in place for safe image loading.
- The image endpoint tries both providers in parallel and returns all supported photo candidates regardless of the licence metadata reported. It includes source/creator/licence details when available. If both sources time out or return no images, the renderer still produces a complete square post with a designed fallback visual. The badge sits below the yellow panel with an intentional gap.
- Gemini model discovery refreshes automatically when the site loads. The model list is cached in local storage, and the last model that successfully returns valid JSON is remembered. Each request tries that model first in Auto mode and falls back through other listed text-generation models if necessary. This cache does not bypass account quotas or restore a missing API key.
- Use the remote-news branch as the Netlify production branch; the main branch is unchanged.
