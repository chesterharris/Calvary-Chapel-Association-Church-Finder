# Visitor stats (own anonymous counter) - notes

Shown as one line at the top of the admin "Live Check Debug" pane:
`Visitors current: N | today: N | past 7 days: N | Trendline: (14 days)`.
Second opinion: Cloudflare dashboard -> Observability -> Analytics -> Account analytics / Web analytics.

## How it works
- Page (public/index.html, loader script at the end of the body): `ccaStartAnalytics(isAdmin)` runs once the admin check finishes. It does nothing when the visitor is signed in as admin or the browser has been marked with `?notrack=1` (undo: `?notrack=0`; flag lives in localStorage `ccaFinderNoTrack`). Otherwise it loads the Cloudflare Web Analytics beacon AND starts our own pings (`startVisitPings`).
- Pings: POST /api/hit {sid, kind}. `sid` = random 20-char code in the tab's sessionStorage (`ccaVisitSid`). First load in a tab sends kind "visit" (`ccaVisitCounted` stops refreshes counting again); then kind "ping" every 60 s while the tab is visible.
- Worker (src/index.js, "Visitor stats" block): KV `visits-active` = {sid: lastSeenMs} (entries older than 5 min dropped, max 500, TTL 15 min); KV `visits-daily` = {YYYY-MM-DD (Pacific): count} (last 30 days kept). A "visit" only counts if that sid was not already seen in the last 5 minutes. Bot-looking user agents and malformed codes are ignored. No IP, user agent or name is stored.
- GET /api/admin/visitor-stats (admin only) -> {current, today, last7, days[14]}. The pane refreshes it every 60 s while open.

## Known limits
- Approximate: two hits in the same instant can overwrite each other (KV read-modify-write).
- Counting starts at deploy; no history before that. Numbers will differ somewhat from Cloudflare's.
- Per browser only: private windows, cleared site data, new devices need `?notrack=1` again.
- Admin sessions are never counted, so "current" will not include you.
