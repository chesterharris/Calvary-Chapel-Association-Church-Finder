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

Second data point, not yet wired up as of this writing (currently still the
grandfathered no-metadata `icecast` entry - see `radio-station-providers-notes.md`).
Kept here for when that upgrade happens:

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
  MacIntosh", "J Vernon McGee") - no title-casing needed at all for this
  one, unlike GraceFM.
