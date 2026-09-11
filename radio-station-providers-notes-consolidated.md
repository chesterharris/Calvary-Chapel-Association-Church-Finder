# Radio Station Providers - Reference Notes

_Consolidated 2026-09-10 from `radio-station-providers-notes.md` and
`radiostationprovidersnotes.md` (two copies of the same running notes that
diverged when the filename changed partway through). This file is the
complete, current version - the two originals can be deleted once this one
is confirmed to look right. Diffing both showed no information was unique
to the older/shorter file; everything it had is included here._

How CCA Finder's radio ticker/mini-player gets "now playing" data and stream
URLs for each station, broken down by provider type. Written up after adding
several real stations so the next one goes faster.

## How it all fits together (in `src/index.js`)

- `RADIO_STATIONS` - the config-driven list of stations. Each entry has a
  `provider` key plus whatever fields that provider needs (see below).
- `RADIO_PROVIDERS` - a registry, one entry per provider type. Each provider
  normally exposes `buildNowPlayingUrl(station)` and `parse(rawText)` - one
  fetch, then parse the response.
- **Some providers can't use the plain `buildNowPlayingUrl`+`parse` pair**
  and instead expose `fetchAndParse(station)`, which takes full control of
  its own fetching and returns the final `{ title, artist, coverUrl }`
  shape directly. `fetchStationNowPlaying` checks for `fetchAndParse` first
  and only falls back to the normal single-fetch path if it's absent -
  existing single-fetch providers needed zero changes when this was added.
  Three different reasons a provider ends up needing it, confirmed in
  practice: needing more than one HTTP call to the *same* source
  (`live365hls`'s master-playlist-then-edge-URL chain, `aiir`'s WebSocket
  subscribe); needing `station`'s own fields (not just the raw response
  text) to build part of the result (`radioboss` is only one HTTP call, but
  still needs `station.stationId` to construct the cover-art URL, which a
  plain `parse(rawText)` never sees); or needing a second call to a
  *different, unrelated* source to fill in something the primary response
  doesn't have at all (`triton`'s now-playing XML has no artwork field or
  predictable artwork URL, so it makes a follow-up call to Apple's iTunes
  Search API to find cover art from the title/artist text).
- `parse()` (or `fetchAndParse()`) must **always** return
  `{ title, artist, coverUrl }` no matter the provider's native format -
  that's the one contract the rest of the code (caching, ticker rendering,
  mini-player) relies on. `coverUrl` is `null` for any provider/station
  that has no artwork available.
- Adding a **station** on an already-supported provider = one new entry in
  `RADIO_STATIONS`, nothing else.
- Adding a **new provider type** = one new entry in `RADIO_PROVIDERS`,
  nothing else touches the handler, caching, or frontend.

Frontend playback is always a plain `<audio>` tag (`radioAudio.src =
station.streamUrl`) - so `streamUrl` must always be a **direct, continuous
audio stream** (MP3/AAC-over-HTTP, Shoutcast/Icecast-style), never an HLS
`.m3u8` playlist, which a bare `<audio>` tag can't play in most browsers.

**`displayName` naming convention (as of the Browse Panel/favoriting
update):** early on, `displayName` needed a `(state)` suffix on almost
every station, since the ticker's name was the ONLY context a visitor
ever had. Now that the Browse Panel shows `cityState`/`homePage` properly
labeled (see the Favoriting section below), that's no longer necessary -
**state suffixes have been dropped from displayName** except where two
stations would otherwise collide (e.g. `The Truth (TN)` / `The Truth
(GA)` keep theirs, since favorites/dedup/mini-player all key off the
exact `displayName` string, and two identical names would be
indistinguishable in code). When renaming an existing station, remember
to also update `RADIO_STARTER_PACK_NAMES` in `index.html` if it's part of
the starter pack - a stale name there silently fails to match anything.

**Optional display-only fields**, shown in the Browse Panel only, never
in the ticker:
- `cityState` - e.g. `"Vero Beach, FL"`.
- `homePage` - the station's own website, rendered as a link.

Both are hand-entered, purely cosmetic, and safe to omit on any station
that doesn't have them filled in yet - nothing renders that line if
they're absent. See the Favoriting section below for the fuller picture
of how these fit into the Browse Panel.

---

## Provider: `securenetsystems`

**Station fields needed:**
- `subdomain` - the `streamdbXweb.securenetsystems.net` host serving that
  station's now-playing XML.
- `callSign` - the technical station ID used in the XML endpoint's path.
  NOT necessarily the same as the public `displayName` (e.g. Dove FM's
  internal callSign is `DOVEMAIN`).
- `streamUrl` - the direct stream, pattern `https://iceXX.securenetsystems.net/CALLSIGN`.

**Now-playing endpoint:** `https://{subdomain}/player_status_update/{callSign}.xml`

**Response shape (XML):**
```xml
<playlist>
  <title>Light On The Hill</title>
  <artist>James Kaddis</artist>
  <cover>https://cdnrf.securenetsystems.net/file_radio/album_art/.../....jpeg</cover>
  ...
</playlist>
```
`<title>`, `<artist>`, and `<cover>` are what we parse. `<cover>` is
station/track album art - not every station or every moment necessarily has
one populated.

**How to find subdomain/callSign for a new station:** the station usually
sends you (or you can find via their listen-live page) the XML feed URL
directly - it IS the subdomain + callSign. `streamUrl` requires digging into
the station's public player page source or DevTools Network (see "Finding
stream URLs" below) - it's not derivable from the XML feed URL.

**Known gotcha - cover art hotlink protection:** `cdnrf.securenetsystems.net`
blocks image requests that arrive with a `Referer` header from another site,
even though the URL loads fine opened directly (no referrer). Fix: the
mini-player's `<img>` tag uses `referrerpolicy="no-referrer"` so the browser
doesn't send a `Referer` at all. If a future CDN does this too, same fix
applies.

**Stations currently configured:** EQUIP FM, WIAM, DOVE FM, REVIVE FM,
The Truth (TN) / WZTH, The Truth (GA) / WZTG, Truth FM / WZTM,
Crossover / KCHG, KVNG, CSN International / CSNAAC, Hope FM / WVBV.

**CSN International (Twin Falls, ID) / CSNAAC** — added 2026-09-03.
subdomain `streamdb4web.securenetsystems.net`, `streamUrl` confirmed from
the station's own player page source (`streamSrcDB`), not the XML feed -
same as every other station here, the now-playing endpoint URL and the
stream URL are unrelated and both had to be found separately. Unlike most
entries in this file, `CSNAAC` doesn't map to a single local translator we
could find by searching - it reads as CSN International's generic
national/web relay rather than one church's own station, so `cityState`/
`homePage` here point at the network itself (Twin Falls, ID /
`csnradio.com`) rather than a specific CCA church page, per what was
confirmed with the person adding it.
**Freshness caveat:** added on the strength of a single snapshot showing a
real, specific, dated program title ("The Word For Today" - a genuine
syndicated teaching program, not blank/generic like the GraceFM/KGPS
dead-feed cases) - the same bar WXMB passed before it was later found
stale. Could not independently re-poll the XML endpoint a second time to
compare (blocked by the site's robots.txt for automated fetching), so
freshness isn't fully confirmed the way KVNG's was. Per the existing
policy for teaching-heavy SecureNetSystems stations, worth a deliberate
second look in about a week to confirm the title/`programStartTS` are
actually moving before treating it as fully verified.

**KVNG (Casa Grande, AZ, branded "Grace 91.1") - NOT the same station as the
skipped GraceFM/KXGRFM below**, despite the very similar "Grace" branding
- easy to mix these two up by name alone. KVNG's metadata pipeline is
alive and well (confirmed real, current title/artist/timestamp), unlike
KXGRFM's dead one. subdomain `streamdb8web.securenetsystems.net`.

**GraceFM / KXGRFM (Aurora, CO)** — investigated and **not added**.
subdomain `streamdb9web.securenetsystems.net`, callSign `KXGRFM`
(confirmed via the redirect target of `radio.securenetsystems.net/v5/KXGRFM`).
The XML feed (`.../player_status_update/KXGRFM.xml`) returns empty
`<title>`/`<artist>` with `programStartTS` stuck at `21 Nov 2019 20:27:37` -
metadata pipeline appears dead/never configured, not just a quiet moment
(distinct from WJWD's genuinely-no-title-field case). No alternate feed
found - checked the KXCL simulcast (Colorado Springs translator, same
programming) for a separately-populated feed, and GraceFM's Subsplash app/
"Calvary Live" page for a public now-playing API; neither panned out.
Skipped per the no-generic-placeholder policy above. Revisit only if the
station overhauls their metadata setup.

**UPDATE 2026-09-10: added after all, via the `publishedschedule` provider**
rather than the dead XML feed above - see
`radio-station-published-schedule-notes.md` for the full rationale and
GraceFM's specific transcription notes. `streamUrl` above is confirmed
live/playable independent of the metadata pipeline being dead.

**WXMB (Myrtle Beach, SC)** — added, then **removed** days later once the
dead pipeline became obvious. This is the same "dead pipeline" failure
family as GraceFM above, but caught differently: at add-time this station
looked genuinely fine (real-looking populated `<title>`/`<artist>`, not
GraceFM's obviously-empty tags), so it passed initial verification. The
tell only showed up over time - the ticker displayed the exact same
`"Boldly Speaking" / "Ron Dozler"` for days straight, never changing.
Confirmed via `programStartTS` frozen at `29 Jul 2026 21:31:10` (nearly a
month stale by the time this was caught) that the feed had genuinely
stopped updating - subdomain `streamdb7web.securenetsystems.net`, callSign
`WXMB`. **Takeaway for future stations:** a plausible-looking title/artist
pair at add-time isn't sufficient confirmation on its own for talk/teaching
stations specifically - their programs run long, so a station that's
genuinely fine could also look "unchanged" over a single spot-check.
Worth a deliberate second look a few days after adding any new
teaching-heavy SecureNetSystems station, not just a one-time check at
add-time. Removed rather than left in the "may recover eventually" bucket
(unlike WJWD's grandfathered occasional-quiet exception) since a full
month of zero movement is well past "occasionally quiet." Revisit only if
someone happens to notice the feed moving again.

**KGPS "The Way" (Kingman, AZ)** — investigated and **not added**.
Confirmed `streamUrl: https://ice5.securenetsystems.net/KGPS` works fine
(real playable audio). This station's player page uses a different
SecureNetSystems template than most others in this file - `/cwa/index.cfm?
stationCallSign=...` (seemingly "Classic Web App") rather than the
`/v5/...` template GraceFM/KXGRFM and KVNG use - and unlike `/v5/` pages,
`/cwa/` does NOT redirect to a per-station `streamdbXweb.securenetsystems.net`
subdomain at all (confirmed via address bar after loading the page
directly). Initially this looked like a dead end because the page's own
inline JS defines an unused `playlistHistoryXMLurl` variable pointing at a
DIFFERENT, wrong filename (`KGPS_history.xml`, which 404s) - the real
fetch logic lives in an external file (`/cirruscore/cirruscore_v2.js`) we
had no way to read directly.

**Resolved via live Network > Fetch/XHR traffic** (same technique that
worked for Aiir's WebSocket): the page genuinely polls
`https://radio.securenetsystems.net/player_status_update/KGPS.xml` (plain
`{callSign}.xml`, same convention as every other securenetsystems station
in this file, no `_history` suffix, no separate streamdb subdomain needed
for this template) - confirming the very first URL tried at the start of
this investigation was actually correct all along. That request returns
HTTP 200, but the response body is itself an error page ("The system
cannot find the file specified") - a soft-404 baked into a 200 response,
not a wrong guess on our part. Same underlying root cause as GraceFM
below: the station's metadata file appears genuinely missing/never
configured server-side, just confirmed through a different diagnostic
path this time (live traffic vs. manual XML fetch).

Skip per the no-generic-placeholder policy above, same as GraceFM. Revisit
only if the station's metadata pipeline gets fixed on SecureNetSystems'
end.

**Hope FM / WVBV (Medford Lakes, NJ)** — added 2026-09-11, the radio
ministry of Calvary Chapel Marlton (`hopefm.net`). Larry supplied the XML
feed URL and a real sample response directly (title "A Moment of Truth" /
artist "Gary Clark", `<cover>` empty), so subdomain/callSign didn't need
separate discovery this time: `subdomain`
`streamdb4web.securenetsystems.net`, `callSign` `WVBV`. This is the
Cirrus Encore player template (`/cirrusencore/{callSign}`, same family as
the plain `/v5/` stations elsewhere in this file, distinct from KGPS's
`/cwa/` template above) - page title and on-page slogan both read "Hope
FM". `streamUrl` (`https://ice26.securenetsystems.net/WVBV`) taken from
the player page's `streamSrcDB`/`streamSRC` JS variables, same convention
as every other station in this section - confirmed against the response,
not guessed from the XML endpoint. Same `streamdb4web` subdomain as WZTG/
WZTM/CSNAAC above, different `ice` edge host (`ice26`, shared with WZTG/
WZTM specifically).

---

## Provider: `icecast`

**Station fields needed:**
- `host` - the host serving the station's Icecast status feed. Usually
  `host:port`, but can also include a path segment for shared/proxied
  hosting setups (see "shared hosting proxy paths" below) - whatever
  string, when combined as `https://{host}/status-json.xsl`, produces a
  working status URL.
- `mount` - the mount point (no leading slash) identifying this station's
  stream on that server.
- `streamUrl` - same host, e.g. `https://{host}/{mount}`.

**Now-playing endpoint:** `https://{host}/status-json.xsl?mount=/{mount}`

**Response shape (JSON):**
```json
{
  "icestats": {
    "source": {
      "title": "Ken Graves - GodSword",
      ...
    }
  }
}
```
- `source` can be a single object (one mount on that server) or an array
  (multiple mounts).
- Icecast reports one combined `title` field, not separate title/artist.
  By convention it's usually `"Artist - Track"` (or `"Host - Program"` for
  talk stations) - we split on the first `" - "` to recover both. If a
  station's title doesn't follow that convention, we fall back to treating
  the whole string as the title with no artist, rather than guessing wrong.
- **Bare "- Title" with no artist** (confirmed in production - WRBP): some
  stations report an empty artist as a literal leading `"- "` instead of
  omitting the separator. After trimming there's no leading space left to
  match the normal `" - "` split against, so this needs its own check -
  strip a leading `-\s+` and treat the rest as a title-only string.
- **No cover art field exists in Icecast's format at all.** `coverUrl` is
  always `null` for this provider - not a bug, just a format limitation.
- **False-positive splits on talk/teaching content** (confirmed in
  production - KQIP): the automatic `"Artist - Track"` split assumes
  every `" - "` means that, but talk stations can legitimately have a
  `" - "` in a title that ISN'T an artist pairing at all - e.g. KQIP
  reports scripture references like `"Jeremiah 49 - Jeremiah"`, which the
  normal split would misreport as artist `"Jeremiah 49"`. Added an
  opt-in `noArtistSplit: true` station field (see the field list above)
  as an escape hatch - only set it after actually confirming a station's
  real titles need it, not speculatively on every talk station (most
  talk-format Icecast stations, e.g. WJWD, genuinely have no dash at all
  and are unaffected by this).

**Known gotcha - multi-mount servers return an array, and you must filter
it yourself.** Some Icecast servers host several mounts for one station
(confirmed in production - TrueFM's server had `/autodj`, `/live`, and an
empty `/stream` placeholder all on one box). Querying `status-json.xsl`
*without* `?mount=` returns **all of them** as an array - and our parser's
array fallback just takes the first element, which is NOT necessarily the
one you want (in TrueFM's case, index 0 was the automation filler, not the
real named station). Always confirm `?mount=/{name}` actually narrows the
response down to a single object before configuring the station - don't
assume array-index-0 is correct.

**Known gotcha - mixed-up multi-station pages:** stations sharing an Icecast
server (or a "sister stations" sidebar on their web player) can make it easy
to grab the wrong page's source by mistake - happened twice in practice
(SecureNetSystems' WZTG/WZTM, and this provider's KLHT AM/FM). Always
double check the page's own `stationCallSign`/`title`/`<audio>` `src`
actually matches the station you think you're looking at before using its
data.

**Known gotcha - plain HTTP streams get hard-blocked (not just a warning).**
If a station's *only* working stream URL is `http://` (especially a raw IP
address, which browsers won't even attempt to auto-upgrade to HTTPS), it
will fail with a hard "Mixed Content" block in the console once deployed -
confirmed in production with WRBP 92.5FM, which had to be removed entirely
because there was no `https://` version that worked at all. Test playback
on the *deployed* site (not the raw URL in a new tab) before committing to
a station whose stream is HTTP-only; the metadata endpoint can be HTTP-only
without a problem (that fetch happens server-side, in the Worker, with no
browser mixed-content restriction), but the mini-player's `<audio src>`
absolutely cannot be.

**KBOK 93.3 FM (Reno, NV)** — investigated and **not added**. Same dead
end as WRBP: Shoutcast-style stream (`http://198.245.60.88:8024/;stream.mp3`)
is HTTP-only on a raw IP, no `https://` version anywhere. The station's own
"Listen Online" link on `kbook933.com/listen` points at that exact same raw
stream - not a mismatch on our end, it's their only option. Checked their
TuneIn listing (`KBOK-933-s267370`) as a possible HTTPS-fronted
alternative; TuneIn's actual player stream is loaded through a private,
non-exposed mechanism, not a plain URL we could point `streamUrl` at, so
that's a dead end too. Skip unless the station itself moves to an
HTTPS-capable host - not something fixable on our side.

**Shared hosting / proxy paths:** some hosts (e.g. `shoutcheap.com`,
apparently a Centova Cast-based shared streaming host) expose stations
through a proxy path like `/proxy/{name}/stream` rather than a bare
`host:port`. The `host` field just needs to be whatever string makes
`https://{host}/status-json.xsl?mount=/{mount}` resolve correctly - it can
include that extra path segment. Confirmed working example (TrueFM):
`host: 'radio.shoutcheap.com/proxy/kaxzann1'`, `mount: 'live'` ->
`https://radio.shoutcheap.com/proxy/kaxzann1/status-json.xsl?mount=/live`.
Useful trick when a station's site only embeds a third-party player (e.g.
LibreTime) with no visible audio `src` to dig out: if the status endpoint
follows a `.../{prefix}/status-json.xsl` pattern, the actual stream is
often at `.../{prefix}/{mount}` by the same logic - reasonable guess, but
verify playback since it's inference rather than confirmed (see Calvary
Radio / Vero Beach below).

**Known gotcha - some stations report NO metadata at all, not just blank
fields.** WJWD (WI)'s Icecast `source` object has no `title` key whatsoever
(confirmed via a real response) - not an empty string, genuinely absent.
This turned out to be a talk-automation setup with no song/title injection
at all, not a bug on our end. The existing "no title -> fall back to a
plain 'Live' label" frontend behavior already handles this gracefully with
zero code changes needed.

**Policy (as of WJWD): don't add new stations like this going forward.**
WJWD was kept as a deliberate one-off exception, decided before this
became a firm rule - it's grandfathered in, not a precedent. The standing
policy now: if a station's feed can't provide real program/song info (not
just a generic "Live" placeholder), don't add it, full stop. Verify this
*before* investing time on the rest of the setup, not after.

**Known gotcha - a station's own official player failing the same way is
strong outside confirmation, not a coincidence.** If a station's *own*
website embeds a player that also throws a Mixed Content error in
DevTools trying to load their stream, that's the station's infrastructure
being broken for everyone, not something specific to our subdomain -
useful for deciding quickly whether a fix is even possible.

**Known gotcha - the same shared-hosting brand can run EITHER Icecast or
Shoutcast underneath, and you can't assume which.** Confirmed in
production: `shoutcheap.com` hosts both TrueFM (genuinely Icecast,
`status-json.xsl` returns real JSON) and WLEB (genuinely Shoutcast v2 -
`status-json.xsl` on that particular proxy just serves the raw audio
stream back, not JSON at all; the real data lives at `stats?json=1`
instead - see the `shoutcast` provider below). The hosting brand name
tells you nothing about which server software is actually running -
always confirm which endpoint returns real JSON before assuming.

**Stations currently configured:** KLHT FM, KLHT AM - both on
`klht.rhemastreams.net:8443`. TrueFM - via the shoutcheap.com proxy
path above. CCVB - `host: 'wwsh.ccvb.fm/stream'`,
`mount: 'main'`; `streamUrl` was inferred from the status endpoint's own
path pattern rather than confirmed directly (the church's page only embeds
a third-party LibreTime player) - verify this one plays before trusting it
blindly. WJWD - the no-metadata case above; kept in the list anyway as
a deliberate call predating the policy above, still fully playable. KSGR -
another single-mount Icecast setup; its `title` field is populated but
currently shows a generic automation placeholder ("KXGR PRODUCTION")
rather than real show info most of the time - worth periodically checking
whether it starts reflecting real programming. WRBP 92.5FM (WI) was added,
then **removed** after confirming a hard mixed-content block in production
(see gotcha above). KYYR-LP ("The Bridge of Hope FM 97.9," Yakima WA) was **never added** after confirming
the identical hard mixed-content failure - notably, the station's *own*
website's player also failed to load the stream with the same Mixed
Content / `ERR_CONNECTION_CLOSED` error in DevTools, strong outside
confirmation the streaming port itself has no TLS support at all, not
something specific to how we'd embed it. KQIP (Chico, CA) - straightforward
single-mount Icecast setup (`host: 'kqip-streamt.ccchico.com'`,
`mount: 'stream.mp3'`), notable only for needing `noArtistSplit: true`
(see gotcha above) since its teaching-content titles are scripture
references, not song credits. KACM (Montrose, CO) - `host:
'streamer.calvarymontrose.com'`, `mount: 'KACM'`; see the gotcha below
for why this one's confirmed straight from Icecast rather than the
station's own player-reported data.

**Known gotcha - a station's own player may front real Icecast data through
its own custom API, not a reason to build a new provider.** KACM's page
uses a bespoke WordPress plugin ("vmplayer") that calls its own
`admin-ajax.php` action (with a nonce) to fetch now-playing data, and that
ajax response already arrives with title/artist pre-split
(`"title": "The Word for Today", "artist": "Pastor Chuck Smith"`) plus an
`artwork_url`. It would be easy to assume this needs a new "vmplayer"
provider, but the plugin's own embedded config (`window.vmplayerConfig`)
states `"stream_type":"icecast"` and the ajax response itself labels its
source `"icecast-json"` - this is just a custom UI layer in front of a
perfectly normal Icecast server. Fetching `status-json.xsl` directly
confirmed it: raw title `"Pastor Chuck Smith - The Word for Today"`, the
standard "Host - Program" combined format the existing `icecast` parser's
`" - "` split already handles, matching the plugin's own pre-split fields
exactly. Going straight to Icecast is more robust than depending on the
WordPress site's ajax action/nonce (nonces are time-limited and tied to
that specific page load) - worth checking any future station's player
config object (`window.xConfig`-style globals are common) for a
`stream_type`/format hint like this before assuming a new provider is
needed. The plugin's `logo_url`/`artwork_url` is a static station mascot
image, not per-track art, so - consistent with every other `icecast`
entry - `coverUrl` is left to fall through to `null` rather than treating
that logo as real cover art.

**HisWave (Republic, MO)** — investigated and **skipped**, per the
no-title-field policy above. `status-json.xsl` at
`s3.voscast.com:9591` (stream itself is on a different port, 9590 -
confirmed via `source.listenurl`) returns a real, live `source` object
(populated `listeners`/`stream_start`, so the pipeline itself isn't
dead) but with no `title` key at all - the identical shape to WJWD's
gotcha, not a quiet moment. Checked for an alternate feed before
skipping: the page also loads a second VosCast script
(`cdn.voscast.com/resources/?key=...&c=playlist`) alongside the
player widget - but VosCast's own knowledge base describes that
"playlist" feature as alternate embeddable *stream URL* formats
(.pls/.m3u/etc. for other players), not song metadata, so this almost
certainly isn't a real lead. Also worth noting for future
investigation: Icecast/Shoutcast streams can carry "StreamTitle"
metadata inline in the audio stream itself (ICY metadata), a
genuinely separate mechanism from the `status-json.xsl` side-channel -
not checked here (would need inspecting the raw stream's HTTP
response directly, and our fetch-JSON-on-an-interval architecture
doesn't support reading it even if present - real engineering work,
not a config entry). Revisit only if someone confirms ICY metadata is
actually populated for this stream, or VosCast's account-level title
support changes.

---

## Provider: `futuri` (streamon.fm / Futuri Media)

**Station fields needed:**
- `mount` - identifies the station on `yp.cdnstream1.com`'s metadata API
  (e.g. `7077_24k`).
- `streamUrl` - the **plain/continuous** stream URL, NOT the HLS one (see
  below for where to find both).

**Now-playing endpoint:** `https://yp.cdnstream1.com/metadata/{mount}/current.json`

**Response shape (JSON) - confirmed via a real response:**
```json
[{
  "TALB": "Single",
  "TIT2": "Hope for Today",
  "TPE1": "Pastor David Hocking",
  "WXXX_album_art": "",
  "TXXX_category": "other",
  ...
}]
```
- **It's a one-element array**, not a bare object.
- Uses ID3-style frame names as keys: `TIT2` = title, `TPE1` = artist,
  `WXXX_album_art` = cover art URL.
- `WXXX_album_art` can be present but an **empty string** when the current
  program has no art configured (confirmed in production - a talk program
  had no art, presumably music tracks on the same station would). Treat
  blank the same as absent, don't show a broken image.

**Finding the `mount` value and the two stream URL formats:** view the
station's own web player page source and look for JS config variables:
```js
cfg_yp_mount = "7077_24k";                      // <- this is `mount`
currentapi = "//yp.cdnstream1.com/metadata/7077_24k/current.json";
streams = [
  {"format":"hlsaac","host":"ais-sa1.streamon.fm","id":"7077_24k.aac/playlist.m3u8",...},
  {"format":"iceaac","host":"ais-sa1.streamon.fm","id":"7077_24k.aac",...}
];
```
Use the **`iceaac`** entry for `streamUrl` (`https://{host}/{id}`, e.g.
`https://ais-sa1.streamon.fm/7077_24k.aac`) - it's a plain continuous stream,
compatible with a bare `<audio>` tag. Ignore the `hlsaac` entry's `.m3u8`
URL for playback purposes (would need a library like hls.js to play in most
browsers).

**Stations currently configured:** WTSW-LP, Real Hope Radio, The Lamp -
same setup process for all, different `mount` values.

**The Lamp / WLMP (Fredericksburg, VA / Calvary Chapel Fredericksburg)** -
their own church site (`ccfred.org/the-lamp-radio`) is a marketing/intro
page with no player at all, just a "LISTEN LIVE 24/7" button linking out
to `listen.streamon.fm/{slug}` (in this case `wlmp`) - THAT page, not the
church's own site, is where the actual player and its JS config (with
`cfg_yp_mount`/`streams`) live. Worth remembering as a general pattern:
if a church's own "radio" page has no visible player/audio element in its
source at all, check whether it's just linking out to a
`listen.streamon.fm/...` (or similar third-party hosted player) page
instead of embedding one directly.

---

## Provider: `socast` (SoCast)

**Station fields needed:**
- `domain` - the station's OWN website domain hosting a WordPress REST
  route, `/api/music/currentProgram` (e.g. `www.radiobygrace.com`) - NOT a
  shared SoCast infrastructure host.
- `accountId` - `PlayerData.accountID` in the station's player page JS;
  also passed as the `accountID` query param on the endpoint below.
- `streamUrl` - usually hosted elsewhere entirely (e.g. StreamGuys), found
  in the same page JS as `PlayerData.streamObj.mp3`/`.m4a`.

**Now-playing endpoint:** `https://{domain}/api/music/currentProgram?jsonpcallback={anything}&accountID={accountId}`

**Response shape - JSONP, confirmed via a real response:**
```
npCallback({
  "status": "success",
  "data": {
    "program_name": "Pastor Ed Taylor / Abounding Grace",
    "program_button": "https://media-cdn.socastsrm.com/.../ed-taylor.jpg",
    "start_time": "11:30 AM",
    "end_time": "12:00 PM",
    ...
  }
})
```
- JSONP, not bare JSON - wrapped in a callback function call. The callback
  name is normally jQuery-generated and unique per request
  (`jQuery19105312052787680952_...`), but the endpoint happily echoes back
  whatever name **we** choose to send instead - our code just uses a fixed
  `npCallback` literal. Parse by regex-matching any valid identifier
  followed by `(...)`, not a hardcoded name.
- `program_name` is one whole descriptive string (e.g. "Host / Show
  Title") - goes entirely into `title`, `artist` left blank. There's no
  clean split point the way Icecast's `"Artist - Track"` convention has one.
- `program_button` is the cover art field when populated (confirmed - a
  host photo). `program_header_img`/`program_mobile_img` are alternate
  fields in the same payload, empty in the one response we've seen but
  worth checking as fallbacks.

**Known gotcha - a DIFFERENT, more obvious-looking SoCast endpoint exists
and is the WRONG one.** SoCast stations also expose
`https://socast-public.s3.amazonaws.com/player/np_{accountId}_{streamId}.js`
(found via `PlayerData.nowPlayingURL` in the page JS) - also JSONP, also
returns real, plausible-looking data (`artist_name`, `song_name`), and is
much easier to find (it's a literal JS variable right in the page source,
vs. `currentProgram` which isn't referenced by URL anywhere in the HTML at
all). **This endpoint tracks background music/song cues, not who's
actually on air** - confirmed wrong in production: it kept showing a song's
artist/title while the actual live host ("Ed Taylor") was on air, and never
once reflected the real program. If a station is talk-radio-style rather
than music, don't trust this endpoint just because it returns data that
looks reasonable - verify the displayed "now playing" text against reality
before considering the integration done.

**Known gotcha - the correct endpoint's polling call has a hidden 10-minute
startup delay.** The page's own JS only calls `SCAPI.getNowPlayingProgram()`
inside a `setTimeout(..., 600000)` triggered once playback starts - there
is no immediate call on page load. Watching DevTools Network right after
pressing Play will show nothing related to "program" for a full 10 minutes.
To find this endpoint: open DevTools → Network → filter **JS or All** (NOT
Fetch/XHR - JSONP requests load via `<script src>` tags, which don't show
under an XHR/Fetch filter) → check "Preserve log" → press Play → wait the
full 10 minutes → search for "program".

**Stations currently configured:** Radio by Grace.

---

## Provider: `wpshowplaying` (WordPress "radiostation" theme)

**Station fields needed:**
- `npUrl` - the FULL now-playing URL, stored whole (unlike other
  providers' host+mount decomposition) since this format has only been
  seen on one specific WordPress theme so far, with no confirmed shared
  structure across different stations/domains using it.
- `streamUrl` - found the normal way (page source/DevTools Media).

**Now-playing endpoint:** whatever `npUrl` is configured to - seen so far as
`https://{domain}/wp-content/themes/radiostation/showPlaying.php?device=web`

**Response shape - plain HTML, not XML/JSON at all, confirmed via a real response:**
```html
<div id='nowPlaying'>
  <b><i><u>Played earlier</u></i></b><br/>Song Title by Artist<br/>...
  <b><i><u>Now playing</u></i></b><br/><b>Show Title by Host Name</b><br/>
  <b><i><u>Up next</u></i></b><br/>Song Title by Artist
</div>
<script>setTimeout(function(){ window.location.reload(1); }, 60000);</script>
```
- Built to be displayed directly in a browser and auto-refresh itself via
  that embedded `<script>` - we ignore the reload script entirely and just
  re-fetch on our own normal poll schedule instead.
- Three sections in one response: "Played earlier" (several lines), "Now
  playing" (exactly one line, and the only one wrapped in `<b>...</b>`),
  "Up next" (one line). We only want the bolded one - regex-match text
  between the `"Now playing"` header and the next `</b>`.
- Each line follows a `"{title} by {artist}"` convention - split on the
  first `" by "`, same idea as Icecast's `" - "` split.
- No cover art field exists in this format at all - `coverUrl` always `null`,
  same situation as Icecast.

**Stations currently configured:** Renew FM.

---

## Provider: `radiomast` (RadioMast.io)

**Station fields needed:**
- `streamUrl` only - no separate station-specific field. The now-playing
  URL is always just `streamUrl + '/metadata'`, per RadioMast's own docs.

**Now-playing endpoint:** `{streamUrl}/metadata`

**Response shape - confirmed via a real response:**
```json
{ "metadata": "05 You Say - Laura Daigle", "metadata_ext": {} }
```
- RadioMast's own docs describe this as a **Server-Sent Events** endpoint
  (`new EventSource(streamUrl + "/metadata")`), meant to push updates
  indefinitely - a fundamentally different delivery mechanism than every
  other provider here (all one-shot GET+parse). We don't hold the
  connection open - a single `fetch()` is enough, since the current state
  is sent immediately upon connecting.
- **Important: this is NOT gated the way Live365's SSE endpoint is** (see
  the rejected-providers section below). RadioMast's docs explicitly
  describe this as meant for outside consumption by any website/player -
  no Origin/Referer spoofing needed, confirmed working with a plain fetch.
  Don't assume "SSE-based" automatically means "gated" - check each one.
- The exact raw wire format wasn't fully pinned down (bare JSON vs. proper
  `data: {...}` SSE framing), so the parser tries a few candidate shapes
  in order rather than assuming one - see `parseRadioMastSse` for details.
- Combined string convention here is **"{Title} - {Artist}"** - the
  OPPOSITE order from Icecast's "{Artist} - {Track}" convention (confirmed:
  "05 You Say - Laura Daigle", Laura Daigle is the artist). Don't copy the
  Icecast split direction blindly for a future RadioMast station.
- A leading track-number prefix ("05 You Say" for a track titled "You
  Say") gets stripped via regex - inferred from a single real example, may
  need revisiting for a future station.
- No cover art field confirmed populated yet - `metadata_ext` was empty in
  the one real response seen, but may carry more fields (possibly artwork)
  for other stations.

**Stations currently configured:** WGSS.

---

## Provider: `live365json` (Live365, via public station JSON endpoint)

**Discovered while adding WRDJ (Merritt Island, FL) - much simpler than
`live365hls` below, and should be the FIRST thing checked for any new
Live365 station before falling back to the HLS-chasing approach.**

**Station fields needed:**
- `mountId` - Live365's mount ID (e.g. `a96507`). Found in the station's
  `streamUrl` (`https://streaming.live365.com/{mountId}`), or in the
  `live365.com/station/{slug}-{mountId}` URL itself, or embedded in the
  station page's SSR JSON as `"mountId"`.
- `streamUrl` - the plain MP3 URL for actual audio playback:
  `https://streaming.live365.com/{mountId}` (same value the `live365hls`
  station fields use for `host`+`stationId` - NOT the `.m3u8` variant).

**Now-playing mechanism - one clean fetch, no chasing required:**
```
https://api.live365.com/station/{mountId}
```
Undocumented (Live365 has no official public API - "Enable API for
broadcaster external use" is still an open feature request on their own
feedback site as of this writing), but stable and simple. Returns a single
JSON object with a `current-track` field:
```json
"current-track": {
  "title": "I Fall Down",
  "artist": "Kevin McCarthy",
  "art": "https://is1-ssl.mzstatic.com/.../512x512bb.jpg",
  "status": "playing"
}
```
- `title`/`artist` map directly - no splitting/reformatting needed.
- Talk/spoken-word segments report a real `title` with an **empty**
  `artist` string (e.g. `"Revival_Radio"`, artist `""`) - that's expected
  content, not a failure state, same as other talk stations elsewhere in
  this doc. Don't treat empty artist alone as "no data."
- `art` points to a static Live365 placeholder
  (`.../static/assets/img/blankart.jpg`) whenever there's no real cover -
  filter that specific URL out to `null` rather than showing it as if it
  were genuine artwork. Real covers (when present) are normal externally-
  hosted image URLs (often Apple Music CDN links), no filtering needed
  there.
- Response also includes `last-played` (an array, most-recent-first) and
  various stream/quality metadata - unused by the parser today, but useful
  for manual verification (open the URL directly and eyeball it) since it
  gives several tracks of history to confirm the feed is genuinely live
  and not stuck.

**How this was found:** the *new* live365.com station page (the React
Router/Remix-based one, distinct from whatever front-end older Live365
station pages might use) server-renders a `currentTrack` blob directly
into the page's initial HTML as part of its SSR payload - but that's just
page-load data, not a callable API. Watching the actual embedded player's
own Network tab traffic while it played led to the real
`api.live365.com/station/{mountId}` request the player itself uses.

**Worth revisiting:** since this endpoint is dramatically simpler than the
`live365hls` two-hop HLS chase below, it may be worth checking whether the
*existing* `live365hls` stations could switch over to `live365json`
instead - would eliminate the master-playlist-chasing complexity and the
per-request session ID churn entirely, if Live365's backend serves this
JSON endpoint for all mount IDs uniformly. Not yet verified either way -
a separate task, not assumed here.

**Known gotcha - not every Live365 station populates title/artist as
genuinely separate fields.** Confirmed in production - WGLJ (Gainesville,
FL) crams "artist - title" into the `title` field itself as one lowercase
string, leaving `artist` genuinely empty (e.g. `"title":"laura story - who
is like our god","artist":""`), unlike WRDJ which populates both fields
correctly. Added an opt-in `splitCombinedTitle: true` station field (see
field list above) that only splits when `artist` is already empty - so a
station-ID/bumper entry that DOES have a real non-empty artist value
(confirmed in WGLJ's own data: one "ID - Legal" entry had a genuine
`artist:"IID"`) is never overwritten by a guessed split. Deliberately does
NOT attempt to fix the lowercase casing on split results - guessing
correct title-case for arbitrary artist names (apostrophes, ampersands,
initials like "michael w smith") risks introducing new wrong-looking
mistakes, so it displays as-is rather than guess wrong.

**KRTM "Bible School Radio" (Aledo, TX)** — investigated and **not
added**. A genuinely new failure pattern worth naming distinctly:
**populated but meaningless, looping bumper metadata** - different from
GraceFM/KGPS's dead-empty-feed case, and different from a wrong-format
split. mount `a28002`. Two different feeds were checked, and BOTH were
wrong in different ways:
- Their own custom `nowplaying.json` (used by their site's homepage
  player) reported `{"artist":"New 2015","title":"INSTRUMENTAL \"Jazz In
  A Higher Dimension\""}` - "New 2015" looks like an internal
  playlist/rotation category name bleeding into the artist field, not a
  real performer.
- The standard `api.live365.com/station/a28002` endpoint reported
  something entirely different and also wrong: `current-track` AND all
  six most-recent `last-played` entries were the exact same looping
  station-ID bumper (`"Visit pastorchuck.org today!"` /
  `"Thanks for listening to KRTM"`), repeating every ~30 seconds - not a
  song, not the actual live teaching program airing at the time (per the
  program guide, this should have been "Choose Life" with Jill Taylor).
- **Confirmed via the station's own official player**
  (`krtmradio.org/player.rhtml`) showing the SAME wrong instrumental-jazz
  data as the custom `nowplaying.json` - same "a station's own player
  failing identically is strong outside confirmation" principle already
  used for the mixed-content gotcha under Icecast above, just applied
  here to metadata accuracy instead of playback.
- Station config shows `"live_dj_on":true,"auto_dj_on":false` - genuinely
  live-operated, not just an unattended AutoDJ loop - but its metadata
  tagging appears wired only to automated ID/promo inserts between
  segments, never to whatever a live operator is actually airing.

Skip - neither available feed reflects real program content, regardless
of which endpoint is used. Revisit only if the station's live-operator
workflow starts tagging its own segments.

**Confirmed: check `live365json` first even when the captured traffic is
HLS.** Aloha KIHL (Hilo, HI) was captured via its embedded player's actual
network traffic requesting an HLS chunklist
(`das-edge...cdnstream.com/a95022/playlist.m3u8?listeningSessionId=...`,
same shape as the `live365hls` chain below) - it would be easy to assume
this station needs the HLS chase since that's the literal request seen.
But per the standing policy above, `api.live365.com/station/a95022` was
tried directly first anyway, and it worked immediately, returning the
exact same track ("Pastor Joe Focht - Straight from the Heart- Psalm
119") the HLS capture showed. The embedded jPlayer-based player on this
station's page happens to use HLS for actual audio delivery, but that's
unrelated to which now-playing metadata endpoint is available - always
try the plain JSON endpoint first regardless of what the page's own
player traffic looks like.

**Stations currently configured:** WRDJ, WGLJ, Aloha KIHL.

---

## Provider: `live365hls` (Live365, via HLS playlist)

**Station fields needed:**
- `host` - e.g. `streaming.live365.com`.
- `stationId` - Live365's internal station identifier (found as
  `live365 = "a10665";` in the station's player page JS).
- `streamUrl` - the plain `"ice"` format from that same page's `streams`
  config array (NOT the `"icehls"`/`.m3u8` one) - e.g.
  `https://streaming.live365.com/a10665`.

**Now-playing mechanism - a genuinely different, two-hop fetch, not a
simple buildNowPlayingUrl+parse:**
1. Fetch `https://{host}/{stationId}/playlist.m3u8` - this is a **master
   playlist**, just a pointer, NOT the real data:
   ```
   #EXTM3U
   #EXT-X-STREAM-INF:BANDWIDTH=192000,CODECS="mp4a.40.34"
   https://das-edge63-live365-dal03.cdnstream.com/a10665/playlist.m3u8?listeningSessionId=...
   ```
2. That variant URL is **freshly issued on every single request** -
   confirmed in production: two separate fetches returned two different
   `listeningSessionId` values. Can't cache or hardcode it - fetch the
   master fresh every poll and follow wherever it currently points.
3. Fetch that variant URL - THIS is the real media playlist, with the
   actual now-playing data embedded directly in the `#EXTINF` tags:
   ```
   #EXTINF:4.96327,PASTOR JOHN THOMAS - IN THE POTTERS HAND
   /segment-....mp3?listeningSessionId=...
   ```
   Multiple `#EXTINF` lines can appear per fetch (one per segment in the
   sliding window) - take the LAST one, since segments are listed
   oldest-to-newest.
- Convention is **"{Artist} - {Title}"** (confirmed: "PASTOR JOHN THOMAS -
  IN THE POTTERS HAND" - a preacher's name, then the sermon title) - same
  order as Icecast, NOT RadioMast's reversed one.
- Because this needs two HTTP calls, it uses `fetchAndParse` (see the
  general architecture note near the top of this doc), not the normal
  `buildNowPlayingUrl`/`parse` pair.
- No cover art field - always `null`.

**Known gotcha - "Live365-hosted" is NOT one single situation.** See the
rejected-providers section below: some Live365 stations' now-playing data
is genuinely inaccessible (gated behind spoofed headers), while others
(like this one) expose it cleanly via the public HLS playlist with zero
gating at all. Don't assume a Live365 station is a dead end just because a
different Live365 station was - check whether the specific station's setup
uses the SSE `/metadata` endpoint (likely gated) or exposes a `streams`
config with an `icehls` entry (this mechanism, not gated).

**Stations currently configured:** The Word.

---

## Provider: `shoutcast` (Shoutcast v2 native format)

**Station fields needed:**
- `host` - can include a path prefix for shared/proxied hosting, same
  pattern as Icecast's shared-hosting note above.
- `streamUrl` - found the normal way (page source).

**Now-playing endpoint:** `https://{host}/stats?json=1`

**Response shape - confirmed via a real response:**
```json
{
  "servertitle": "Truth fm 93.1",
  "songtitle": "Chris Falson - I See the Lord",
  "streamstatus": 1,
  ...
}
```
- `songtitle` follows the same "{Artist} - {Track}" convention as Icecast,
  so the split logic is identical.
- **Distinct from `icecast` above** - Shoutcast and Icecast are different
  streaming server software with different native JSON shapes, even
  though the same shared host can run either one (see the Icecast
  section's gotcha about this). Don't assume a `shoutcheap.com`-hosted
  station is Icecast just because another `shoutcheap.com` station was -
  test the endpoint and check the actual field names.
- Icecast's `status-json.xsl` path is NOT interchangeable with Shoutcast's
  `stats?json=1` - confirmed in production that hitting the Icecast-style
  path on a Shoutcast proxy just serves the raw audio stream back, not an
  error, which can be misleading (it "works" in a browser, just not usefully).

**Stations currently configured:** WLEB, WLXM.

**WLXM (Lexington, SC / Calvary Chapel Lexington)** confirms the shared-
hosting-with-path-prefix pattern (documented under Icecast above) also
applies to Shoutcast, not just Icecast: `host:
'broadcast.shoutcheap.com/proxy/jossco00'` resolves correctly against
`.../stats?json=1`. Also a good real-world confirmation of the "don't
assume a shoutcheap.com station is Icecast" warning above - this one's
stream URL uses the `;stream.mp3` Shoutcast-v1-style suffix (same pattern
as the rejected KBOK), and `broadcast.shoutcheap.com` (note: different
subdomain than TrueFM's `radio.shoutcheap.com`) resolves to a Centova Cast
login panel when hit directly - genuinely Shoutcast under the hood, not
Icecast, despite both stations sharing the same parent host company.

---

## Provider: `aiir` (Aiir/G Media - via WebSocket, NOT HTTP polling)

**Discovered while adding The Bridge Christian Radio (Old Bridge, NJ /
Calvary Chapel Old Bridge).** Aiir is a legitimate, established radio
broadcast software company (UK-founded, real customers like Bauer Radio),
not some obscure host - but their player's now-playing mechanism is
completely different in shape from every other provider in this file.

**Station fields needed:**
- `wsUrl` - `wss://metadata.aiir.net/now-playing`. Same URL across every
  Aiir station seen so far (not station-specific), but kept as a
  per-station field rather than hardcoded in case that ever changes.
- `serviceId` - Aiir's numeric station ID (e.g. `"3628"`). Found in the
  station's `player.aiir.com/{slug}/` page source as
  `data-station-metadata-id-value="3628"` on the `station-metadata`
  Stimulus controller div, and again in a `gm.properties = {...,
  "service_id":3628}` inline script block near the top of the page.
- `streamUrl` - also findable in that same page source, as a
  `data-player-audio-url-param="https://stream.aiir.com/{id}"` attribute
  on the play button. Plain HTTPS MP3, no mixed-content concerns.

**Now-playing mechanism - a WebSocket subscription, not a polled URL.**
This is the first provider in this file that isn't a plain HTTP GET (or
two-hop chase) at all:

1. **Finding the WebSocket URL required watching real Network traffic**,
   because it doesn't show up in the page source OR the compiled player
   JS bundle if you just fetch it as static text (the bundle is a
   webpack-style hashed filename, `main.{hash}.js`, and pattern-searching
   it from outside a browser wasn't fruitful). What actually worked:
   opening the station's `player.aiir.com` page live, watching
   DevTools Network, and specifically checking the **`Socket`** filter
   (not `Fetch/XHR`, which only shows ad-tracking calls to
   `ads.aiir.net/pageads` and `.../preroll` that happen to share the same
   `service_id` in their query string and are easy to mistake for
   metadata traffic at first glance - they aren't).
2. Once connected, the client sends a subscribe message:
   ```json
   {"action":"subscribe","serviceId":"3628"}
   ```
3. The server pushes a full payload back **immediately** (confirmed in
   production: well under a second, not a slow poll), then just sends
   `{"action":"heartbeat"}` keepalive pings roughly every 4 minutes with
   no station data in them - these must be ignored, not mistaken for "no
   data available."
4. Confirmed real response shape (captured live, during a talk-programme
   block):
   ```json
   {
     "serviceId": "3628",
     "nowProgramme": { "type": "programme", "name": "Bridge Bible Talk",
       "description": "", "imageUrl": "https://mmo.aiircdn.com/...jpg",
       "programmeId": "30981", "start": "...", "end": "...",
       "contactPageUrl": "...", "email": "...", "phoneNumber": "..." },
     "nowPlaying": { /* same shape as nowProgramme above */ },
     "previouslyPlayed": []
   }
   ```
   `nowPlaying` is what we read from - `name` -> title, `imageUrl` ->
   cover. **Never confirmed what a real music track's shape looks like**
   (only ever observed during a talk block, so `type` was always
   `"programme"` and there was no populated `artist` field to test
   against) - built the parser defensively (checks for `artist`, doesn't
   assume it exists) rather than waiting around for a song to air. If
   music-block metadata ever looks wrong (e.g. artist not showing when it
   should), that's the first place to check - see `fetchAiirNowPlaying`'s
   code comments.
5. Because this needs a persistent connection rather than a single
   fetch+parse, it uses `fetchAndParse` (see the general architecture
   note near the top of this doc) - open the WebSocket, subscribe, take
   the first payload containing `nowPlaying`, close.

**Known gotcha - Cloudflare Workers' `fetch()` rejects `wss://` URLs
outright.** Confirmed in production: passing the literal `wss://` URL to
`fetch()` throws `Fetch API cannot load: wss://...` immediately, even
though the `Upgrade: websocket` + `res.webSocket` pattern otherwise works
fine. Per Cloudflare's own docs, `fetch()`'s WebSocket-upgrade extension
requires an `http:`/`https:` URL scheme - `wss:`/`ws:` schemes are only
valid with the separate `new WebSocket(url)` constructor, which is a
different API shape (no manual `.accept()` step, no `res.webSocket`).
Fix: keep `wsUrl` in the station config as the real, human-readable
`wss://` URL (that's genuinely what it is, and what you'd see in
DevTools), but rewrite the scheme to `https://` right before the actual
`fetch()` call inside `fetchAiirNowPlaying` - station config and doc
comments stay accurate, only the one line that calls `fetch()` needs the
workaround.

**Stations currently configured:** The Bridge.

---

## Provider: `elasticplayer` (ElasticPlayer.xyz - shared radio hosting platform)

**Discovered while adding The Voice / WTTP FM (Lima, OH).** ElasticPlayer
looks like a small shared radio-hosting platform (like `shoutcheap.com`
under Icecast, but its own thing) - multiple unrelated stations run
per-station Vue-based player pages at `elasticplayer.xyz/{slug}/`.

**Station fields needed:**
- `radioId` - numeric station ID (e.g. `"300"`). The SAME id is reused
  across two different endpoints on this platform (see below) - found
  either from the metadata request in DevTools, or by guessing/confirming
  against the plain station-info endpoint.
- `streamUrl` - conveniently returned by that same station-info endpoint
  as `stream_url` (see below), no separate page-source digging needed.

**Two relevant endpoints, same `{radioId}`:**
- `https://www.elasticplayer.xyz/api/v1/radio/{radioId}/history` - the
  now-playing/metadata feed (see response shape below).
- `https://www.elasticplayer.xyz/api/v1/radio/{radioId}` (same URL, no
  `/history`) - plain station info/config, including `stream_url`,
  `title`, `logo`, social links, etc. Genuinely useful shortcut when the
  station's own website is unreachable for whatever reason (WTTP's own
  site returned bot-detection blocks against automated fetches) - this
  endpoint isn't bot-gated and hands you the stream URL directly.

**Now-playing response shape - confirmed via a real response:**
```json
[
  {
    "id": 69796859,
    "radio_id": 300,
    "meta": "Carol Eskaros - Rinse and Repeat - RAR2024EP06 - The Life of David Part 19",
    "image_url": null,
    "amazon_url": null,
    "created_at": "2026-08-22 19:00:15",
    "updated_at": null
  },
  ...
]
```
- Returns an **array**, most-recent-first by `created_at` - index 0 is
  the current/last-played item, not a single object like most providers.
- **No separate title/artist fields** - everything is one freeform `meta`
  string, and unlike Icecast/Shoutcast's consistent "{Artist} - {Track}"
  convention, this platform's format is inconsistent entry-to-entry: some
  look like "{Speaker} - {Series} - {Episode title}", but others like
  `"260505 THE WATCHMAN CALL - THE TIMELINE OF END TIMES - PART 5 -"`
  clearly have a program/date code as the first segment, not a person's
  name. Splitting on the first `" - "` (like Icecast) would mislabel
  those as an artist. Per the same principle used for other
  inconsistent-format talk stations elsewhere in this doc: the **whole
  `meta` string is kept as `title` with an empty `artist`**, rather than
  guess wrong. Revisit only if a cleaner pattern emerges across more
  stations on this platform.
- `image_url` was `null` for every entry seen so far - `coverUrl` handling
  is in place for when it's populated, just unconfirmed in practice.

**Stations currently configured:** The Voice (WTTP).

---

## Provider: `streamingradio` (streamingrad.io - shared radio hosting platform)

**Discovered while adding KFLK "The Flock" (Minot, ND / Calvary Chapel
Minot).** Another small shared radio-hosting platform, similar in spirit
to `elasticplayer` above - unrelated stations run per-station embedded
players at `streamingrad.io/live.php?id_player={n}`.

**Station fields needed:**
- `idPlayer` - numeric player ID (e.g. `"9"`). Found in the station's own
  embedded player page source, both in the `MRP.insert({...})` JS player
  config and in the `live.php?action=metadata&id_player=` calls the page
  itself makes.
- `streamUrl` - also found in that same `MRP.insert({...})` config block,
  as the `url` property (e.g.
  `https://server02.streamingrad.io:8443/listen/kflk_the_flock_95.9_fm/radio`).

**Now-playing endpoint:**
```
https://streamingrad.io/streaming-audio/live.php?action=metadata&id_player={idPlayer}
```
Confirmed response shape - unlike ElasticPlayer (an array of history
entries), this is a single object with title/artist already split into
separate fields:
```json
{
  "state": "1",
  "metadata": {
    "title": "GREEDY",
    "artist": "",
    "imageDefault": "img.php?id_player=9&type=default_image",
    "image": "https://is1-ssl.mzstatic.com/.../400x400bb.jpg",
    "trackViewUrl": "https://music.apple.com/..."
  }
}
```
**Correction: this exact example turned out to be frozen/dead data, not a
legitimate illustration** - see the KFLK rejection note below. Kept here
only to show the genuine field shape (title/artist/image/trackViewUrl),
not as an example of what a healthy response looks like.
- `title`/`artist` map directly - no splitting needed, unlike Icecast's
  combined-string convention.
- `artist` was empty in the one response captured so far - kept as-is
  (not treated as a failure) per the same principle used elsewhere for
  instrumental/talk content with no artist to report.
- `image` is a real per-track cover URL (Apple Music CDN in the example),
  not a static placeholder - no filtering needed, unlike Live365's
  blankart.jpg case.

**Stations currently configured:** none currently - see KFLK below.

**KFLK "The Flock" (Minot, ND)** — added, then **removed** days later,
same failure family as WXMB: looked fine at add-time (a real-looking
title/artist/cover, not obviously empty), but never changed even once
after that. Confirmed dead via two checks: (1) re-querying the exact same
`live.php?action=metadata&id_player=9` endpoint weeks later returned a
byte-for-byte identical response - same title, same `trackViewUrl`, down
to the last character; (2) the station's own embedded player on their
church site showed the same frozen "GREEDY" too, confirming this is
broken on their end, not something specific to how we read it. Unlike
SecureNetSystems' XML format, this provider's response has no timestamp
field at all (no `programStartTS` equivalent) - so staleness here had to
be confirmed by literal repeat-request comparison over time, rather than
reading a stale date directly. Worth remembering as the general technique
for any future provider that also lacks a timestamp field. Removed per
the same reasoning as WXMB (a genuinely dead pipeline, not just an
occasionally-quiet talk station). Revisit only if someone happens to
notice the feed moving again.

---

## Provider: `radioco` (Radio.co)

**Discovered while adding KLYT-FM (Albuquerque, NM).** Unlike most
providers in this file, Radio.co is a well-documented, established
platform (Radio.co has an official public API and developer docs) -
didn't need to be reverse-engineered from DevTools traffic.

**Station fields needed:**
- `stationId` - Radio.co's station ID (e.g. `"s914ba6b9a"`). Found in the
  page's embed config, in the `"stream":{"station ":"..."}` field (note:
  that JSON key literally has a trailing space baked into it on their
  end - a typo in Radio.co's own embed script, not ours - harmless, just
  surprising if you go looking for it and don't see it at first) - or
  more simply, it's also the last path segment of `streaming_url`.
- `streamUrl` - given directly in the same embed config as
  `stream.streaming_url` (e.g. `https://s5.radio.co/s914ba6b9a`) - a
  plain, direct HTTPS MP3/AAC stream, no chasing needed.

**Now-playing endpoint:**
```
https://public.radio.co/stations/{stationId}/status
```
Officially documented, no auth needed. Confirmed real response shape
(from live KLYT-FM data):
```json
{
  "current_track": {
    "title": "The Love I Have For You  Colton Dixon",
    "artwork_url": "https://images.radio.co/station_logos/....jpg"
  },
  "history": [ {"title": "..."}, ... ],
  ...
}
```

**Known gotcha - no separate artist field, and the title format is
inconsistent within the SAME feed.** `current_track` has only a `title`
string, no `artist` field at all. Confirmed via real production data that
this single field mixes two different internal conventions:
- **Actual songs** use a double-space separator:
  `"{Track Title}  {Artist}"` (two spaces, not a dash like the
  Icecast/Shoutcast `"{Artist} - {Track}"` convention elsewhere in this
  file) - e.g. `"The Love I Have For You  Colton Dixon"`.
- **Station liners/promos/vignettes** use a `" BY "` separator instead,
  and sometimes nothing follows "BY" at all - e.g.
  `"Liner 2026 | Shotgun 08 BY "`, `"TF - BGEA Minute BY KLYT Vignettes"`.

Since both formats appear interleaved in the same `history` array with no
reliable way to tell which is which before parsing (a naive
double-space-or-" BY "-split would need to guess which pattern applies,
and would produce garbage on whichever one it guesses wrong for), the
whole string is kept as-is as `title` with an empty `artist` - same
principle as other inconsistent-format providers elsewhere in this doc
(see ElasticPlayer above for a similar case). Revisit only if a cleaner,
reliably-distinguishable pattern emerges across more Radio.co stations.

**Stations currently configured:** KLYT.

**WAOG-LP / The Shield FM (Aberdeen, NC)** — investigated and **not added**,
per the no-now-playing-data policy (see the "Adding a new station" checklist,
step 4). `stationId` `s56323fdac`, `streamUrl`
`https://streaming.radio.co/s56323fdac/listen`. The **stream itself works
fine** — confirmed `"status":"online"` with an active collaborator
(`"status":"streaming"`) — but the metadata pipeline is dead: `current_track`
and the entire `history` array are frozen on a `start_time` of
`2023-02-24T00:14:15+00:00`, over three years stale as of this writing.
Confirmed via direct listening that live on-air audio does not match the
reported `current_track` title. This is the same dead-pipeline failure
family as GraceFM/KXGRFM above — a well-formed, plausible-looking response
that simply never updates. Revisit only if the station's Radio.co feed
starts reporting current data again.

---

## Provider: `radioking` (RadioKing)

**Discovered while adding CC UK Radio (United Kingdom / Calvary Chapel
UK).** Like Radio.co, RadioKing is a well-documented, established
platform (real help center, developer docs) - didn't need to be
reverse-engineered from DevTools traffic for the metadata side. The
stream URL, however, still did.

**Station fields needed:**
- `slug` - RadioKing's station slug (e.g. `"calvary-chapel-radio"`).
  Found in the embedded iframe's `src`
  (`player.radioking.io/{slug}/...`) on the station's own page, and it's
  also the same identifier used directly in the metadata API URL.
- `streamUrl` - NOT discoverable from the metadata API or the page
  source directly. The embedded player's actual audio request follows a
  redirect chain: `https://play.radioking.io/{slug}` (302) ->
  `https://listen.radioking.com/radio/{numericId}/stream/{streamId}`
  (the real, final, playable URL). Only found by watching Network >
  Media traffic while the embedded player was actually playing - same
  technique used for WRDJ/The Bridge/etc. elsewhere in this file.

**Now-playing endpoint:**
```
https://api.radioking.io/widget/radio/{slug}/track/current
```
Officially documented public widget API, no auth needed. Confirmed real
response shape:
```json
{
  "id": 95994476,
  "artist": "Lloyd Pulley",
  "title": "BRIDGING THE GAP",
  "album": "Basic Christian Living",
  "started_at": "2026-08-24T04:30:05+0000",
  "is_live": false,
  "cover": "https://image.radioking.io/radios/482243/coverdefault/....png",
  "default_cover": true
}
```
- `title`/`artist` map directly - already properly split into separate
  fields, no combined-string parsing needed at all (unlike most other
  providers in this file).
- `default_cover: true` means `cover` is just a generic station logo
  placeholder, not real per-track artwork - filtered out to `null` the
  same way Live365's `blankart.jpg` placeholder is, rather than shown as
  if it were genuine cover art.
- `is_live` in this context refers to whether the CURRENT TRACK is a
  live DJ segment vs. an automated/scheduled track - NOT whether the
  station overall is airing. Not used by the parser; noted here so it's
  not confused with a station-level live/offline flag if revisited later.

**Stations currently configured:** CC UK Radio.

---

## Provider: `radioboss` (RadioBoss Cloud)

**Discovered while adding KCHP Radio (Humboldt Co, CA / Telios Christian
Fellowship).** Another shared radio-hosting platform, similar in spirit to
`elasticplayer`/`streamingradio` above - stations run a "RadioBOSS Cloud
NowPlaying Widget" embedded directly in their own WordPress/Elementor page,
no separate per-station player page needed to find the pieces.

**Station fields needed:**
- `stationId` - RadioBoss's numeric station id (e.g. `"77"`). Found as the
  `u=` query param on the widget's own now-playing request, and it's also
  the filename in the artwork URL (`/w/artwork/{stationId}.jpg`) - both
  visible directly in the embedded widget's HTML/JS on the station's page,
  no DevTools traffic-watching needed for this one.
- `streamUrl` - found directly in the page source too, in a plain
  `<li class="xradiostream">` tag - e.g.
  `https://c5.radioboss.fm:8077/stream`.

**Now-playing endpoint:** `https://c5.radioboss.fm/w/nowplayinginfo?u={stationId}`

**Response shape (JSON) - confirmed via a real response:**
```json
{
  "autodj_title": "SAR20260902",
  "autodj": true,
  "live_title": "SAR20260902",
  "live_mount": "/live",
  "live": true,
  "nowplaying": "SAR20260902",
  "currenttrack": "SAR20260902",
  "currenttrack_artist": "",
  "currenttrack_title": "SAR20260902",
  "nexttrack": "n/a",
  "nexttrack_artist": "",
  "nexttrack_title": "n/a",
  "listeners": 3,
  "artwork_ts": 1788406922,
  "artwork_next_ts": 1694916585
}
```
- `currenttrack_title`/`currenttrack_artist` map directly - already
  separate fields, same shape as `streamingradio`, no combined-string
  splitting needed.
- **No cover-art field in the response body itself** - the artwork lives
  at a separate, predictable URL keyed by the same station id
  (`https://c5.radioboss.fm/w/artwork/{stationId}.jpg`, confirmed via the
  station's own embedded widget markup). This is why the provider uses
  `fetchAndParse` rather than the normal `buildNowPlayingUrl`+`parse` pair,
  even though it's only one HTTP call - a different reason than
  live365hls/aiir's multi-call chains, just needing `station.stationId`
  available alongside the parsed JSON to build that URL.
- `artwork_ts` is a real, current Unix timestamp (confirmed against the
  add-time response) - appended as a `?` cache-buster on the artwork URL
  so it updates promptly when the track/art changes. `artwork_next_ts`,
  by contrast, was a stale ~2023 value in the one response seen so far -
  looks like an unused/default placeholder, not a real "next artwork"
  pointer. Ignored.
- `live`/`autodj`/`listeners` are all present but unused by the parser -
  noted here in case a future station's data needs them to distinguish
  states.

**Known gotcha - `currenttrack_title` encodes the show as an abbreviation +
airdate, not a human-readable name.** KCHP's add-time response showed
`currenttrack_title: "SAR20260902"` - initially logged here as a possible
dead-pipeline/meaningless-filename concern (the KRTM failure pattern under
`live365json` above), but **confirmed real, not junk**: `SAR` is
`Sandy Adams Radio` (see the station's own published schedule - "08:30 AM
> Sandy Adams Radio – Sandy Adams" airs daily), and `20260902` is that
day's airdate. So this station's automation names its blocks
`{ShowInitials}{YYYYMMDD}` rather than spelling out the show name -
genuinely legitimate metadata, just terse/coded rather than friendly. Not
treated as a dead-pipeline signal after all; no follow-up-in-a-few-days
flag needed for this reason. Left as `displayName`/ticker text as-is
(`SAR20260902`) rather than guessing at a decoder table for every possible
show-initials code on this platform - revisit if it's worth building a
`{code: 'Full Show Name'}` lookup for this station's specific rotation.

**Stations currently configured:** KCHP Radio.

---

## Provider: `triton` (Triton Digital / StreamTheWorld)

**Discovered while adding Refuge FM (St. Cloud, MN / WROJ).** Triton Digital
is a large, well-documented, established radio-hosting/streaming company -
same tier of legitimacy as Radio.co/RadioKing above, not something
reverse-engineered from scratch. Stations on this platform typically embed
Triton's own hosted "V4 Player" widget (served from `player.listenlive.co`),
but the pieces we need can be found in the page source without needing that
widget itself.

**Station fields needed:**
- `mount` - Triton's "mountName", built from two pieces found in the
  station's own page source: the internal Triton `station_id` (e.g.
  `"WROJ_LP"`, found inside a large inline `var app = {...}` JS config blob
  on the page) plus a codec suffix (`AAC`), giving `WROJ_LPAAC`. Confirmed
  correct (not just a guess) by fetching Triton's public nowplaying API
  directly with this value and getting back real, current, non-frozen data.
- `streamUrl` - **do not** use the exact stream URL captured from the
  browser's network tab (something like
  `https://18003.live.streamtheworld.com/WROJ_LPAAC_SBM?sbmid=<uuid>`). That
  URL points at one specific numbered edge server and requires `sbmid`, a
  session token generated fresh per page load - not something a static
  config string can supply, and hardcoding one specific edge node is more
  fragile than necessary anyway. Use Triton/StreamTheWorld's official
  redirect endpoint instead, which resolves to a healthy edge server on its
  own and needs no session token:
  `https://playerservices.streamtheworld.com/api/livestream-redirect/{mount}.aac`.
  The `_SBM` ("session-based metadata") variant exists so a player can read
  now-playing info embedded in the stream itself; we don't need that since
  we already get now-playing data from the separate API below, so the plain
  redirect stream is both simpler and a better fit for a static `<audio>`
  tag. **Not yet confirmed by an actual playback test** - worth a quick
  real-world check after this deploys.

**Now-playing endpoint:**
`https://np.tritondigital.com/public/nowplaying?mountName={mount}&numberToFetch=1&eventType=track`

**Response shape (XML) - confirmed via a real, live fetch against WROJ:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<nowplaying-info-list>
  <nowplaying-info mountName="WROJ_LPAAC" timestamp="1788413200" type="track">
    <property name="cue_time_duration"><![CDATA[349.0193]]></property>
    <property name="cue_time_start"><![CDATA[1788413200291]]></property>
    <property name="cue_title"><![CDATA[Family X]]></property>
    <property name="track_artist_name"><![CDATA[John Lucas]]></property>
  </nowplaying-info>
</nowplaying-info-list>
```
- `cue_title` → title, `track_artist_name` → artist. Small, flat,
  machine-generated XML, so the same simple regex-extraction approach used
  for `securenetsystems` above is fine here too.
- `cue_time_duration`/`cue_time_start` are playback-position bookkeeping,
  not display text - present but unused.
- This was a *live* confirmation, not just a one-time snapshot: the fetch
  returned a specific, current song different from anything in the original
  page capture, proving the mount name is correct and the feed genuinely
  updates rather than being frozen. Stronger verification than either
  `securenetsystems`/CSN International or `radioboss`/KCHP achieved, both of
  which relied on a single snapshot plus reasoning rather than an
  independent second fetch.

**No cover-art field in the response at all, and no predictable per-station
artwork URL either** (unlike `radioboss`) - this is why `triton` needs
`fetchAndParse` for a third distinct reason (beyond `live365hls`/`aiir`'s
multi-call chains and `radioboss`'s need for a station field): getting
artwork here requires an entirely separate lookup. Confirmed by capturing
the station's own hosted player doing exactly this - a second, unrelated
request to Apple's public iTunes Search API keyed off the title/artist
text (`https://itunes.apple.com/search?term={artist}%20{title}&media=music&entity=song&limit=1`,
using a JSONP callback in the browser). Our implementation makes the same
call as plain JSON (omitting the `callback` param - JSONP is only a
browser/jQuery convenience, not required by the API), takes the first
result's `artworkUrl100`, and upsizes it to `600x600bb` (a standard,
documented iTunes artwork URL trick - the size is just a path segment).

**Known gotcha - not every cue will have iTunes artwork, and that's fine.**
Spoken-word/talk cue titles (sermons, show segment names) won't match a
song on iTunes Search; the lookup just returns no results and `coverUrl`
comes back `null` - title/artist still display normally. A failed or slow
iTunes request is also swallowed rather than allowed to fail the whole
now-playing fetch, since cover art is a nice-to-have layered on top of the
primary title/artist data from Triton itself.

**Stations currently configured:** Refuge FM.

---

## Providers we looked at and deliberately did NOT build

Not every station's metadata is worth chasing. These are confirmed dead
ends, kept here so the same investigation doesn't get repeated later.

**Live365's `/metadata` SSE endpoint** (confirmed via Crossway Radio) -
metadata is delivered over **Server-Sent Events** (`Accept: text/event-
stream`), a fundamentally different shape than every other provider here
(which are all one-shot GET+parse). The station ID needed is findable -
it's embedded right in the site's own embed code, e.g.
`https://live365.com/embed/player.html?station=a62921`, so `a62921` is
the identifier - but hitting `https://streaming.live365.com/metadata?
station={id}` directly returns a bare **404 "Bad Request" from a load
balancer**, not real data. The DevTools capture that led us here showed
the real request carrying `Origin: https://live365.com` and
`Referer: https://live365.com/` - strongly suggesting the endpoint
checks where the request claims to come from and rejects anything that
doesn't look like Live365's own embedded player. Getting this working
would mean deliberately spoofing those headers to impersonate Live365's
own site, not just working around a technical quirk (like the JSONP
callback-name tricks used elsewhere) - a real decision NOT to pursue,
not just a technical dead end.

**IMPORTANT - this does NOT mean "skip every Live365 station."** A later
Live365 station (The Word) turned out to expose its now-playing data
cleanly through a completely different, ungated mechanism - the public
HLS playlist's embedded `#EXTINF` tags (see the `live365hls` provider
above). "Live365-hosted" isn't one situation; check which mechanism a
specific station actually uses (an SSE `/metadata` call vs. a `streams`
config with an `icehls` entry) before assuming it's a dead end just
because this one endpoint was.

---

## Finding stream URLs and endpoints for a brand-new station (any provider)

When a station only gives you a now-playing feed URL (or nothing at all),
here's the process that's worked so far, roughly in order of how easy it is:

1. **Ask for or find the station's public "listen live" player page.**
   Often linked from the station's own website, or discoverable via a
   `rdo.to/...` shortlink or similar on a "sister station" page.
2. **View page source** (not just DevTools inspect - the *original* HTML/JS,
   since a lot of this config lives in `<script>` variables, not the live
   DOM) and search for: `stream`, `mount`, `m3u8`, `.aac`, `icecast`,
   `securenetsystems`, `cdnstream`, or the station's call sign. This is
   usually faster than digging through Network requests and has worked for
   every provider type so far.
3. **If that fails, DevTools Network tab → filter by Media → click play**
   on the station's own web player, then look for the actual streaming
   request. Right-click → Copy → Copy URL. Note this filter only catches
   audio/video requests - for a JSON/JSONP metadata call, use **JS or All**
   instead (see the SoCast gotcha above for why Fetch/XHR alone can miss it).
4. **If nothing shows up right after pressing Play, the call might be
   delayed.** Not every station's metadata polling starts immediately -
   check "Preserve log" in DevTools and wait a while before concluding
   there's nothing there (see SoCast's 10-minute delay above).
5. **Double-check you've got the right station** if the page links to
   "sister stations" - it's easy to accidentally save/paste the wrong
   page's source (see the Icecast gotcha above).

## Frontend ticker/mini-player behavior (in `index.html`)

Worth knowing even though it rarely needs touching per-station:

- **Poll interval / cache TTL:** the frontend polls `/radio-now-playing`
  every `RADIO_POLL_MS` (60000ms), matching the Worker's own
  `RADIO_CACHE_SECONDS` (60) - kept in sync so we're never polling faster
  than the data could possibly change. Both were originally 20s, raised to
  60s to cut real-station load by two-thirds with barely noticeable
  staleness.
- **Ticker rebuilds are deferred to the scroll loop boundary, not applied
  immediately.** The marquee track is duplicated so one full CSS animation
  iteration = one full lap of the (non-duplicated) content. If new data
  arrived and the DOM were rebuilt immediately, the animation would visibly
  jump back to the start mid-scroll. Instead, a changed station list is
  stashed (`pendingRadioStations`) and only actually applied inside the
  track's `animationiteration` event handler - i.e. exactly when the loop
  was already about to reset anyway, so the swap is invisible. A signature
  string (`lastRadioSignature`, built from each station's title/artist) is
  compared first so *most* polls - where nothing actually changed - skip
  the rebuild entirely rather than queuing a no-op update.
- **Lap duration is capped, not just speed-based.** `TICKER_PX_PER_SEC`
  (55) sets normal reading speed, but `RADIO_TICKER_MAX_DURATION_SEC` (75)
  caps how long a single lap can take regardless of how many stations are
  configured - past that content-width threshold, effective scroll speed
  auto-increases rather than letting lap time grow unbounded as more
  stations get added. Adjust the single `RADIO_TICKER_MAX_DURATION_SEC`
  number if the ticker ever feels too fast/slow after a big batch of
  station additions.
- **Station starting position rotates each lap** (`radioRotationOffset`),
  purely cosmetic ordering so the same stations don't chronically end up
  stuck at the tail end where a quick glance is less likely to reach them.
  Doesn't affect the underlying `RADIO_STATIONS` array order or click
  targets - click-to-play still maps back to the original (unrotated)
  index.
- **Mini-player cover art** (`radioPlayerCover` `<img>`) only ever gets set
  for stations whose `coverUrl` is non-null (SecureNetSystems and SoCast,
  as of this writing - Icecast, Futuri, and wpshowplaying have no artwork
  field at all) - hidden entirely for stations with no art, and falls back
  to hidden on a broken image load too (`onerror`). Uses
  `referrerpolicy="no-referrer"` because SecureNetSystems' album-art CDN
  (`cdnrf.securenetsystems.net`) blocks image requests carrying a `Referer`
  header from another site - confirmed by testing the image URL directly
  (worked) vs. embedded on the map page (silently failed) before finding
  this fix.
- **Mini-player now-playing text/cover refreshes live, not just once at
  play time.** Originally the displayed station/title/cover were only ever
  set inside `playStation()`, at the moment someone clicked a station -
  meaning if the actual program changed while someone was listening (e.g.
  Radio by Grace's schedule moving from one host to the next), the mini
  player kept showing stale info even though the audio itself kept playing
  correctly. Fixed by tracking `currentPlayingDisplayName` and checking it
  against fresh data on every poll inside `renderRadioTicker()` - if it
  matches the currently-loaded station, `updateMiniPlayerNowPlaying()` (a
  helper shared with `playStation()`'s initial set) refreshes the mini
  player immediately. Deliberately NOT tied to the ticker's scroll-lap
  deferral logic above - there's no marquee animation in the mini player to
  protect from a jarring restart, so this updates every poll, not just at a
  lap boundary.
- **Visual separators:** the radio ticker uses a small gold (`#f2c76e`)
  broadcast-tower SVG between station entries (`RADIO_TICKER_SEP`); the
  Conference ticker (unrelated to radio, but shares the same marquee
  mechanism) uses a white dove SVG (`TICKER_DOVE_SEP`) instead of a plain
  bullet. Both are inline SVG strings baked into the JS, not separate image
  files.

---

## Favoriting and the Browse Panel (major architecture change)

As the station count grew past what a single continuous ticker line could
practically show (some stations would simply never scroll into view
during a normal glance), the ticker's whole display model changed:

- **The header ticker now only shows stations the visitor has personally
  favorited** - not every configured station. Adding a new station to
  `RADIO_STATIONS` does NOT make it appear in anyone's ticker by default;
  it just becomes available to discover and favorite in the Browse Panel.
- **Favorites live entirely client-side**, in `localStorage`
  (`ccaFinderRadioFavorites`), keyed by exact `displayName` string. No
  backend/KV involvement at all - renaming a station's `displayName`
  silently un-favorites it for anyone who already picked it under the old
  name (acceptable/expected, not a bug - just something to know before
  doing a bulk rename).
- **The Browse Panel** ("📻 All Stations" button) lists every configured
  station with its now-playing text, a search box, and a star toggle per
  station. Toggling a star updates the header ticker immediately (bypasses
  the ticker's normal deferred-swap logic entirely, since this is a
  deliberate action the person is actively looking at, not a passive
  background poll - see the ticker rebuild logic above for why that
  distinction matters).
- **Zero-favorites state is a real, inviting CTA in the ticker itself**
  ("📻 Pick your favorite stations →"), not blank space - this doubles as
  the primary discovery path for the whole feature, so it's styled like a
  real call-to-action and is directly clickable to open the panel.
- **A "starter pack"** (`RADIO_STARTER_PACK_NAMES` in `index.html`) lets
  someone add a hand-curated set of stations in one click instead of
  favoriting individually. If they already have favorites, they're asked
  to choose merge vs. replace rather than silently overwriting; if they
  have zero, it applies immediately since there's nothing to lose. Keep
  this array in sync with any `displayName` renames - a stale name here
  fails to match silently rather than erroring.
- **List order in the Browse Panel is frozen for the viewing session.**
  Favorited stations sort alphabetically to the top, everything else
  alphabetical below - but this is computed ONCE when the panel opens, not
  live-recomputed on every star toggle. Reshuffling the whole list under
  someone's cursor mid-decision was judged more disruptive than useful;
  the reward (seeing your picks grouped together) shows up the next time
  the panel is reopened instead.
- **`cityState`/`homePage`** (see the general fields note near the top of
  this doc) render in the Browse Panel's rows specifically because a bare
  station name plus now-playing text isn't enough context to decide
  whether to favorite something you've never heard of - this is the whole
  reason those two fields exist.

---

## Adding a new station - checklist

1. Identify the provider type (SecureNetSystems XML? Icecast JSON? Futuri
   JSON array? SoCast JSONP? WordPress HTML scrape? Something new entirely?).
2. Gather the provider-specific fields per the sections above.
3. If it's Icecast and the status endpoint returns an **array** rather than
   a single object, confirm `?mount=/{name}` actually narrows it down to
   one entry before assuming array-index-0 is the right mount.
4. **Policy: confirm real now-playing data exists BEFORE investing time on
   the rest of the setup.** If a station's feed can only ever produce a
   generic "Live" placeholder with no real program/song info, don't add
   it - full stop. (WJWD is a grandfathered exception from before this was
   a firm rule, not a precedent to repeat.)
5. **Reject if getting real data would require spoofing headers** (fake
   `Origin`/`Referer` to impersonate a station's own official player) -
   see the Live365 case above. That's a deliberate decision not to
   pursue, not a technical workaround worth building.
6. Add one entry to `RADIO_STATIONS` in `src/index.js`.
7. If it's a genuinely new provider format, add a `parse()` +
   `buildNowPlayingUrl()` pair to `RADIO_PROVIDERS`, returning
   `{ title, artist, coverUrl }`.
8. Redeploy, then check the raw `/radio-now-playing` endpoint output
   directly in a browser tab to confirm the new station's data looks right
   before worrying about how it renders in the ticker/mini-player.
9. **Test actual playback on the deployed site**, not just the raw stream
   URL in a new tab - a URL can load fine standalone and still get hard-
   blocked as mixed content once embedded in the (HTTPS) map page. If the
   only working stream URL is `http://`, especially on a raw IP or port,
   treat that as a real risk to flag before committing - and if the
   station's own website's player fails the same way, that's strong
   outside confirmation the problem is real infrastructure, not our setup.
10. **Verify the "now playing" data actually matches reality**, not just
    that it returns data at all. A plausible-looking, easy-to-find endpoint
    isn't necessarily the right one (see the SoCast gotcha above) - check
    what the station's own site displays as currently on-air/playing against
    what our feed reports before considering the integration done.
11. Optionally fill in `cityState`/`homePage` (see the Favoriting section
    above for why these exist) - not required, but genuinely useful once
    someone's deciding whether to favorite a station they've never heard of.
    A new station is NOT automatically favorited for anyone - it just
    becomes discoverable in the Browse Panel until someone stars it (or
    it's added to `RADIO_STARTER_PACK_NAMES`).
