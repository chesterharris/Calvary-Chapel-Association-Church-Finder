# CCA Finder: YouTube Live Detection — Findings & Plan

Living reference doc. Updated as we make decisions. Started 2026-08-18.
Updated 2026-08-18 with a better primary signal found in the full page HTML.

---

## 1. The core detection technique (confirmed empirically, twice)

**Method:** Take any church's YouTube channel URL and append `/live`
(e.g. `https://www.youtube.com/@CCChinoValley/live`). Fetch that URL's raw
HTML.

### Primary signal (preferred): schema.org structured data in `<head>`

Confirmed present on a real live page, near the top of the document:

```html
<span itemprop="publication" itemscope itemtype="http://schema.org/BroadcastEvent">
  <meta itemprop="isLiveBroadcast" content="True">
  <meta itemprop="startDate" content="2026-08-19T03:08:52+00:00">
</span>
```

This is official schema.org SEO markup - search engines rely on it, so
YouTube has strong incentive to keep it stable, more so than an internal
JS variable meant only for their own player. It's also small and appears
early in the document, rather than buried in a huge minified JSON blob.

**The check:** does the raw HTML contain
`itemprop="isLiveBroadcast" content="True"`?
- Found it → currently live (and `startDate` tells us exactly when the
  broadcast began, in ISO 8601 - e.g. good enough to show "Live for 47
  minutes")
- Not found → not live

On a NOT-live page, this entire `<span itemprop="publication">...</span>`
block doesn't exist at all (consistent with what we found earlier: a
not-live page has no video-related data at all, since there's no active
video to describe).

### Backup/cross-check signal: `ytInitialPlayerResponse` JSON blob

Also confirmed present on the same live page, further down in a
`<script>` tag:

```json
"videoDetails": { "isLive": true, ... }
```

**The check:** does the raw HTML contain `"isLive":true`?
- Found it → currently live
- Not found → not live

This was our first confirmed signal (from an earlier, smaller test file)
and still works, but the schema.org approach above is preferred as the
primary check - this one is a documented fallback/cross-check if we ever
want extra confidence, or if the schema.org markup ever changes
unexpectedly.

### Minimal Worker code (primary approach)

```javascript
async function checkChurchLive(youtubeUrl) {
  const liveUrl = buildLiveUrl(youtubeUrl); // normalize @handle/streams/etc → @handle/live
  const response = await fetch(liveUrl);
  const html = await response.text();
  const isLive = html.includes('itemprop="isLiveBroadcast" content="True"');
  if (!isLive) return { isLive: false };

  const canonicalMatch = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([^"]+)">/);
  const startDateMatch = html.match(/itemprop="startDate" content="([^"]+)"/);
  return {
    isLive: true,
    videoId: canonicalMatch ? canonicalMatch[1] : null,
    startDate: startDateMatch ? startDateMatch[1] : null
  };
}
```

That's the entire live/not-live check plus the two most useful extra
pieces of data (video ID and start time). Everything else (looping over
churches, caching, UI) builds on top of it.

---

## 2. Other useful data available

Confirmed present via two different real test fetches (the earlier
player-response-only snippet, and now the full page HTML):

| Field | Where found | Example value | Notes |
|---|---|---|---|
| `videoId` | `<link rel="canonical">` (simplest) or `ytInitialPlayerResponse` | `k18pfj5LNvg` | Canonical link is the cleaner source - no JSON parsing needed |
| Channel name | `videoDetails.author` (JSON) | `moneycontrol` | |
| Video title | `<meta property="og:title">` or `videoDetails.title` | | Open Graph version is simpler to extract |
| Video description | `<meta property="og:description">` | | |
| Thumbnail | `<meta property="og:image">` or predictable URL pattern | `https://i.ytimg.com/vi/{videoId}/maxresdefault.jpg` | Don't need to parse anything - URL is predictable once you have `videoId` |
| Broadcast start time | `<meta itemprop="startDate">` | `2026-08-19T03:08:52+00:00` | ISO 8601, from the schema.org block - lets us show "Live for N minutes" |
| Viewer/interaction count | `videoDetails.viewCount` (JSON) or `<meta itemprop="userInteractionCount">` paired with `interactionType...WatchAction` | e.g. `1469` or `4078` | For a live video this reflects concurrent viewers ("watching now"), not lifetime views |
| Like count | `<meta itemprop="userInteractionCount">` paired with `interactionType...LikeAction` | e.g. `13` | Probably not useful for our purposes, noted for completeness |

### What's NOT available via simple fetch

The "251 watching now" element you originally found
(`<div id="view-count" class="...ytd-watch-info-text">`) is a
**client-side rendered web component** - filled in by YouTube's own
JavaScript after the page loads in a real browser. A plain `fetch()` (no
browser, no JS execution) sees that div **empty**. Use `viewCount` or the
`userInteractionCount`/`WatchAction` pair from the structured data instead
- same underlying number, reached a different way.

Similarly, no channel "brand graphic"/banner image was found anywhere in
the raw HTML - that's also a client-rendered UI element, not present in
the initial page source.

---

## 3. Architecture plan (revised 2026-08-18 - switched from manual button to automatic cron)

- **Fully automatic, zero user interaction required.** A Cloudflare Cron
  Trigger runs on a fixed schedule (proposed: every 10 minutes),
  independent of site traffic. It checks every `livestreamsEnabled`
  church's `/live` page and writes results to KV.
  - This replaces an earlier "manual Check for Live Streams button" idea.
    The button existed to solve a cost/throttling problem that mattered
    for the official YouTube API (quota-limited) but barely applies to
    our free scraping approach - a fixed schedule is simpler and gives a
    zero-click experience.
  - Cloudflare Cron Trigger facts confirmed: free plan allows up to 3
    cron schedules per Worker (we need 1); minimum interval is 1 minute,
    so every 10 minutes is well within range; each run counts as a single
    request against the 100,000/day free allowance (144/day at a 10-min
    interval - trivial); the same 50-subrequest-per-invocation cap still
    applies per run, comfortably covering under-50 churches.
- **Visitors never trigger a live check.** Page load just reads whatever
  is currently cached in KV (a fast, ordinary GET) - no YouTube requests
  happen because someone opened the site. This keeps automated request
  volume to YouTube bounded and predictable (one check cycle per cron
  tick, regardless of how much site traffic there is).
- **UI appears automatically, with no click needed.** If the latest cron
  run found 1+ churches live, the header trigger, pulsing pins, and side
  panel are all available immediately on page load. If nothing is live,
  no live-related UI appears at all.
- **Freshness tradeoff:** a stream that just went live may take up to
  ~10 minutes to appear (bounded by the cron interval). Reasonable
  tradeoff for a fully automatic, zero-interaction experience.
- **Two new fields per church record** (already built, live in production):
  - `youtubeUrl` — shown to all visitors regardless of live status
  - `livestreamsEnabled` — checkbox; only churches with this checked get
    included in the cron's check cycle
- **Scale:** Under 50 churches expected to have YouTube channels — well
  within Cloudflare's 50-subrequest-per-invocation limit, so no batching
  across multiple cron runs needed for now.
- **No timezone math needed for detection.** A livestream's on/off state
  is the same real-world fact for every visitor regardless of timezone.
  Cron Triggers themselves also only run in UTC with no per-trigger
  timezone option, which is irrelevant here since "every 10 minutes,
  all day" doesn't need timezone awareness at all.

### UI/UX decisions (confirmed 2026-08-18)

- **Side panel**, reusing the same visual pattern as the existing "Manage
  Locations" panel — a grid of cards, one per currently-live church.
- **Pulsing map pins** for any church currently live, shown at the same
  time as the panel (independent visual reinforcement, not exclusive to
  the panel being open).
- **Lightweight header trigger**: something like "🔴 3 churches live now"
  as the button/alert that opens the side panel - not the full grid
  itself. The panel is where the rich content (thumbnails, descriptions)
  lives; the header trigger stays simple.
- **Each card links back to the map**: clicking a card both opens the
  YouTube video AND pans/zooms the map to that church's pin - reinforcing
  that this is a map tool, not a disconnected video directory.
- **Card contents, each based on data already confirmed available**
  (see section 2):
  - Thumbnail (predictable `i.ytimg.com` URL from `videoId`)
  - Channel name (`author` / og:title's channel context)
  - Video title
  - Description, truncated to a capped character count (exact number
    TBD - default suggestion: ~120 characters with an ellipsis, to
    handle churches that write long descriptions)
  - **"Live for NN minutes"** - computed from `startDate` vs. current
    time. This was called out as a particularly valuable feature: lets a
    visitor compare a just-started stream (Channel A) against one that's
    nearly over (Channel B) and choose accordingly.
  - View count (from `viewCount` / `userInteractionCount` WatchAction)
- **Sort order**: newest-live-first (churches that just started
  streaming appear at the top of the grid).
- **"Live for NN minutes" keeps ticking upward in real time** while the
  panel is open, via cheap client-side math against the stored
  `startDate` - no extra server calls needed, just a local timer
  re-rendering the elapsed-time text every so often (e.g. every 30-60
  seconds is plenty; per-second is unnecessary for a "minutes" level of
  precision).

---

## 4. Open questions / not yet decided

- [x] ~~Exact UI treatment~~ → Resolved: side panel + pulsing pins +
  lightweight header trigger (see section 3)
- [x] ~~Whether to surface viewCount~~ → Resolved: yes, shown on each card
- [x] ~~Whether to show the video thumbnail~~ → Resolved: yes, on each card
- [x] ~~Sort order~~ → Resolved: newest-live-first
- [x] ~~Live-updating duration~~ → Resolved: yes, client-side ticking math
- [x] ~~Trigger mechanism~~ → Resolved: automatic Cloudflare Cron Trigger
  every ~10 minutes, no button, no required user interaction
- [ ] Exact cron interval to use (10 minutes proposed - could be tuned
  once live)
- [ ] Exact description truncation length (default suggestion: ~120
  characters, adjustable)
- [ ] Exact endpoint name/shape for the cron job and the public
  read-cached-status endpoint
- [ ] How to normalize whatever URL format an admin pastes in
  (`@handle`, `@handle/streams`, `/channel/UC.../`) into the correct
  `/live` URL to check
- [ ] Exact visual style for the pulsing pin animation
- [ ] Exact copy/style for the header trigger (e.g. "🔴 3 churches live
  now" vs. some other wording)

---

## 5. Risks / caveats (carried over from earlier discussion, updated for the cron model)

- This relies on YouTube's page structure, not an official/documented
  API. The schema.org microdata approach (our primary signal) is
  meaningfully more stable than the internal JS variable, since it's
  public SEO markup search engines depend on - but it's still not a
  guaranteed, versioned contract the way a real API would be.
- Heavy/rapid automated requests can get rate-limited by YouTube (we hit
  a 429 ourselves during testing with just a couple of fetches in quick
  succession). The automatic cron model bounds this nicely: exactly one
  check cycle (up to ~50 fetches) every 10 minutes, regardless of site
  traffic - this is a predictable, modest request pattern rather than
  something that could spike with visitor volume.
- Cron Triggers have no built-in retry if a scheduled run fails or times
  out - worth keeping in mind, though a single missed cycle just means
  the cached data is up to ~20 minutes stale instead of ~10, not a
  serious failure mode for this feature.
