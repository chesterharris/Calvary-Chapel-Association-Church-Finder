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

## Judgment calls worth a second look
- Hourly countdown refresh interval (see above).
- "Admin ✓ (sign out)" label text.
- Radio ticker text color reuses the existing brass/paper tones against the row's new evergreen background rather than introducing new colors — should be legible but worth a glance in daylight/phone screen.
- No dismiss button for Radio on the mobile row (kept everywhere else).

## Testing
`loadtest.js` (jsdom) in this folder exercises: DOM relocation both directions, hamburger open/close, badge dot/number/hidden states, and the countdown text/fallback logic. Not part of the deliverable — it's local test scaffolding (along with its `node_modules`), safe to delete or ignore.
