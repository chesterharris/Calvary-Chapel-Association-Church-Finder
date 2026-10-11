# conference-ticker-notes.md

How the Conferences ticker gets its entries, and the admin "Site Management" popup
with manual conferences (built 2026-10-09).

## Where the entries come from

1. **calvarycca.org/conferences** (unchanged). `/conferences` re-reads and parses that
   page only when a visitor loads the site and the stored copy is older than 6 hours
   (`CACHE_SECONDS`). There is no scheduled conference refresh - the every-2-minutes
   Worker job is only the live-stream check. Nothing is ever removed from this list
   because of a past date in the scrape itself - it follows the source - but since
   2026-10-11 expired entries are left out of the ticker (see "Automatic cleanup").
2. **Manually added conferences** (new). Stored in KV key `manual-conferences`:
   `{ nextId, conferences: [ { id, title, church, location, startDate, endDate,
   linkText, link, createdAt, updatedAt } ] }`. Dates are plain YYYY-MM-DD. Ids are
   never reused. Limit 50.

## How they are combined

`handleConferences` takes the (edge-cached) scraped list, loads the manual ones, and
merges them. The merged response is `Cache-Control: no-store`, so a conference the
admin just added or deleted shows on the next ticker load. Each manual one goes in
start-date order: just before the first scraped entry that starts later, or at the
end. The scraped entries are never reordered. A manual entry whose title already
appears in the scraped list (apostrophes and punctuation ignored) is left out of
the ticker; it stays stored until it expires. If the scrape fails, the manual
conferences are still returned.

## Ticker wording

Built to match the scraped entries, e.g.
`2027 Southeast Children's Ministry Conference: at CC Gwinnett, GA, February 25th-27th - More Info`
- `at <Church>`, `<City, State>` and the dates are joined with commas; church and
  city/state are optional and skipped if blank.
- Dates are written from the two date pickers: `February 25th-27th`,
  `February 28th-March 2nd`, or `February 25th` for one day.
- Start and end dates are also sent as `startDate`/`endDate`, so the existing
  "in N days" / "Day X of Y" countdown works exactly as for scraped conferences.
- Link text defaults to "More Info". No link URL = no link.
- The label on the ticker bar now reads "Conferences" (was "CCA Conferences"); it
  still links to calvarycca.org/conferences.

## Automatic cleanup (rule changed 2026-10-11)

One rule for BOTH kinds (manual and calvarycca.org): a conference stays in the ticker
for 4 full days after its last day and is removed on the 5th day (last day Oct 10 ->
shown through Oct 14, gone Oct 15). The point is to keep it visible while its YouTube
sessions are being found. The number is `CONFERENCE_KEEP_DAYS_AFTER_END` in
`src/index.js`; `isConferenceExpired(endDate, today)` is the test. "Today" is the date
in Pacific time.

- **Manual conferences:** deleted from KV for good (`pruneManualConferences`) every time
  the list is built and whenever the admin opens the Conferences screen. KV is written
  only when something was removed. The admin list shows "Removed automatically after
  <last day shown>" (`removeAfter` = end + 4 days). The admin cannot save a conference
  that has already ended.
- **calvarycca.org conferences:** left out of the `/conferences` response on every
  request (`handleConferences`), after the 6-hour edge cache, so the cutoff is always
  today's date. The scrape itself and its cache are untouched.
- **No dates = never removed.** A scraped entry whose dates the parser could not read
  (`startDate`/`endDate` null) cannot expire. Fix it with an entry in
  `CONFERENCE_DATE_OVERRIDES` (give it real dates). Put the YEAR in `titleMatch` for
  a one-off so it cannot touch next year's entry. The 2026 Northwest Washington Puget
  Sound Conference ("September 17th & 19th") is handled this way; the 2027 one will
  fall through to the generic "Puget Sound" suppress rule and needs its own dated
  override once its dates are known.
- **Wording after it ends:** the ticker shows "N days ago" (e.g. "at CC Philly - 2 days
  ago") where "in N days" / "Day X of Y" normally goes. The hamburger badge and menu
  countdown ignore ended conferences. Known quirk: the front end counts days on the
  UTC calendar (same as the existing countdown), so the label can flip a few hours
  before midnight Pacific on a conference's last day.

## Admin routes (all admin-only; non-admin gets 401)

- `GET /api/admin/conferences` - list (prunes first).
- `POST /api/admin/conferences` - body `{ id?, title, church?, location?, startDate,
  endDate?, linkText?, link? }`. No id = add; id = edit (404 if gone). Validates title,
  real dates, end not before start, and that a link is http(s).
- `DELETE /api/admin/conferences` - body `{ id }`. Deletes before the automatic date.

## Site Management popup (public/index.html)

- One header button, "Site Management" (admin only), replaces Manage Locations and
  Manage Featured Video. On phones it is one row in the hamburger menu in place of
  those two. "+ Add Location" stays as its own button/row.
- The popup has three cards: Locations, Featured Video, Conferences. Locations and
  Featured Video open the existing screens by clicking the original buttons, which
  are still in the page but permanently hidden (`.legacy-admin-btn`) - do not delete
  them, the popup and other admin code depend on them.
- Conferences screen: list of the manual ones (Edit, Delete with a "Confirm delete"
  second click, and "Removed automatically after <date>"), the add/edit form, and a
  live "How it will read in the ticker" preview. Back returns to the Site Management
  popup. Saving or deleting refreshes the ticker.

## Tested (2026-10-11, new removal rule)

30 Node checks run against the real server and front-end code: the 4-day boundary
(last day, +1 and +4 kept, +5 removed), the Pacific midnight edge, leap-year and
year-end date math, manual deletion, the scraped filter on a cached list, undated
entries kept, the Puget Sound overrides, "N days ago" wording, and the badge/menu
ignoring ended conferences. Not yet run on the live site.

## Tested (2026-10-09)

42 Node checks against the real server code with a mock KV and clock (date wording
including ordinals and month/year crossings, validation, the exact cleanup boundary
at midnight Pacific, merge order, duplicates, add/edit/delete, limit, non-admin 401,
scrape failure) and a headless-browser run of the real markup and styles (button
changes, popup, form, preview, validation, add/edit/delete, ticker refresh, phone
layout). Not yet run on the live site.
