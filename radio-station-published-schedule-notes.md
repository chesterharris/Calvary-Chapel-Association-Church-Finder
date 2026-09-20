# Published-Schedule Stations - Reference Notes

Companion to `radio-station-providers-notes.md`, split out separately because
this provider (`publishedschedule`) is fundamentally different from every
other one in that file: there's no live feed to poll at all. This doc covers
when to reach for it, the transcription format, the lookup algorithm, and
per-station notes.

## When this applies

Some stations have a genuinely dead now-playing metadata pipeline (frozen
`programStartTS`, permanently empty title/artist - see
`radio-station-providers-notes.md`'s "Providers we looked at and deliberately
did NOT build" pattern) but DO publish a real weekly programming schedule on
their own website. Rather than skipping the station outright, we transcribe
that published schedule once by hand and compute "now playing" purely from
the current time - accepting that this is a best-effort guess, not a
confirmed live read. The stream itself (`streamUrl`) is unrelated to this and
still needs to be independently confirmed playable, same as any other
provider - a dead metadata feed and a dead stream are two different things.

**Not a live re-scrape.** We deliberately do NOT have the Worker fetch and
re-parse the station's schedule page on every poll. A published schedule like
this changes rarely, and a live scrape adds a real external dependency - if
the station redesigns their page, parsing breaks silently. Transcribing once
into a static data file means nothing can break at request time, at the cost
of the data going stale if the station changes their lineup without us
noticing (see "Keeping it fresh" below).

## The provider (`publishedschedule`)

Registered in `src/index.js` like any other provider, but its
`fetchAndParse` (see `fetchPublishedScheduleNowPlaying`) makes **zero HTTP
requests** - "fetching" is pure local computation against
`station.schedule`. Same `{ title, artist, coverUrl }` contract as every
other provider; `coverUrl` is always `null` here (a published schedule has
no artwork source at all).

`station.schedule` shape:

```js
{
  timezone: 'America/Denver',        // IANA zone the published times are in
  saturday: [ { time, program, host }, ... ],
  sunday:   [ { time, program, host }, ... ],
  weekday:  [ { time, program, host }, ... ],  // the one Mon-Fri lineup, repeats 5x
  weekdayOverridesByDay: {                     // OPTIONAL, see "One-off overrides" below
    WED: [ { time, program, host }, ... ]
  }
}
```

`time` is always 24-hour `"HH:MM"`, already in `timezone` - no AM/PM parsing
at request time, and no ambiguity about which "12:00" is which. Every entry
is nothing more than a start-time marker - there is deliberately no
"duration" field anywhere. A program airs until the next marker, whatever
time that happens to be, which is what makes the same lookup logic work for
both a dense wall-to-wall grid (every half hour filled, like GraceFM's Sunday
and weekday lineups) and a sparse one with explicit filler blocks (GraceFM's
Saturday, which lists real `MUSIC | 12:00AM - 7:00AM`-style ranges between
programs) - a MUSIC block's own human-readable end time on the source page
always lines up with whatever the next entry's start time is, so the code
never has to look at it.

**The lookup**: convert "now" into the schedule's own timezone (via
`Intl.DateTimeFormat` with an explicit `timeZone` - Cloudflare Workers ship
full ICU/timezone data, so this is DST-aware for free, no library needed),
pick `saturday`/`sunday`/`weekday` by day-of-week, then find whichever entry
in that day's list has the largest start time that's still `<= now`. Wraps
around midnight automatically (an 11:30 PM entry stays "current" until the
next day's first entry, whatever time that is) by defaulting to the last
entry in sorted order before scanning forward.

## Transcription format

Store the finished, human-readable strings directly - `program` and `host`
are typed (or script-generated) exactly as they should display, not raw
scraped text to be cleaned up at request time. This matters because
punishing this at read-time would mean re-solving formatting edge cases on
every single request for no benefit; solving them once, by eye, during
transcription is strictly better.

**A program repeating several times a day is just several separate
entries**, one per airing, all sharing the same `program`/`host` - there's no
special "repeat" syntax. Whether the source page writes that as one line with
several times (GraceFM's accordion format, e.g. `"7:00AM + 4:30PM |
ABOUNDING GRACE | PASTOR ED TAYLOR"`) or as several separate table rows
(WJWD's format - see below) makes no difference once transcribed; both become
the same shape of data.

**ALL-CAPS source text needs care, not a blind title-case.** A source page
in ALL CAPS (like GraceFM's) can't be safely title-cased with a generic
"capitalize every word" algorithm if any host name has internal capitals that
matter - `MCGEE` naively becomes `Mcgee` instead of `McGee`, `MACINTOSH`
becomes `Macintosh` instead of `MacIntosh`. This is exactly the same trap
`radio-station-providers-notes.md` already calls out for Live365/WGLJ's
lowercase splitting, and it can't be solved algorithmically in general (a
name like "michael w smith" has no reliable casing rule). Since transcription
is a one-time, by-eye pass, the fix is just: check the station's actual
roster for `Mc`/`Mac`/`O'`-style names before trusting a blanket
capitalize-each-word conversion, and hand-fix any that need it. **GraceFM's
current lineup has no such names, so simple capitalize-each-word was safe
as-is.** A source page that's already correctly cased (WJWD's table is, since
it was never all-caps to begin with) needs no casing transformation at all -
just copy it through unchanged.

**Naming inconsistencies in the source itself.** GraceFM's own Saturday
schedule lists the same Pastor Ed Taylor program, at the same two times
(7:00AM and 1:00PM), under two slightly different names depending on which
of their two schedule lines you read (`"LEAD TO SERVE PODCAST"` vs `"LEAD TO
SERVE"`). Same host, same times, clearly one program - canonicalized to the
fuller name (`Lead To Serve Podcast`) in `gracefm.js` rather than left as an
arbitrary tie for the lookup to break unpredictably. Worth a specific check
during any station's transcription: group entries by time and eyeball
whether two different-looking names actually share a host and time slot.

## One-off overrides (`weekdayOverridesByDay`)

GraceFM's own page lists one single slot - `7:00PM WED | CALVARY CHURCH LIVE
MIDWEEK SERVICE | PASTOR ED TAYLOR` - inside the Mon-Fri schedule, but
qualified to Wednesday only, overriding the generic `7:00PM + 8:00AM | A NEW
BEGINNING` entry that otherwise airs at 7pm every weekday. `weekday` entries
merge with whatever's in `weekdayOverridesByDay[dayCode]` only on that
specific day before the normal sort-and-lookup runs - so an override is just
a normal `{ time, program, host }` entry that only exists on one day of the
week.

**This is deliberately a one-off, not a generalized "day-qualified time"
mechanism.** GraceFM is the only station (so far) with a qualifier like this
in its raw source, and the field only supports being keyed by day - it does
not try to parse an arbitrary qualifier syntax out of raw schedule text. If a
future station needs something more elaborate than "this one slot is
different on this one day," treat that as a reason to revisit this design,
not a reason to bend the existing field to fit.

## `staticCoverUrl` (works on any provider, not just this one)

A published schedule has no artwork source at all, so `publishedschedule`
always returns `coverUrl: null`. Rather than a blank mini-player thumbnail,
any station entry can set `staticCoverUrl` to a fixed image path/URL that
`fetchStationNowPlaying` uses instead of (and takes priority over) whatever
the provider itself returns - see the `RADIO_STATIONS` field comment in
`src/index.js`. This isn't specific to `publishedschedule` - any station with
a real logo but no per-track artwork could use it, including some of the
already-configured Icecast/wpshowplaying stations that currently show
nothing.

**GraceFM's icon**: started from two logo files the station uses elsewhere
(a black rounded-square app icon, and a transparent-background version of
just the skyline+wordmark). The original rounded-square icon had a drop
shadow baked in, which ate real space at small sizes (margin reserved for the
shadow shrank the actual mark by roughly a third relative to the frame) - a
shadow-free version was built instead, keeping the mark itself around 80% of
the frame instead of ~65%. Saved as `public/gracefm-icon.png`, referenced as
`staticCoverUrl: '/gracefm-icon.png'`.

## Mini-player transparency callout

Decided against an icon or tooltip - "the better this works, the less anyone
needs to be told where the data comes from." Instead, `station.scheduled`
(set server-side to `true` only for stations on the `publishedschedule`
provider - see `fetchStationNowPlaying`) drives a small plain-text `·
scheduled` suffix appended directly onto the mini player's now-playing line
(see `updateMiniPlayerNowPlaying` in `index.html`). Deliberately mini-player
only - the ticker and browse panel have no room for it and are left looking
identical whether a station's data is live or scheduled, since a visitor
skimming the ticker shouldn't need to care about the distinction; someone who
actually presses Play on that specific station is the one audience worth
being transparent with.

## Keeping it fresh

There's no equivalent of `programStartTS` to catch a published schedule
silently going stale - a live XML feed freezing is self-evident (the same
title never changes), but a hand-transcribed schedule has no signal at all
if the station quietly updates their lineup on their own site. The only real
defense is a periodic manual re-check: re-open the station's schedule page,
re-paste it, and diff by eye against the transcription.

**GraceFM**: a manual re-check reminder is scheduled for **2026-11-09** (60
days from this being wired up on 2026-09-10). When that reminder fires, the
process is: re-fetch `https://www.gracefm.com/schedule`, re-run the same
extraction against the fresh page source, and diff the result against
`src/radioSchedules/gracefm.js` - if the accordion markup, `nav-title` class,
or the three section headers (`SATURDAY SCHEDULE` / `SUNDAY SCHEDULE` /
`WEEKDAY PROGRAM SCHEDULE`) changed, the extraction itself needs revisiting,
not just the data.

---

## Per-station notes

### GraceFM / KXGRFM (Aurora, CO)

- Source: `https://www.gracefm.com/schedule`, transcribed 2026-09-10.
- Page is built on the Brizy page builder - every schedule line lives in a
  `<span class="brz-accordion__nav-title">TIME(S) | PROGRAM | HOST</span>`
  element, one span per line, 90 total across the page (7 Saturday + 35
  Sunday + 48 weekday, before splitting out the Wednesday override and
  deduping exact repeats down to 7/35/47 - GraceFM's page lists some
  repeating programs from more than one line, e.g. both `"7:00AM + 4:30PM |
  ABOUNDING GRACE"` and `"4:30PM + 7:00AM | ABOUNDING GRACE"` appear
  separately, capturing the same airing twice before dedup). Confirmed this
  class isn't reused anywhere else on the page, so no risk of accidentally
  picking up unrelated accordion content.
- Three sections split by plain `<strong>` header text (`SATURDAY SCHEDULE`,
  `SUNDAY SCHEDULE`, `WEEKDAY PROGRAM SCHEDULE`), not part of the accordion
  markup itself - entries were bucketed by document position relative to
  these headers.
- Static image: see "`staticCoverUrl`" above.
- `streamUrl` (`https://ice23.securenetsystems.net/KXGRFM`) confirmed
  live/playable 2026-09-10 - independent of the dead XML metadata feed that
  originally got this station rejected (see `radio-station-providers-notes.md`).
- 60-day re-check reminder: **2026-11-09**.

### WJWD / WJCZ / WTZY (Marshall, WI - Calvary Radio Network)

Second station wired up on this provider, 2026-09-10. Data lives in
`src/radioSchedules/wjwd.js`.

- Source page (`Calvary Radio Network`) hosts three separate simulcast
  groups on one site - WHLP; WQKO/WOJC/WJCO/WJCI/WJCY; and WJWD/WJCZ/WTZY -
  same "one station entry represents a simulcast group" pattern as GraceFM's
  CSNAAC (see `radio-station-providers-notes.md`).
- Markup is a plain HTML table (Time / Program / Teacher / Website columns),
  nothing like GraceFM's accordion spans - confirms the transcription format
  above is genuinely markup-agnostic; both sources produce identical-shaped
  `{ time, program, host }` data once transcribed.
- Splits Saturday and Sunday out as fully separate lists (not a combined
  "weekend" block), matching the general `saturday`/`sunday`/`weekday` shape
  already designed for GraceFM.
- Never uses a "+"-repeat notation - a program airing twice just appears as
  two separate table rows. Confirms repeats don't need special transcription
  syntax either way (see "Transcription format" above).
- Host names are already correctly cased in the source (e.g. "Mike
  MacIntosh") - no title-casing needed at all for this one, unlike GraceFM.
  Two names were inconsistent between tables on the source site itself and
  had to be canonicalized: "Mark Rekcowski" (weekday) vs "Mark Rekcowsky"
  (Saturday), same host/program - kept the weekday spelling; and
  "J Vernon McGee" (Saturday) vs "J. Vernon Mcgee" (Sunday, twice) - both
  are the well-known "Thru The Bible" teacher, properly "J. Vernon McGee" -
  used that spelling everywhere.
- Timezone: `America/Chicago` (Marshall, WI).
- Two judgment calls, not verbatim source data - both are late-night/low-
  traffic hours and Larry said to go with best guess and adjust later if he
  can confirm firsthand:
  - **Sunday night has a real 4-hour gap** in the source table itself
    (nothing listed between 9:00 PM "The Word For Today" and 1:00 AM "Thru
    The Bible" the next table over). Per Larry's call: "The Word For Today"
    is credited for one hour (9-10pm), then an explicit "Unknown
    Programming" placeholder covers the rest, rather than over-crediting a
    real program for 4 hours it likely didn't actually run.
  - **Sunday's table tail conflicts with the weekday grid.** Sunday's own
    listing includes 1:00/2:00/3:00 AM entries (Thru The Bible / The
    Cleansing Word / A Sure Foundation) that directly contradict the
    weekday grid's Late Nights lineup for that same clock window. Every
    table on this site starts at 4:00 AM, suggesting a 4am-4am broadcast
    day - so Sunday's tail is read as what actually airs heading into
    Monday morning specifically, not calendar Sunday. Modeled as a `MON`
    entry in `weekdayOverridesByDay` (same mechanism as GraceFM's
    Wednesday override) rather than folded into Sunday's own array; it
    overrides the weekday grid's 1am and 2am slots only, and leaves the
    2:30am Cornerstone Connection slot alone since Sunday's table has
    nothing at that specific time.
  - Not investigated: the same 4am-4am boundary logic would suggest
    Saturday's own table tail (12am/1am/2am) similarly carries into Sunday
    morning, and Friday's weekday Late Nights lineup into Saturday morning.
    Left as plain per-table data for now since nothing conflicts there (no
    competing entries the way Sunday/Monday had) - only the Mon/Sun case
    above needed a fix.
- Logo: `staticCoverUrl: '/wjwd-icon.png'`, approved 2026-09-10. Same
  rounded-square treatment as GraceFM's icon, built from Larry's own WJWD
  badge image - source was low-resolution (~186x183), so it's a bit soft
  scaled up, but confirmed as an improvement over no image.

### KEWR - Enduring Word Radio (Cedar Rapids, IA)

Third station wired up on this provider, 2026-09-17. Data lives in
`src/radioSchedules/kewr.js`.

- Source: `https://enduringwordradio.com/schedule/`, transcribed 2026-09-17
  from raw page source Larry supplied directly (not WebFetch's markdown
  summary - see below on why).
- Live365-hosted (mount `a36509`). Checked the Live365 JSON API
  (`https://api.live365.com/station/a36509`) first, per the standing policy
  of always trying that endpoint before assuming a station needs HLS
  chasing - confirmed genuinely dead here too: `current-track`/`last-played`
  come back empty/missing even though the stream itself
  (`https://streaming.live365.com/a36509`) is live and playable. Same
  "dead metadata pipeline, not a quiet moment" situation as GraceFM's
  SecureNetSystems feed, just on a different platform.
- Source splits Monday-Friday across two separate tables - a daytime one and
  a "Monday - Friday (Overnight)" one - that hand off cleanly at the day
  boundary. Merged into one continuous 24-hour `weekday` array in
  `kewr.js`. Two rows were dropped as artifacts of that split, not real
  programming: the daytime table's own last row is a plain "See Overnight
  Broadcast Schedule" pointer (not a program), and the overnight table's
  final 5:00 AM row duplicates the daytime table's first entry - the lookup
  wraps around on its own, so keeping both would just be redundant, not
  wrong.
- Two naming inconsistencies, both resolved by canonicalizing rather than
  picking one table as more authoritative:
  - **"God Sword" vs "GodSword"** - the 7:30 AM and 8:00 PM airings are the
    same program with the same host (Ken Graves), spelled differently
    depending on which table row you read. Canonicalized to "GodSword"
    throughout.
  - **"Mike Macintosh"** - misspelled on the source page itself (confirmed
    via raw page source, not a WebFetch artifact - see below). Larry
    confirmed the correct spelling is "Mike MacIntosh"; corrected in the
    11:30 AM weekday entry.
- **WebFetch's HTML-to-markdown summarization proved unreliable for this
  transcription** - a first pass through WebFetch rendered inconsistent
  results on exactly the kind of detail that matters here (name casing,
  spacing). Rather than trust an AI-summarized fetch for verbatim text,
  Larry supplied the actual raw page source directly (same approach already
  used for other stations' investigations), which is what the transcription
  above is drawn from. Worth remembering for any future station: raw source
  the user provides is the trusted input for exact-text transcription,
  WebFetch is not.
- Timezone: `America/Chicago` (Cedar Rapids, IA).
- **One judgment call, not verbatim source data**: the shared
  Saturday/Sunday table has nothing listed for Sunday past 8:00 PM (its only
  day-specific note is a Saturday-only 8:30-11:30 PM "Praise & Worship"
  block). Per Larry's call ("we don't really know what is happening during
  those hours and thankfully the listenership in the wee hours of the night
  is low"), a single `Praise & Worship` filler entry was added at 8:30 PM,
  Sunday only - using the station's own existing generic filler category
  rather than crediting a real program for hours it likely didn't run. That
  one addition also happens to cover the Saturday-night-into-Sunday-morning
  stretch (11:30 PM Saturday - 5:00 AM Sunday) for free, via the normal
  wraparound lookup, since Sunday's array otherwise has no entries before
  5:00 AM. No `weekdayOverridesByDay` needed for KEWR (unlike WJWD) - its
  Sunday table has no early-morning entries that would conflict with the
  weekday grid, so the weekday array just takes over cleanly at true
  midnight Monday.
- Logo: `staticCoverUrl: '/kewr-icon.png'` / `staticCoverThumbUrl:
  '/kewr-icon-128.png'`, approved 2026-09-17 as part of Larry's standing
  instruction to match this same rounded-square, shadow-free treatment for
  any future static icons. Source SVG
  (`https://enduringwordradio.com/_astro/logo.9ba32d78_2nBtmL.svg`) couldn't
  be downloaded directly (blocked by the org's egress policy) - Larry to
  supply the file directly, same as GraceFM/WJWD's source images.
- 60-day re-check reminder: **2026-11-16**.

### KGPS "The Way" (Kingman, AZ)

Fourth station wired up on this provider, 2026-09-18. Data lives in
`src/radioSchedules/kgps.js`.

- Source: `https://www.kgps.org/`'s published schedule page, transcribed
  2026-09-18 from raw page source Larry supplied directly.
- Previously investigated and rejected outright (see "KGPS 'The Way'
  (Kingman, AZ)" in `radio-station-providers-notes-consolidated.md`) - its
  XML now-playing feed (`player_status_update/KGPS.xml`) returns HTTP 200
  with a soft-404 error page body ("The system cannot find the file
  specified"). Larry re-confirmed the identical broken response 2026-09-18
  and supplied the published schedule instead, so this is the first
  previously-rejected station brought back via this provider rather than one
  caught fresh. `streamUrl` (`https://ice5.securenetsystems.net/KGPS`) is
  unchanged from the original investigation and was already confirmed
  live/playable then - the metadata pipeline and the stream itself are
  independent, same as every other station on this provider.
- Source page is a Wix rich-text block (`<p>` tags, no structured table or
  accordion markup like GraceFM/WJWD/KEWR) - three plain-text day sections
  (a "Weekdays" block covering the full Mon-Fri 24 hours, then "Saturday",
  then "Sunday"), each just a flat list of `TIME  Program - Host` lines with
  no consistent chronological ordering in the source itself (Saturday's list
  in particular starts mid-morning before looping back to midnight) -
  reordered chronologically during transcription; order doesn't affect the
  lookup itself, but keeping the data files sorted matches every other
  station's convention here.
- Two judgment calls, not verbatim source data - both flagged to Larry for
  confirmation whenever he happens to be listening at those hours:
  - **A genuine seasonal Summer/Winter slot swap.** The weekday grid's
    3:00-4:31pm block lists two pairs of programs (Calvary Live / Grace Upon
    Grace, and Washington Watch / Light on the Hill) that trade places by an
    hour depending on a "Summer" or "Winter" tag in the source text itself -
    e.g. Calvary Live at 3:00pm is tagged "Summertime", the same slot's
    4:00pm entry is tagged "Wintertime". Read as the live simulcast's
    *origin* station observing DST while Arizona's own clock doesn't, so the
    arrival time (in Kingman's clock) shifts twice a year. This schedule
    format has no seasonal concept (`weekdayOverridesByDay` is deliberately
    day-of-week only, not a generalized mechanism - see "One-off overrides"
    above), so `kgps.js` just hardcodes the Summer lineup (accurate as of
    the September 2026 transcription date) and drops the Winter-tagged
    duplicates. Needs a manual swap back to Winter around when DST ends
    (first Sunday of November) and back to Summer again in spring - flagged
    directly in the schedule file's own header comment so it isn't missed.
  - **An unresolved same-slot conflict with no tag to break the tie.** Unlike
    the Summer/Winter pairs above, the weekday grid's 7:00pm slot lists two
    unrelated, unqualified programs - "Movieguide" and "Answers in Genesis -
    Ken Ham" - with nothing in the source distinguishing which one is the
    real booking versus a stray duplicate. Kept "Answers in Genesis" (it
    already recurs elsewhere in the same schedule at 1:00am) and dropped
    "Movieguide".
- One transcription cleanup, not a judgment call: Saturday's table lists
  "Grace Infusion - Mike Nimer" twice within two minutes of each other
  (6:00am and 6:02am) - the same kind of stray duplicate row KEWR's
  overnight/daytime table split produced. Kept the 6:02am instance (matches
  its position relative to the surrounding entries) and dropped the 6:00am
  one.
- No `weekdayOverridesByDay` needed for the Sat/Sun or Sun/Mon boundaries
  (unlike WJWD) - this station's weekday grid genuinely starts at midnight,
  and neither Friday-into-Saturday nor Sunday-into-Monday has a conflicting
  tail the way WJWD's Sunday table did. The one override this station does
  need is a plain Friday-night one: the source carves out a two-hour
  "Christian Rock Music" block at 10:30pm/11:30pm Fridays only, replacing
  the generic weekday GodSword/Hope from the Word slots - modeled as a `FRI`
  entry in `weekdayOverridesByDay`, same mechanism as GraceFM's Wednesday
  override and WJWD's Monday override.
- Timezone: `America/Phoenix` (Kingman, AZ - Arizona doesn't observe DST, so
  this one never needs a timezone-side adjustment, only the schedule-side
  Summer/Winter swap noted above).
- Logo: `staticCoverUrl: '/kgps-icon.png'` / `staticCoverThumbUrl:
  '/kgps-icon-128.png'`, supplied 2026-09-18 - a compass/GPS-pin graphic
  (the pun being the call sign itself), not the station's own branding, but
  Larry's choice for this one. The station's own page only exposes a
  generic SecureNetSystems default logo/album-art placeholder, so this
  wasn't a case of picking a graphic over a usable real logo. Background
  removed from the supplied source (a flat white background around a
  vector-style mark, cleanly separable via a border-connected flood fill -
  no soft-edge halo to worry about) and given the same shadow-free,
  rounded-square black treatment as GraceFM/WJWD/KEWR's icons, mark scaled
  to the same ~80% of frame.
- 60-day re-check reminder: **2026-11-17**.

### God's Way Radio (Miami, FL)

Fifth station wired up on this provider, 2026-09-18. Data lives in
`src/radioSchedules/godswayradio.js`.

- Source: `https://www.godswayradio.com/`'s published schedule, split across
  three separate Wix rich-text pages (Weekdays, Saturday, Sunday), each
  transcribed 2026-09-18 from raw page source Larry supplied directly. Not a
  previously-investigated station - this is the first time it came up.
- Dead now-playing feed confirmed the same way as GraceFM/WJWD/KEWR/KGPS:
  `player_status_update/WAYGLP.xml` returns HTTP 200 with the same soft-404
  body ("The system cannot find the file specified"). `streamUrl`
  (`https://ice25.securenetsystems.net/WAYGLP`) comes straight from the
  `/v5/WAYGLP` page source Larry supplied and is independent of the dead
  metadata pipeline, same as every other station on this provider.
- All three source pages are much more verbose Wix rich-text markup than
  GraceFM/WJWD/KEWR/KGPS (the Weekdays page alone is ~173KB of HTML for 45
  entries), and each page structures its host name differently: Weekdays
  puts it in a `<p>` tag under the program's `<h2>`; Saturday has no `<p>`
  tags at all and instead carries the host in a `title="..."` attribute on
  the program's image div; Sunday redundantly has both (identical text in
  both places). Each page needed its own extraction pass rather than one
  shared pattern.
- No scheduling conflicts, seasonal splits, or `weekdayOverridesByDay` needed
  here (unlike KGPS/WJWD) - each day's grid was already internally
  consistent once transcribed, just with a handful of small spelling/casing
  slips between the three pages, normalized to the majority or
  most-likely-correct spelling (documented in the schedule file's own header
  comment rather than repeated here): "Damian Kyle" over Saturday's lone
  "Damien Kyle", "Samy Tanagho" over Saturday's "Sammy Tanagho", "Voice Of
  The Martyrs Ministries" over Saturday's transposed "Ministires", "Friends
  And Family Interviews" capitalized to match between the two pages that
  have it, and "GodSword" standardized across all three pages' inconsistent
  capitalization. Two Weekday slots ("LIVE For Jesus", "Refresh | LIVE") list
  no host at all on the source page (a bare zero-width-space character
  stands in for one) and are transcribed with an empty host string rather
  than a guessed name.
- Timezone: `America/New_York` (Miami, FL).
- Logo: `staticCoverUrl: '/godswayradio-icon.png'` / `staticCoverThumbUrl:
  '/godswayradio-icon-128.png'`, supplied 2026-09-18 - the station's own
  triangle/play-button mark (a green-to-teal gradient triangle with the
  station's name in white cursive script). Background removal needed a
  different technique than the border-connected flood fill used for
  GraceFM/WJWD/KEWR/KGPS: the white script text touches the triangle's own
  outer edge in a couple of places, so a naive white-background flood fill
  bled into and ate parts of the lettering. Fixed by fitting the triangle's
  three vertices directly from the source image's pixel geometry (least-
  squares line fit through the top and bottom edges, left edge x-position
  averaged across rows) and using that exact polygon as the alpha mask
  instead of any color-based thresholding - sidesteps the text-touching-edge
  problem entirely since the mask no longer depends on which pixels happen
  to be near-white. Given the same shadow-free, rounded-square black
  treatment as the other publishedschedule icons, mark scaled to the same
  ~80% of frame.
- 60-day re-check reminder: **2026-11-17**.

### KKJC (McMinnville, OR)

Sixth station wired up on this provider, 2026-09-20. Data lives in
`src/radioSchedules/kkjc.js`.

- Not a rejected-XML-feed case like GraceFM/WJWD/KEWR/KGPS/God's Way Radio -
  this station was never previously investigated at all. Its live player
  (`http://live.kkjc.net`) turned out to run on Radiojar, a provider never
  seen anywhere else in this codebase (`streamName` `"4q1m6fsb0k8uv"`).
  Radiojar's own now-playing endpoint
  (`https://proxy.radiojar.com/api/stations/4q1m6fsb0k8uv/now_playing/`)
  returns valid JSON(P) but with every field permanently empty - confirmed
  both by polling it directly and by KKJC's own site, whose "Now playing"
  widget is permanently `class="hide"` in the page's own markup - and Larry
  separately confirmed the same blank response. Same dead-metadata situation
  as every other station on this provider, so it went straight to
  `publishedschedule` rather than a new "radiojar" provider that would never
  return anything anyway.
- `streamUrl` (`https://stream.radiojar.com/4q1m6fsb0k8uv`) is independently
  confirmed live/playable over HTTPS - genuinely HTTPS-capable audio, not the
  same mixed-content dead end that sank KBOK/WRBP. Verified both as a bare
  URL and with a cache-busting query string; Radiojar's own player.js always
  appends one but it isn't actually required for basic playback.
- Source: two separate plain WordPress `<table>` pages, raw page source
  fetched directly, transcribed 2026-09-20 - `https://kkjc.net/programs/`
  (weekday) and `https://kkjc.net/saturday-and-sunday-schedule/`
  (weekend). Already correctly cased throughout - no ALL-CAPS title-casing
  trap like GraceFM's.
- **The weekend page is a single combined table, not separate
  Saturday/Sunday tables** - unlike every other station on this provider.
  `kkjc.js` transcribes it once as `WEEKEND_SCHEDULE` and reuses that same
  array for both `saturday` and `sunday`.
- The weekend table marks a program's second half-hour with a literal
  "(continued)" row instead of repeating the program/host - 9 such rows were
  dropped rather than transcribed as a bogus "(continued)" program; the
  lookup's own "airs until the next marker" behavior covers the second half
  automatically once the marker row is removed.
- Four spelling inconsistencies, identical on both pages, resolved to the
  real person's actual name rather than picking a winner between rows:
  "Michael Youseff" -> **Michael Youssef** (Leading the Way); "Alastair
  Begg" / "Alistair Begg" -> **Alistair Begg** (Truth for Life, matching the
  spelling already used for this host on KGPS elsewhere in this file);
  "Dr. Adrian Rodgers" / "Dr. Adrian Rogers" -> **Dr. Adrian Rogers** (Love
  Worth Finding); "Jon Courson" / "John Courson" -> **Jon Courson**
  (Searchlight). Separately, the inconsistent "Dr." prefix on J. Vernon
  McGee across rows was standardized to **no prefix**, matching how KGPS/WJWD
  already transcribe this same host.
- **One flagged, unresolved anomaly** - not corrected, unlike the spelling
  fixes above: the weekend 10:30 AM slot pairs "Love Worth Finding" with
  "Dr. David Jeremiah," but everywhere else Love Worth Finding is Adrian
  Rogers' program and David Jeremiah's own program is Turning Point. Looks
  like a copy-paste slip on KKJC's own page, but kept exactly as shown rather
  than guessed - Larry to confirm by ear if he's ever listening at that hour.
- Three "Pastor/Teacher" cells on the weekend page name a ministry rather
  than a person ("The Storyteller" / "Without Reservation", "Trail to
  Adventure" / "God's Great Outdoors", "Friends of Israel" / "Friends of
  Israel") - kept exactly as shown; that's genuinely what the source page's
  own column says.
- Timezone: `America/Los_Angeles` (McMinnville, OR - the source page's own
  column header literally says "(Pacific Time)").
- Logo: `staticCoverUrl: '/kkjc-icon.png'` / `staticCoverThumbUrl:
  '/kkjc-icon-128.png'`, supplied 2026-09-20 - Larry's CalvaryMac Radio
  badge (round mic graphic, "96.3 FM", "KKJC Christian Radio for Mac").
  Unlike every icon above, no rounded-square black frame was built around
  it - the supplied image is already a complete, polished circular
  app-icon-style design (500x500, flat white square background), so an
  extra frame underneath would just double up on framing that's already
  there. Only the white background was removed (plain border-connected
  flood fill from the four corners - the white is nowhere near the badge's
  own dark gray/blue tones, so no soft-edge halo to worry about), then
  resized to 512x512 / 128x128 to match every other station's icon
  dimensions.
- 60-day re-check reminder: **2026-11-19**.
