# conference-ticker-notes.md

How the Conferences ticker gets its entries, and the admin "Site Management" popup
with manual conferences (built 2026-10-09).

## Where the entries come from

1. **calvarycca.org/conferences** (unchanged). `/conferences` re-reads and parses that
   page only when a visitor loads the site and the stored copy is older than 6 hours
   (`CACHE_SECONDS`). There is no scheduled conference refresh - the every-2-minutes
   Worker job is only the live-stream check. Nothing is ever removed from this list
   because of a past date; it follows the source.
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

## Automatic cleanup

Every time the list is built, and whenever the admin opens the Conferences screen,
any manual conference whose last day was yesterday or earlier is deleted from KV
for good (`pruneManualConferences`). "Today" is the date in Pacific time, so a
conference is not removed while it is still its last day anywhere in the contiguous
US. KV is written only when something was removed. The admin cannot save a
conference that has already ended.

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

## Tested (2026-10-09)

42 Node checks against the real server code with a mock KV and clock (date wording
including ordinals and month/year crossings, validation, the exact cleanup boundary
at midnight Pacific, merge order, duplicates, add/edit/delete, limit, non-admin 401,
scrape failure) and a headless-browser run of the real markup and styles (button
changes, popup, form, preview, validation, add/edit/delete, ticker refresh, phone
layout). Not yet run on the live site.
