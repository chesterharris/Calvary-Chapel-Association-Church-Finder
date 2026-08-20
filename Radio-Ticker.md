# Radio Ticker — Brainstorm Notes

## Goal
Add a second scrolling ticker to `https://cca-finder.calvary.workers.dev/`, alongside the existing Conferences ticker, showing "now playing" info for a set of CCA-affiliated radio stations.

Format:
```
<Call Sign 1> - <Now Playing> | <Call Sign 2> - <Now Playing> | <Call Sign 3> - <Now Playing>
```
- Each "Now Playing" segment links out to the station's page.
- Reuse logic/patterns from the existing Conference ticker (Worker-side proxy fetch) wherever possible.

## Candidate Stations (all on SecureNetSystems "Cirrus" streaming platform)
| Call Sign | URL |
|---|---|
| EQUIPFM | https://streamdb9web.securenetsystems.net/v5/EQUIPFM |
| WIAM | https://streamdb3web.securenetsystems.net/cirruscontent/WIAM |
| DOVEFM | https://streamdb7web.securenetsystems.net/cirrusencore/DOVEMAIN |

Note: URL path patterns differ slightly per station (`v5/`, `cirruscontent/`, `cirrusencore/`) — different template variants, or just station config, unclear yet.

## What We Know
- All three run on SecureNetSystems, a shared radio streaming/hosting platform — likely means one parsing approach could work across all three if the "now playing" data is exposed the same way.
- Direct fetch of these station URLs from Claude's own tools is blocked by `robots.txt` (`ROBOTS_DISALLOWED`). This doesn't block the Cloudflare Worker itself, but means Claude can't independently inspect these pages right now — need Larry to supply raw HTML / network captures.
- Many "now playing" widgets on platforms like this populate the song/artist via a client-side JS call to a separate JSON/XML endpoint *after* page load, rather than baking it into the initial HTML. If that's the case here, scraping outer HTML won't work — we'd need to find and call the inner data endpoint directly (which is usually actually easier once identified).

## Findings from Page Source Review (EQUIPFM + WIAM)

Confirmed by reviewing raw view-source HTML for both stations:

- **Now-playing data is NOT in the raw HTML.** The markup is just an empty shell:
  ```html
  <div id="now-playing" class="now-playing tS " aria-live="polite" aria-atomic="true">
      <div id="now-playing-title" class="menuHeader f15em" role="heading" aria-level="2"></div>
      <div id="now-playing-artist"></div>
      <div id="now-playing-album"></div>
  </div>
  ```
  Song/artist text gets filled in later by client-side JavaScript. **A simple HTML scrape (like the Conference ticker uses) will not work for this** — there's nothing there yet at fetch time.
- Both stations load the **same core script**: `/cirruscore/cirruscore_v2.js`, plus a per-station bundle (`v5.min.js` for EQUIPFM, `v9.min.js` for WIAM) — both minified, so the actual polling endpoint URL isn't visible in plain view-source.
- Both pages are otherwise structurally identical (same template, same `#now-playing` / `#now-playing-title` / `#now-playing-artist` / `#now-playing-album` IDs) — just different config values:
  - `stationCallSign` ("EQUIPFM" vs "WIAM")
  - `stationCallUrl` (matches each station's own `streamdbXweb` subdomain)
  - `playSessionID` — a per-session token generated on page load (e.g. `1AEE2964-B3AD-C11C-DDDB1585BC0EA2F2`). **Open question**: does the now-playing polling endpoint require a valid session ID? If so, our Worker may need to fetch the page first to obtain one before it can query now-playing data — adds a step to the design.
  - This strongly suggests **one parser will work for all 3 stations** once we find the polling endpoint shape.

## Now-Playing Endpoint — CONFIRMED (EQUIPFM)

Network tab capture confirmed the polling endpoint. It's a **plain public XML feed, no auth, no session required**:

```
Request URL: https://streamdb9web.securenetsystems.net/player_status_update/EQUIPFM.xml?randStr=0.4238273060794583

Response:
<?xml version="1.0" encoding="UTF-8"?>
<playlist>
    <DCSoutputVersion>2</DCSoutputVersion>
    <stationCallSign>EQUIPFM</stationCallSign>
    <programType>PGM</programType>
    <mediaType>AUD</mediaType>
    <title>Time In The Word - Wednesday</title>
    <artist>Troy Warner</artist>
    <album></album>
    <cover></cover>
    <duration>1549</duration>
    <campaignId></campaignId>
    <fileId></fileId>
    <clickURL><![CDATA[]]></clickURL>
    <programStartTS>19 Aug 2026 23:00:28</programStartTS>
    <adBlockPos></adBlockPos>
</playlist>
```

**Pattern**: `https://{subdomain}/player_status_update/{CALLSIGN}.xml?randStr={cache-buster}`

This is much simpler than the Conference ticker's HTML div-scanning — clean structured XML, just need `<title>` and `<artist>`. `randStr` appears to be a plain cache-busting float; likely any value (or omitting it) works, but worth confirming.

Predicted endpoints for the other 2 stations (unconfirmed — same subdomain per station as seen in their page source):
- WIAM: `https://streamdb3web.securenetsystems.net/player_status_update/WIAM.xml?randStr=<random>`
- DOVEFM: `https://streamdb7web.securenetsystems.net/player_status_update/DOVEMAIN.xml?randStr=<random>` (using `DOVEMAIN` — the call sign from the original station URL path, not `DOVEFM`; needs confirming against that page's actual `stationCallSign` JS variable)

**Note**: Claude's own web_fetch tool is blocked from this domain by `robots.txt` and cannot self-verify these — confirmation must come from Larry via browser/Worker, since Workers aren't bound by robots.txt.

## Now-Playing Endpoint — CONFIRMED FOR ALL 3 STATIONS

Pattern fully confirmed: `https://{subdomain}/player_status_update/{CALLSIGN}.xml?randStr={cache-buster}`

| Station | Endpoint |
|---|---|
| EQUIPFM | `https://streamdb9web.securenetsystems.net/player_status_update/EQUIPFM.xml?randStr=...` |
| WIAM | `https://streamdb3web.securenetsystems.net/player_status_update/WIAM.xml?randStr=...` |
| DOVEFM | `https://streamdb7web.securenetsystems.net/player_status_update/DOVEMAIN.xml?randStr=...` — call sign in URL/XML is `DOVEMAIN`, not `DOVEFM` |

**Important wrinkle discovered**: `<artist>` is not always populated.
- EQUIPFM (talk, but had a specific segment) → title: "Time In The Word - Wednesday", artist: "Troy Warner"
- WIAM (teaching program) → title: "ENDURING WORD DAILY_", artist: **empty**
- DOVEFM (music) → title: "No Shame (feat The Young Escape)", artist: "Tenth Avenue North", album: "Single"

So display logic must handle both cases:
- If artist present → `"{title} - {artist}"` or similar
- If artist empty → just `"{title}"`, no dangling separator

Also noted: WIAM's title has a trailing underscore (`ENDURING WORD DAILY_`) — likely a quirk of that station's own data entry, not something to "fix," just display as-is (or optionally trim trailing underscores/whitespace defensively).

## Conference Ticker Refresh Pattern — CONFIRMED (from src/index.js)

Reviewed the actual `handleConferences()` function. The pattern to reuse:

- **Cloudflare's edge Cache API** (`caches.default`) — NOT KV, NOT a Cron Trigger. Lazy/on-demand: first request after cache expiry triggers a live fetch + parse; every request after that just reads the cached Response object until it expires.
- **Cache duration**: `CACHE_SECONDS = 6 * 60 * 60` (6 hours) — appropriate for conference listings, which rarely change.
- **Cache-busting via version constant**: `CACHE_VERSION` gets baked into the cache key (`cacheUrl.searchParams.set('cacheVersion', ...)`). Bumping this constant guarantees a fresh cache key any time the parsing logic changes, so a fix is never masked by a stale cached response.
- **Graceful failure**: if the upstream fetch/parse fails, it still returns valid JSON (`conferences: []` + an `error` field) instead of throwing — so the ticker just renders empty instead of breaking the page.
- Sets a custom `User-Agent` header on the outbound fetch (`'Mozilla/5.0 (compatible; CCA-Map-Ticker/1.0)'`).

**For radio**: same Cache API pattern, same graceful-failure shape — but cache duration must be MUCH shorter than 6 hours, since now-playing data changes every few minutes (segments observed ran ~3-26 min based on `duration` field in the XML samples). Something in the **15-30 second** range would keep the ticker feeling live without hammering the upstream endpoint on every single page view. Needs Larry's sign-off as a decision.

**Confirmed by Larry**: Conference data is stable for a week or more between updates (matches the 6-hour cache being more than generous). Radio now-playing data changes frequently (every few minutes as songs/segments change) — reinforces that a much shorter cache TTL (~15-30s) is the right call for the radio ticker, in sharp contrast to the conferences' 6-hour TTL.

## Now-Playing Endpoint — 4th Station Confirmed (REVIVE FM)

| Station | Endpoint |
|---|---|
| REVIVE FM | `https://streamdb8web.securenetsystems.net/player_status_update/KEPHLP.xml?randStr=...` — call sign in URL/XML is `KEPHLP`, not "REVIVE FM" |

Sample response confirms same shape as the others (title: "J Vernon McGee", artist: "Various"). Further validates the config-array approach — 4 stations now confirmed all working identically off this one endpoint pattern, each just needing its own {subdomain, call sign, display name} triplet.

## Multi-Platform Consideration (IMPORTANT — future-proofing)

Larry flagged: not all future stations will be on SecureNetSystems. Some may use **streamon.fm** or **Live365.com** or other platforms, each with their own (currently unknown) data format/endpoint shape.

**Design implication**: the config array needs a `provider` field per station, and the Worker needs a small registry of provider-specific fetch+parse functions (e.g. `securenetsystems`, `streamon`, `live365`), each normalizing its own station's raw response into a common shape: `{ title, artist }`. The ticker-rendering code only ever deals with that common shape — it doesn't need to know or care which provider a given station uses. This mirrors good separation-of-concerns and means adding a new provider later only means writing one new parser function, not touching the ticker UI or rendering logic at all.

We don't have sample data for streamon.fm or Live365 yet — that's a future step whenever an actual station on one of those platforms is added.

## Answers Locked In

- **#6 Now Playing link/interaction** — Larry does NOT want visitors whisked away to another site; wants them to be able to keep listening while exploring the map. Comparison point: the existing "Live Now" YouTube panel in the app. Options discussed:
  - **Persistent bottom mini-player bar** (Spotify/Apple Music Web style) — slim bar pinned to bottom of viewport, doesn't reduce visible map area at all, contains station name / play-pause / stop / close (✕) / station switcher.
  - **Slide-in side panel**, matching the existing Live Now YouTube panel pattern for consistency — trade-off: costs horizontal map real estate.
  - **Floating expandable widget/bubble** — most compact when idle, but more net-new custom UI to build.
  - **Still open**: need to know how the existing Live Now YouTube panel behaves (bottom sheet vs. side drawer vs. something else) to decide whether Option A and "reuse Live Now pattern" are the same thing, or a genuine choice between two different UI approaches.
- **#7 Call sign display** — CONFIRMED: show **"DOVE FM"** as the display label, even though the technical call sign / endpoint identifier is `DOVEMAIN` (an internal setup quirk, not meant to be public-facing). Same logic applies to any other station where the technical `stationCallSign` differs from the intended public name (e.g. REVIVE FM's technical call sign is `KEPHLP`).
- **#8 UI placement** — CONFIRMED: new row below the Conferences ticker. Same scroll speed as Conferences to start. Scrolling ticker if there are enough stations to need it; if 3 or fewer, static display without scroll may suffice — but build for scrolling now since Larry expects to add more stations over time (future-proofing).
- **#9 Extensibility** — CONFIRMED: simple config array, Larry's preference matches original recommendation.
- **#10 `randStr` param** — CONFIRMED unnecessary. Endpoint returns identical data without it. Simplifies the Worker's fetch code (no need to generate/append a random value).
- **#11 Empty-artist format** — CONFIRMED: title alone, no dash, when artist is empty (as originally proposed).

## Live Now YouTube Panel — Reviewed (from index.html)

Confirmed via CSS in `index.html`:
```css
.side-panel {
  position: fixed;
  top: 0;
  right: 0;
  height: 100%;
  width: 320px;
  max-width: 88vw;
  ...
}
```
It's a **full-height right-side slide-in drawer** — 320px wide, but up to 88vw on mobile (i.e. nearly the entire screen width on a phone). Good fit for its actual job (browse a list of live YouTube streams, tap one, get sent off to YouTube — a brief, one-time selection). Poor fit for "stay open while exploring the map," since on mobile it would cover almost the whole map.

## Listening UI — CONFIRMED (single-stage, no side panel)

Larry confirmed the mockup: **no side panel at all, anywhere in this design.** The earlier "reuse the Live Now side-panel as a station picker" idea (see prior draft of this doc) is dropped entirely — noting that explicitly here since it caused confusion once and shouldn't resurface.

Final confirmed interaction:
- The radio ticker (scrolling row of station names/now-playing text) IS the station list — no separate list UI anywhere.
- Tapping a station's segment directly within the ticker launches the bottom mini-player bar for that station.
- The mini-player bar is a small, full-width bar pinned to the bottom of the page — play/pause, station name + current title/artist, close (✕). Tapping a different ticker segment while it's open swaps which station is playing.
- The ticker itself is otherwise unchanged — still always visible, still scrolling, just with clickable segments now.

This is the final, locked-in design for the listening interaction.

## Open Questions (need Larry's input)
1-5, 7, 9, 10, 11. ~~DONE~~ (see Decisions Log / Answers Locked In above).
6. ~~Confirm listening UI~~ — DONE, confirmed by Larry. Ticker + bottom mini-player bar only, no side panel.
8. ~~UI placement~~ — DONE. New row below Conferences ticker, same scroll speed. **Scroll-vs-static resolved**: always scroll — with 4 stations already confirmed (EQUIP FM, WIAM, DOVE FM, REVIVE FM), the "3 or fewer" static threshold is already moot, and always-scrolling is simpler to build and matches Larry's expectation of adding more stations over time.
12. **[NEW]** Multi-platform provider abstraction — no action needed yet (no streamon.fm/Live365 station sample data exists yet), but flagged as a design requirement so the initial build doesn't hardcode SecureNetSystems-only assumptions into the parsing layer.

## Decisions Log
- **Now-playing data source**: use the `/player_status_update/{CALLSIGN}.xml` endpoint directly, NOT HTML scraping of the station page. Confirmed public, no auth needed, works identically for all 4 stations confirmed so far.
- **Parsing approach**: simple XML field extraction (`<title>`, `<artist>`) — no need for the Conference ticker's div-depth-scanner approach, since this source is clean structured XML rather than messy nested HTML.
- **`randStr` param is unnecessary** — confirmed by Larry, endpoint works identically without it. Simplifies Worker fetch code.
- **Call sign note**: display labels are intentionally decoupled from technical/API call signs. DOVE FM displays as "DOVE FM" despite technical identifier `DOVEMAIN`; same pattern applies station-by-station (e.g. REVIVE FM shows "REVIVE FM" despite technical identifier `KEPHLP`).
- **Display logic must handle missing `<artist>` gracefully** — confirmed: title alone, no separator, when artist is empty.
- **Caching architecture**: reuse the Conference ticker's `caches.default` + versioned-cache-key + graceful-failure pattern. Cache TTL for radio should be much shorter (proposed: 15-30s) than the Conferences' 6-hour TTL — confirmed reasonable given Larry's note that conference data is stable for a week+ while radio now-playing changes every few minutes.
- **Config-driven station list**: confirmed as the approach — each station entry will need at minimum: `{ provider, subdomain, technicalCallSign, displayName }` to support both the current SecureNetSystems stations and future non-SecureNetSystems stations.
- **Multi-platform support**: architecture must include a `provider` field + per-provider parser function registry, normalizing all providers' data into a common `{ title, artist }` shape before it reaches the ticker rendering logic. This is a forward-looking requirement, not yet implemented since no sample data exists for non-SecureNetSystems platforms.
- **UI placement**: new ticker row below the existing Conferences ticker, same scroll speed to start.

## Next Steps
- ~~Larry to supply raw HTML + Network tab findings for the 3 station pages~~ — DONE.
- ~~Confirm endpoint/parsing approach~~ — DONE.
- ~~Decide caching/refresh strategy~~ — DONE.
- ~~Resolve all open UI/design questions~~ — DONE, all 12 items resolved.
- **Brainstorm complete — ready to move to implementation.**

## Build Summary (everything needed to start coding)

- **Data source**: `GET https://{subdomain}/player_status_update/{callSign}.xml` (no `randStr` needed). Parse `<title>` and `<artist>`.
- **Stations config array** (4 confirmed so far, each needs: provider, subdomain, technical call sign, display name):
  | Display Name | Provider | Subdomain | Technical Call Sign |
  |---|---|---|---|
  | EQUIP FM | securenetsystems | streamdb9web.securenetsystems.net | EQUIPFM |
  | WIAM | securenetsystems | streamdb3web.securenetsystems.net | WIAM |
  | DOVE FM | securenetsystems | streamdb7web.securenetsystems.net | DOVEMAIN |
  | REVIVE FM | securenetsystems | streamdb8web.securenetsystems.net | KEPHLP |
- **Caching**: reuse `handleConferences()`'s `caches.default` + versioned-cache-key + graceful-failure pattern from `src/index.js`, with a short TTL (~15-30s) instead of 6 hours.
- **Parsing**: simple XML field extraction, no div-scanning needed. Handle empty `<artist>` by showing title alone, no separator.
- **Display**: new ticker row below Conferences ticker, same scroll speed, always scrolling (no static fallback).
- **Interaction**: each ticker segment is clickable/tappable. Click launches a persistent bottom mini-player bar (station name, current title/artist, play/pause, close ✕). Clicking a different segment while the bar is open swaps the active station. No side panel involved anywhere in this feature.
- **Extensibility**: config-driven station array; future non-SecureNetSystems stations (streamon.fm, Live365, etc.) will need a `provider`-keyed parser registry, normalizing everything to `{ title, artist }` before it reaches the ticker/render logic — not yet needed since no such station exists yet, but the data shape should anticipate it from the start.
