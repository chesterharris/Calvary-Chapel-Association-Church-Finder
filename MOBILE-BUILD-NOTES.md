# Mobile-First UI Build — Notes

Built on top of the reconciled `index.js` / `index.html` (see `RECONCILIATION-NOTES.md`), implementing the decisions in `MobileFirstDesign.md`. Verified with a jsdom load-order/functional test (0 unexpected JS errors, all functional checks passing) — no browser available in this environment for a visual check, so please eyeball it on a real phone/DevTools before shipping.

## What's new

**Conference countdown + day-of-total (`index.js` + `index.html`)**
- `index.js`'s `parseConferences()` now extracts `startDate` / `endDate` / `locationPrefix` from the freeform detail text (e.g. `"CC Chino Valley, CA — Aug 6–8"`) via regex, falling back to `null` when it can't parse a date.
- A manual override list, `CONFERENCE_DATE_OVERRIDES` (currently empty), lets you hand-correct any conference the regex gets wrong or can't parse at all — this was the hybrid approach you picked. To add one: `{ title: '<exact or partial conference title>', startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD', locationPrefix: '...' }`, pushed into that array near `CONFERENCE_MONTH_NAMES`.
- `index.html` turns parsed dates into: "Day X of Y" while underway, "Starts in N days" when upcoming, and the original unedited detail text when a conference has no parseable/overridden date. Refreshes hourly (`CONFERENCE_DISPLAY_REFRESH_MS`) so it doesn't need a re-fetch to stay current — my addition, not explicitly spec'd, easy to remove if you'd rather it only update on the normal ticker refresh.

**Hamburger (☰) menu**
- New `#hamburgerBtn` in the header, visible only under the 720px breakpoint, opening `#hamburgerMenu` with four rows: Conferences (links out to calvarycca.org/conferences/, with the live countdown text), All Stations, Feedback, Admin.
- All Stations and Feedback delegate to the existing desktop buttons' click handlers rather than duplicating logic, so any future changes to those flows apply automatically to the mobile menu too.
- Admin mirrors the existing sign-in/sign-out branching and shows "Admin ✓ (sign out)" once signed in — wording is my call, change it if you want different copy.
- Badge on the hamburger icon: a plain dot whenever a conference is underway or starts within 14 days (your "keep showing dot" decision covers the underway case too), a number when it's some other countable badge state per the design doc, hidden otherwise.

**Condensed mobile header**
- Sub-title text and search label drop out under 720px; search input goes full-width on its own row; the full conference ticker bar is hidden (its content lives in the ☰ menu instead).

**Shared Live Now / Radio row**
- Below 720px, `#btnLiveNow` and `#radioTicker` are moved via JS into a new `#mobilePrimaryRow` so they share one row (Radio's box/border chrome is stripped down to plain text on that row); moving back above 720px restores both to their original desktop positions. This uses the same `matchMedia`-driven relocation pattern already in the codebase for the mobile radio picker.
- Radio's dismiss (✕) button is hidden on that mobile row only, since Radio is meant to be a permanent CTA there — still present on desktop.
- Tapping the Radio row on mobile opens the full-screen station picker instead of the old per-station click behavior (which remains for desktop).

## Follow-up round (Sept 2)

- **"Live in Nm" text**: shortened the header countdown from "Next live service begins in 42 mins" to "Live in 38m" so it fits the shared mobile row better.
- **Map going blank after picking a station on mobile**: root cause was `showMiniPlayer()`/`hideMiniPlayer()` calling `map.invalidateSize()` while the full-screen mobile picker had the map hidden (`display:none`) - Leaflet cached a bogus 0x0 size and "corrected" for it with a pan once the map reappeared, panning the view off into empty tile space. Fixed by skipping `invalidateSize()` while either mobile full-screen takeover (station picker or the new conferences pane below) is open, and doing the one correct call when each one closes instead.
- **Conferences ☰ menu item no longer leaves the site**: it now opens a new full-screen in-app pane (`#mobileConferencesPane`, same takeover pattern as the station picker) listing the same entries the ticker already has, instead of linking out to calvarycca.org/conferences/. Each conference's own registration/info link (when it has one) still opens externally, per your call - that's a deliberate per-conference destination, not the generic overview page.
- **Conference date parsing - found and fixed a real bug**: it had been tested only against non-ordinal sample text ("Aug 6–8"). Pulling the actual live text from calvarycca.org/conferences/ showed every real entry uses ordinal suffixes on both days ("September 7th – 9th"), which the regex didn't account for - it silently truncated every real conference to a single-day event. Fixed the regex to tolerate `st`/`nd`/`rd`/`th` directly against the digits; re-verified against all 17 entries currently on the live page and all parse correctly now. One entry, "Northwest Washington Puget Sound Conference: September 17th & 19th," uses "&" instead of a date range and is two specific days with a gap on the 18th (confirmed, not a 3-day event) - added to `CONFERENCE_DATE_OVERRIDES` with a new `suppress: true` option that forces it to always show its plain text rather than guess.
- **"Live Now" pulse looking static on the mobile map popup**: checked the code - the badge and its pulse animation are identical for mobile and desktop, and the only thing that disables it is the standard `prefers-reduced-motion: reduce` media query. No mobile-specific bug found; most likely the test device has Reduce Motion or a battery-saver "remove animations" setting on. Flagging back to you rather than guessing further - let me know the device/browser if it's still static with that setting off.

## Follow-up round 2 (Sept 2)

You asked whether "All Stations" in the ☰ menu should also become a full-screen takeover, matching Radio and Conferences. Agreed - it's the more consistent mobile pattern, and it also fixes a real rough edge that panel already had: on phones it was a right-side drawer capped at 88vw (an older band-aid), which still left a sliver of the map visible/tappable behind it and had previously needed a fix because its default width dragged the close button off-screen entirely.

Made it a full-screen takeover below the same 720px breakpoint where the header swaps to the ☰ menu in the first place - above that width it's still the visible desktop button opening the normal side drawer, unchanged. Reused the existing panel and its logic (search, starter-set onboarding, favoriting) as-is; only its mobile presentation changed. If you resize past 720px while it's open on mobile, it now drops back to the side-drawer look instead of closing, matching how it already behaves when opened from the desktop button.

## Follow-up round 3 (Sept 2) - important deploy note

After deploying, the conference ticker was still showing raw text instead of a countdown. The parser itself was fine (re-verified "September 7th – 9th" -> correctly parses to 2026-09-07/2026-09-09) - the real cause was edge caching: `/conferences` is cached in Cloudflare's Cache API for 6 hours, and the code already has a `CACHE_VERSION` constant specifically meant to be bumped whenever `parseConferences()` changes, so a fix is never masked by an old cached response. I changed the parser earlier today but missed bumping it, so the deployed Worker kept serving the pre-fix cached response. Bumped `CACHE_VERSION` from 2 to 3 in this build - **this one needs redeploying** for the countdown to actually show up; a hard browser refresh alone won't touch the edge cache. No conference data is ever cached client-side (no localStorage involved anywhere in this feature) - it's purely this server-side cache.

If a future date-parsing tweak ever needs to go out immediately rather than waiting up to 6 hours, bump `CACHE_VERSION` again when you make that change.

## Follow-up round 4 (Sept 2)

Two fixes to the countdown text itself:

- **"5 days" read as the conference's own duration, not a countdown to it.** Changed the wording to "in 5 days" everywhere this text appears (ticker, mobile conferences pane, hamburger menu row) - refactored the three separate copies of this wording logic into one shared function (`computeConferenceCountdownText`) so this can't drift out of sync between them again.
- **Made the countdown portion stand out visually in the ticker**, per your ask for options - went with bold + the same gold accent (`#f2c76e`) already used for this ticker's own "more info" links (your pick of the three I gave you: bold+color / icon prefix / pill badge). Only the countdown/Day-X-of-Y text is bolded, not the location prefix or the title. The mobile conferences pane reuses the same markup, but overrides the color to brass instead of gold there, since that pane's rows sit on the light paper background where the ticker's gold would be hard to read - same emphasis, adapted to a light vs. dark background.

## Judgment calls worth a second look
- Hourly countdown refresh interval (see above).
- "Admin ✓ (sign out)" label text.
- Radio ticker text color reuses the existing brass/paper tones against the row's new evergreen background rather than introducing new colors — should be legible but worth a glance in daylight/phone screen.
- No dismiss button for Radio on the mobile row (kept everywhere else).

## Testing
`loadtest.js` (jsdom) in this folder exercises: DOM relocation both directions, hamburger open/close, badge dot/number/hidden states, and the countdown text/fallback logic. Not part of the deliverable — it's local test scaffolding (along with its `node_modules`), safe to delete or ignore.
