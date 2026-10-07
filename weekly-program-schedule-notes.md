# weekly-program-schedule-notes.md

Design and operating notes for the **Weekly Program Schedule** (built
2026-10-07): a schedule of recurring church Bible studies and programs on
Monday, Tuesday, Thursday, Friday and Saturday, learned automatically from the
live-stream checks. Phase one is an **admin-only preview** so the schedule can
be reviewed and the UI tuned before any visitor sees it.

Code: `src/program-schedule.js` (recorder, time zones, schedule builder - pure
functions, no KV or fetch), wired into `src/index.js` (cron hook, two admin
endpoints) and `public/index.html` (the panel).

---

## What Larry asked for

- Skip Sundays - every church streams a Sunday service. The Sunday tab shows a
  generic "Live Sunday Services" message instead of listing churches.
- Skip Wednesdays too (mid-week studies). Generic "Live Midweek Services"
  message. **Sunday and Wednesday are not recorded at all.**
- Focus on Mon, Tue, Thu, Fri, Sat. Columns: Time, Church, Study (title).
- Show times in the **visitor's own time zone**.
- Use YouTube's real start time ("Live for NN min"), not the moment the check
  happened to notice the stream (checks are minutes apart).
- Clean quarter-hour times (no 6:15 / 6:17 / 6:22 for the same kind of thing).
- Admin-only first. Show new programs **immediately** (no 3-week wait) but
  visually lighter, so the page can be tuned from early feedback.
- Admin can hide a row or edit its title (title cleanup will be decided as the
  schedule takes shape).
- Some programs are **monthly** ("Men's breakfast, first Saturday") - the
  schedule must handle that.
- Only churches with Live Streaming switched on are checked (unchanged).
- Layout: day links across the header (SUN MON TUE WED THU FRI SAT), opens on
  the current day, clean table below for that day.

## Data flow

1. **Recorder** (`recordProgramSessions`, called once per cron cycle from
   `checkAllChurchesLive` right after the live-stream stats sample is written).
   Takes the same `liveOnly` array the Live Now list uses and logs one
   *session* per broadcast to KV key `program-sessions`.
2. **Builder** (`buildProgramSchedule`, called when the admin opens the panel)
   groups sessions into programs and works out pattern, quarter-hour slot,
   status and next occurrence.
3. **Panel** places each program on the visitor's calendar using its next
   occurrence instant, and renders the day table.

The cron hook is in its own try/catch - a problem here can never fail the live
check itself - and only writes to KV when something actually changed.

## KV keys (both in the existing CHURCHES_KV namespace)

- `program-sessions`: `{ since, sessions: { "<churchId>|<startISO>": {c, s, t, v, z, g, f, l} }, diag }`
  - `c` church id, `s` YouTube's broadcast start (ISO), `t` title (latest seen),
    `v` video id, `z` church time zone (IANA), `g` 1 if the zone was guessed,
    `f` first seen, `l` last seen.
  - Retention 70 days (a monthly program needs a couple of cycles to prove
    itself). Expect a few hundred KB at most.
  - `diag` counts *sightings* (once per cron cycle a stream is seen), not
    distinct streams: `noStartDate`, `skippedSunWed`, `skippedLongRunning`,
    `noTimeZone`. Informational only.
- `program-schedule-overrides`: `{ overrides: { "<churchId>|<weekday>|<slotMin>": {hidden?, title?} }, updatedAt }`
  - `weekday` is the **church-local** weekday (0=Sun...6=Sat); `slotMin` is the
    snapped local start in minutes since midnight (e.g. 960 = 4:00pm). This is
    the slot the program had when it was edited.
  - **Edits survive small time shifts** (added 2026-10-07). The builder
    (`applyProgramOverrides`) first matches overrides to programs by exact key.
    Each leftover override then goes to the nearest still-unclaimed program for
    the same church and weekday whose slot is within
    `PROGRAM_OVERRIDE_MATCH_MIN` (30) minutes - one override per program and
    one program per override, so two separate programs the same evening never
    share an edit. So a title saved on a 7:00 program still applies if it
    later reads 7:15 or 7:30; a program 45+ minutes away is treated as
    different and shows its own YouTube title. Each program in the builder
    output carries `overrideSlotMin` (the slot of the matched record, or null);
    the panel sends that slot back when saving so the same record is updated
    instead of a second one being created. Saved titles always beat the YouTube
    title; clear one by saving an empty title.

## Recorder rules

- A session is keyed by **church + the broadcast's own start timestamp**, not
  by video id. Some channels reuse one persistent video id for every service;
  keying on video id would merge every week into one session.
- The recorded start is YouTube's (`startDate`), so a stream first noticed 20
  minutes in is still logged at its real start.
- Live sightings with **no start time** are skipped and counted (a start time
  is the whole point). Shown in the panel footer.
- Skipped: church-local Sunday/Wednesday starts; streams whose start is already
  more than 10 hours old the first time we see them (24/7 loops, stuck
  broadcasts); streams with no resolvable time zone.
- Aggregation also drops any session that ran longer than 10 hours
  (conferences, loops that started looking normal).
- Re-seeing the same session only updates `l` (last seen) and the latest title.

## Time zones

- Every church gets an IANA time zone derived from its address text
  (`churchTimeZoneInfo`): US state (+ coordinate refinement for the states that
  straddle a zone line: TX, KS, NE, SD, ND, FL, IN, KY, TN, MI, OR, ID, NV),
  Canadian province, Mexico (Baja/Sonora/Quintana Roo handled separately), a
  table of other countries, Australia/Brazil split by coordinates.
- When nothing identifies the country it falls back on coordinates (central
  Europe and Israel boxes, then a whole-hour longitude zone) and flags the
  result as a **guess** (`g:1`, "time zone guessed" in the panel).
- Programs are clustered by the church's **local wall-clock** time, so a 7pm
  study stays 7pm across daylight-saving changes. (Tested across the Nov 1,
  2026 US change.)
- Display: each program carries `nextStartUtc`, a real UTC instant for its next
  occurrence. The browser shows it in the visitor's zone and files it under the
  visitor's local weekday, so a Tuesday-night Pacific study appears under
  Wednesday for a visitor in Europe. Sunday/Wednesday tabs show the generic
  message and, below it, any recorded program that lands on that day only
  because of a time-zone shift.

## Clustering, snapping, patterns

- Sessions are grouped by church + church-local weekday; start times within 30
  minutes of the previous one belong to the same program.
- **Typical start** = median of the per-date earliest starts. **Slot** = that
  median snapped to a quarter hour. Churches tend to go live a few minutes
  early, rarely late, so the snap window is skewed early:
  `slot = floor((minute + 8) / 15) * 15`, i.e. 6:52 to 7:06 reads as 7:00 and
  7:07 reads as 7:15. The constant is `PROGRAM_SNAP_EARLY_GRACE_MIN` (8) -
  **tune it once real start-time data is in**; the panel shows each program's
  raw "avg start" next to the snapped time for exactly that purpose.
- **Pattern** is worked out from the actual church-local dates:
  - Weekly (gaps about 7 days)
  - Every other week (3+ sightings about 14 days apart)
  - Monthly: same "nth weekday of the month" each time ("1st Saturday of the
    month", "Last Saturday of the month"), gaps 25+ days
  - Occasional (irregular), or "Seen once, pattern unknown"
  - Two sightings 14 days apart is "pattern unknown" until a third arrives.
  - A program seen only once is placed on its weekday (as if weekly) but
    labeled "Seen once, pattern unknown"; monthly and every-other-week
    programs also show their **Next:** date so nobody assumes every Saturday.
- **Status** drives the visual weight: NEW (seen once, lightest, italic),
  BUILDING (2 sightings, or 3+ that don't yet look regular), STEADY (3+ and,
  for weekly, present in at least 60% of the weeks since first seen; for
  every-other-week/monthly just 3+). "Not seen recently" is flagged after 21
  days (weekly), 35 (every other week), 75 (monthly).

## Admin endpoints (both use the same `isAdminRequest` gate as Live Debug)

- `GET /api/admin/program-schedule` - rebuilds the schedule from the recorded
  sessions on every call (cheap) and returns `{generatedAt, since,
  sessionCount, diag, snapGraceMin, programs[]}`. Hidden rows are included,
  flagged. No YouTube requests.
- `POST /api/admin/program-schedule/override` - body `{churchId, weekday,
  slotMin, hidden?, title?}`. An empty title clears the override. A non-admin
  gets 401 and nothing in the data is ever sent to them.

## The panel

- Desktop: a "Weekly Schedule" button in the header (admin only) opens a
  right-hand drawer like Live Debug; phones: a row in the hamburger menu opens
  a full-screen takeover (`body.mobile-schedule-open`).
- Day links across the top, opens on today, table for the selected day.
- Church names use the same label as Live Now (`churchNameWithTag`, shared
  helper): "Calvary Chapel Old Bridge (NJ)". Clicking a name pans the map to it.
- Per row (admin): status pill, pattern, "seen N times, last <date>", average
  start in church time, **Edit title** (inline), **Hide/Unhide**; "(edited)" if
  a title override exists; "LIVE NOW" pill when that church is live right now.
  The pill is the same pulsing two-tone LIVE/NOW badge used in the map popup
  (`.popup-live-badge`), and it behaves the same way: one click opens the
  in-page video lightbox (`openLiveVideoLightbox`) when the live entry has a
  videoId and the church's `embedAllowed` is not false; otherwise it falls
  through to a normal link that opens the stream on YouTube in a new tab.
  (Updated 2026-10-07 - it was first a static "● LIVE NOW" text pill that did
  nothing when clicked.)
- Footer: collecting-since date, streams recorded, and a "Show hidden rows"
  toggle.

## Testing done (2026-10-07)

Node tests (not committed) against synthetic data: weekly program with jitter
across the US daylight-saving change stays one 4:00pm program; 2-week "building"
program; first-Saturday and last-Saturday monthly programs and their next dates;
every-other-week Friday; Sunday/Wednesday never recorded; 24/7 stream ignored;
sessions not duplicated on re-sighting; override hide/title; lapsed flag;
quarter-hour snap table; visitor time-zone conversion (Sydney Monday 7pm to US
Eastern/Pacific). Time-zone derivation checked on the 1,427-church snapshot
(all but three get an exact zone; the three guesses are Dusseldorf, Bourges and
Frascati, all central-European time) plus spot checks on split states. The two
endpoints were exercised against a mock KV (401 for non-admin, validation,
override add/remove). The panel was rendered in a headless browser at desktop
and phone widths.

## Known limits / not built

- **Collection starts at deploy.** Nothing recorded earlier can be recovered.
  A monthly program needs about two months before it is recognized as monthly.
- Titles vary week to week ("Week 3"); the latest is shown, up to 3 recent ones
  appear when editing. Smarter title cleanup is deliberately deferred.
- A weekly and a monthly program at the same time on the same weekday for the
  same church can't be told apart.
- Detection inherits the live-check quirks (stuck live flags, missing start
  times - see `live-stream-detection-notes.md`).
- No public endpoint yet. Going public = a read-only endpoint returning the
  builder output minus hidden rows (and likely only STEADY/BUILDING rows), plus
  moving the day-link table out of the admin-only gating.
- No approve/publish flag yet beyond hide - add when the page goes public.
