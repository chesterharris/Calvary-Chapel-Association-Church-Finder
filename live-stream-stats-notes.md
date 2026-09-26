# live-stream-stats-notes.md

Design notes for the internal "Live Stream Activity" tracking feature (built
2026-09-25), so the reasoning behind the storage shape and the two charts
doesn't have to be reconstructed from the diff later.

---

## What this is

Larry asked to start tracking, internally, how many churches are
concurrently live at once, with timestamps, and to surface a rolling
graph of that at the bottom of the Live Now pane - visible to every
visitor, even when nothing is currently live. Requirements settled across
a short back-and-forth:

- Primary metric: **number of churches (locations) simultaneously live**,
  not view count. This is the literal count already used everywhere else
  on the site (the "N Live Now" header, the live list) - nothing new is
  being detected, just recorded over time.
- Bonus metric: **summed concurrent viewer count across those live
  churches** ("340 people watching across those 5"). Added after Larry
  liked the idea when it was raised as a follow-up question.
- Two charts, not one, stacked (not a toggle - "so 2 charts"):
  - **Today**: peaks and valleys from local 12:00 AM to now, clearing out
    at midnight.
  - **Last 7 Days**: a true *rolling* trailing 7-day window, explicitly
    NOT a calendar-week reset ("Let's start with a true rolling
    most-recent-7-days and see how that works").
- Both charts read from the same underlying sample array - "Today" is
  just that array filtered to the visitor's own local midnight-to-now,
  "Last 7 Days" is the whole window. No separate storage or cron path per
  chart.

## Storage shape

One new KV key, `LIVE_STREAM_STATS_KV_KEY` (`'live-stream-stats'`),
holding:

```json
{
  "samples": [ { "t": "<ISO timestamp>", "count": 3, "viewers": 214 }, ... ],
  "allTimePeak": { "count": 8, "viewers": 502, "t": "<ISO timestamp>" }
}
```

- `samples` is appended to once per existing ~2-min cron cycle (see
  `checkAllChurchesLive` in `src/index.js`), using the exact same
  `liveOnly` array the public `live-status` snapshot is built from in
  that same cycle - `count = liveOnly.length`, `viewers` = sum of each
  live church's scraped `viewCount` (null/non-numeric treated as 0, never
  breaking the sum). Because it's the same array, the chart can never
  disagree with what a visitor sees in the live list itself.
- Samples older than `LIVE_STREAM_STATS_RETENTION_MS` (7 days) are
  trimmed off the *front* of the array every cycle, right after the new
  sample is pushed - at a 2-min cadence that's ~5,040 retained samples
  at steady state.
- `allTimePeak` is a separate, **never-trimmed** record that only ever
  moves forward when a new sample's count strictly beats (not ties) the
  stored one. This deliberately survives the weekly trim of `samples` -
  verified in isolation (see "Testing" below) that a planted spike still
  reads back correctly as the peak days after its own sample has scrolled
  out of the retained window.

Read/write pattern (read-parse-push-trim-write) mirrors the existing
`LIVE_CHECK_DEBUG_KV_KEY` history array already in the codebase, just with
a much larger retention window (7 days of 2-min samples vs. 50 cycles).

New public endpoint: `GET /api/live-stream-stats`, following the exact
same "read whatever the last cron cycle cached, no YouTube requests, safe
to poll every page load" pattern as the existing `handleGetLiveStatus` /
`/api/live-status`.

## Frontend

Two hand-rolled inline SVG line charts (no chart library, matching the
site's existing dependency-free style) - always rendered, even at 0
concurrent streams, per the same "always show the real number" call
already made for the "0 Live Now" header case elsewhere in this pane.

**Layout**: lives in `#liveStreamStatsSection`, a sibling of `#liveNowList`
inside a shared wrapper, `#liveNowScrollArea` (`flex: 1; overflow-y:
auto;`), rather than nested inside `#liveNowList` or docked as its own
separately-scrolling footer. Both moved out from under `#liveNowList`'s
own scroll/max-height so the whole panel - the live list, then the charts
- scrolls as one continuous area, with the charts landing as the last
thing a visitor reaches, not boxed into a small pane-within-a-pane. This
replaced an earlier layout where the charts sat in their own docked,
independently-scrolling footer below the (also independently-scrolling)
live list - which Larry flagged as needing "a keyhole" of scrolling on
mobile to see past. They're kept as siblings rather than nesting the
charts inside `#liveNowList` because `renderLiveNowList()` replaces that
element's entire `innerHTML` on every refresh/poll/filter-change, which
would otherwise wipe out the chart markup along with it.

Key decisions:

- **Bucketing/labeling happens in the visitor's own local time**, not a
  fixed server timezone - the raw `t` timestamps are stored as UTC/ISO,
  and "today" (midnight cutoff) and the weekday tick labels on the 7-day
  chart are computed client-side from `new Date(...)`, since the site's
  audience spans many US and international time zones.
- **Each chart plots one series only: concurrent church count.** An
  earlier version also drew a second, independently-scaled line for
  summed viewer count on the same plot. Dropped after Larry got confused
  by the unlabeled second line and asked what it was - loading the
  `dataviz` skill at that point flagged the design itself as a named
  anti-pattern (a "dual-axis chart": two differently-scaled series
  sharing one plot invents a visual correlation that isn't really there,
  since the alignment between the two scales is arbitrary). Rather than
  just add a legend to a misleading chart, the viewer-count series was
  removed from the graph entirely per Larry's call - it's still shown, as
  plain text in the peak callout ("Peak: 9 churches (57 watching)..."),
  just never graphed.
- The "Last 7 Days" chart's weekday tick labels shift day-to-day (since
  it's a genuine rolling window, not a calendar week) - they orient the
  visitor to which day is which along the axis, they just won't always
  read literally "Sunday through Saturday" the way a calendar-week chart
  would.
- Polls `/api/live-stream-stats` on its own interval
  (`LIVE_STREAM_STATS_POLL_MS`, 2 min - matched to the backend's own cron
  cadence, same pattern as the existing `LIVE_STATUS_POLL_MS`), separate
  from `loadLiveStatus()`'s own polling loop.

## Known data-quality caveat

This inherits every known scraping quirk of the underlying YouTube
live-detection feed described in `live-stream-detection-notes.md`
(false-positive risk from stale/stuck `isLive: true`, the demoted
`itemprop="isLiveBroadcast"` signal, etc.) - the chart is a record of
what that feed reported at each cycle, not an independently verified
count. If the detection logic misfires for a given church at a given
cycle, that shows up here too. Per-church `viewCount` is separately
nullable (regex-scraped from YouTube's page HTML), so the summed viewer
total (shown as plain text in the peak callout, not graphed - see
"Frontend" above) under-counts on any cycle where a live church's count
didn't parse - documented as a known, one-directional bias (under- never
over-counts), not a bug.

## Testing

No live traffic depends on this being right immediately, but the
append/trim/peak logic and the frontend chart math were both sanity-
tested in isolation before shipping (small standalone Node scripts, not
committed to the repo):

- Simulated ~21 days of 2-min cron cycles with a synthetic daily pattern
  plus one planted spike early in the run. Confirmed: the retained
  `samples` array stays bounded to ~7 days/~5,040 entries, and
  `allTimePeak` still correctly reports the planted spike's exact
  count/timestamp even after that sample itself has been trimmed out of
  `samples`.
- Exercised the frontend's SVG path-building and axis-tick functions with
  edge cases: zero samples, a single sample, a degenerate zero-width time
  range (xMin === xMax, e.g. right after the very first sample ever
  recorded), and an all-zero series - confirmed no `NaN` in any generated
  path and a sensible flat baseline for the all-zero case.

## Possible follow-ups (not built yet)

- No admin-facing debug view for this data yet (unlike
  `LIVE_CHECK_DEBUG_KV_KEY`'s admin panel) - could add one if the raw
  history is ever needed for troubleshooting rather than just the public
  chart.
- Currently un-throttled polling on a fixed interval; if this pane is
  ever shown on a page that's open for a long time, consider pausing the
  poll when the tab isn't visible (not done here, matches the existing
  `loadLiveStatus` pattern which also doesn't do this).
