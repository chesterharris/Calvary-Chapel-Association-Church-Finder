// Hand-transcribed from KKJC's own published schedule pages, raw page source
// pulled directly (not WebFetch's markdown summary - see
// radio-station-published-schedule-notes.md on why that's unreliable for
// verbatim transcription) on 2026-09-20:
//   - Weekday: https://kkjc.net/programs/
//   - Saturday/Sunday: https://kkjc.net/saturday-and-sunday-schedule/
// See radio-station-published-schedule-notes.md for the transcription
// format, the lookup algorithm this feeds, and this station's own notes
// below. A manual re-check against the live pages is scheduled for
// 2026-11-19 (60 days out).
//
// New station, not previously investigated (Larry confirmed nothing in the
// codebase or notes had ever looked at KKJC before this). The station's
// live player (http://live.kkjc.net) is a Radiojar embed - a provider never
// used anywhere else in this codebase - with streamName "4q1m6fsb0k8uv".
// Radiojar's own now-playing feed
// (https://proxy.radiojar.com/api/stations/4q1m6fsb0k8uv/now_playing/)
// returns valid JSON(P) but with every field permanently empty - confirmed
// both by polling it directly and by KKJC's own site, whose "Now playing"
// widget is permanently `class="hide"` in the page's own markup. Larry
// separately confirmed the same blank response. Same genuinely-dead-
// metadata situation as every other station on this provider, just
// discovered fresh here rather than via a rejected XML feed - so
// publishedschedule is used directly rather than adding a whole new
// "radiojar" provider for a feed that will never return anything.
//
// The stream itself is unrelated to the dead metadata and independently
// confirmed live: https://stream.radiojar.com/4q1m6fsb0k8uv returned
// `200 OK` / `content-type: audio/mpeg` over HTTPS (tested both bare and
// with a cache-busting query string) - genuinely HTTPS-capable, not the
// same mixed-content dead end as KBOK/WRBP.
//
// Both source pages are a plain WordPress HTML `<table>` (Time / (Pacific
// Time) / Program / Pastor/Teacher columns) - no accordion or rich-text
// markup to fight like GraceFM/GodsWayRadio, and already correctly cased
// throughout (no ALL-CAPS title-casing trap like GraceFM's).
//
// The weekend page is a SINGLE combined table titled "Saturday and Sunday
// Schedule" - unlike every other station on this provider, KKJC doesn't
// publish separate Saturday/Sunday lineups at all. WEEKEND_SCHEDULE below
// is that one table, reused as both `saturday` and `sunday`.
//
// The weekend table also marks a program's second half-hour with a literal
// "(continued)" row instead of repeating the program/host - those 9 rows are
// dropped during transcription rather than kept as a bogus "(continued)"
// program: the lookup already treats every entry as "airs until the next
// marker," so the first half-hour's entry naturally covers the second half
// on its own once the continuation row is removed.
//
// Four spelling inconsistencies appear identically on both pages, each
// resolved by picking the real person's actual name rather than asking
// which row is the typo:
//   - "Michael Youseff" -> Michael Youssef (Leading the Way's real host).
//   - "Alastair Begg" / "Alistair Begg" -> Alistair Begg (Truth for Life),
//     matching the spelling already used for this same host on KGPS/other
//     stations elsewhere in this file.
//   - "Dr. Adrian Rodgers" / "Dr. Adrian Rogers" -> Dr. Adrian Rogers (Love
//     Worth Finding).
//   - "Jon Courson" / "John Courson" -> Jon Courson (Searchlight).
// "Dr. J. Vernon McGee" / "J. Vernon McGee" (the "Dr." prefix is inconsistent
// across rows on both pages) was standardized to "J. Vernon McGee" with no
// prefix, matching how this same host is already transcribed for KGPS/WJWD
// elsewhere in this codebase.
//
// One flagged-but-not-resolved anomaly, left exactly as shown rather than
// guessed: the weekend 10:30 AM slot pairs "Love Worth Finding" with "Dr.
// David Jeremiah" - everywhere else, Love Worth Finding is Adrian Rogers'
// program and David Jeremiah's own program is Turning Point, so this looks
// like a copy-paste slip on KKJC's own page. Larry can confirm by ear
// whenever he's listening at that hour; nothing here should be treated as
// settled until then.
//
// Three "Pastor/Teacher" entries on the weekend page name a ministry rather
// than a person - "The Storyteller" / "Without Reservation", "Trail to
// Adventure" / "God's Great Outdoors", "Friends of Israel" / "Friends of
// Israel" - kept exactly as shown; that's genuinely what the source page's
// own column says, not a transcription slip.
//
// Timezone: America/Los_Angeles (McMinnville, OR - the source page itself
// labels its column "(Pacific Time)").
//
// Logo: staticCoverUrl '/kkjc-icon.png' / staticCoverThumbUrl
// '/kkjc-icon-128.png' - Larry's own CalvaryMac Radio badge (round mic
// graphic, "96.3 FM", "KKJC Christian Radio for Mac"), supplied directly as
// a finished circular badge rather than a bare mark. Unlike GraceFM/WJWD/
// KEWR/KGPS/GodsWayRadio, no rounded-square black frame was built around it
// - it's already a complete, polished app-icon-style design, so building
// another frame underneath would just double up on framing. Only the flat
// white square background behind the circle was removed (plain
// border-connected flood fill from the four corners - the white is far from
// the badge's own dark gray/blue tones, so no soft-edge halo to worry
// about), then resized to 512x512 / 128x128 to match every other station's
// icon dimensions.

const WEEKEND_SCHEDULE = [
  { time: '00:00', program: 'The Word For Today Weekend', host: 'Chuck Smith' },
  { time: '00:30', program: 'Love Worth Finding', host: 'Dr. Adrian Rogers' },
  { time: '01:00', program: 'The Storyteller', host: 'Without Reservation' },
  { time: '01:30', program: 'Real Radio', host: 'Jack Hibbs' },
  { time: '02:00', program: 'Through the Bible', host: 'J. Vernon McGee' },
  { time: '03:00', program: 'Open the Bible', host: 'Colin Smith' },
  { time: '03:30', program: 'Through the Bible Q&A', host: 'J. Vernon McGee' },
  { time: '04:00', program: 'The Word for Today', host: 'Chuck Smith' },
  { time: '05:00', program: 'Focal Point', host: 'Mike Fabarez' },
  { time: '05:30', program: 'Friends of Israel', host: 'Friends of Israel' },
  { time: '06:00', program: 'Leading the Way', host: 'Michael Youssef' },
  { time: '06:30', program: 'Truth for Life', host: 'Alistair Begg' },
  { time: '07:00', program: 'God-Centered Life', host: 'Josh Moody' },
  { time: '07:30', program: 'Trail to Adventure', host: "God's Great Outdoors" },
  { time: '08:00', program: 'A New Beginning', host: 'Greg Laurie' },
  { time: '08:30', program: "Parenting Today's Teens", host: 'Mark Gregston' },
  { time: '09:00', program: 'Springhill Community Church (Gaston)', host: 'Jeff McInnis' },
  { time: '10:00', program: 'The Word for Today Weekend', host: 'Chuck Smith' },
  // Flagged anomaly, kept exactly as shown - see header comment above.
  { time: '10:30', program: 'Love Worth Finding', host: 'Dr. David Jeremiah' },
  { time: '11:00', program: 'Baker Creek Community Church (McMinnville)', host: 'Dax Garlinghouse' },
  { time: '12:00', program: 'The Storyteller', host: 'Without Reservation' },
  { time: '12:30', program: 'Real Radio', host: 'Jack Hibbs' },
  { time: '13:00', program: 'Calvary Chapel McMinnville', host: 'Zach Lamberson' },
  { time: '14:00', program: 'Through the Bible', host: 'J. Vernon McGee' },
  { time: '15:00', program: 'Open the Bible', host: 'Colin Smith' },
  { time: '15:30', program: "Parenting Today's Teens", host: 'Mark Gregston' },
  { time: '16:00', program: 'Through the Bible Q&A', host: 'J. Vernon McGee' },
  { time: '16:30', program: 'Truth for Life', host: 'Alistair Begg' },
  { time: '17:00', program: 'The Word for Today', host: 'Chuck Smith' },
  { time: '18:00', program: 'Calvary Chapel McMinnville', host: 'Zach Lamberson' },
  { time: '19:00', program: 'Focal Point', host: 'Mike Fabarez' },
  { time: '19:30', program: 'Friends of Israel', host: 'Friends of Israel' },
  { time: '20:00', program: 'Leading the Way', host: 'Michael Youssef' },
  { time: '20:30', program: 'Truth for Life', host: 'Alistair Begg' },
  { time: '21:00', program: 'Baker Creek Community Church (McMinnville)', host: 'Dax Garlinghouse' },
  { time: '22:00', program: 'God-Centered Life', host: 'Josh Moody' },
  { time: '22:30', program: 'Trail to Adventure', host: "God's Great Outdoors" },
  { time: '23:00', program: 'A New Beginning', host: 'Greg Laurie' },
  { time: '23:30', program: "Parenting Today's Teens", host: 'Mark Gregston' },
];

export const KKJC_SCHEDULE = {
  timezone: 'America/Los_Angeles',

  weekday: [
    { time: '00:00', program: 'Focal Point', host: 'Mike Fabarez' },
    { time: '00:30', program: 'Leading the Way', host: 'Michael Youssef' },
    { time: '01:00', program: 'Searchlight', host: 'Jon Courson' },
    { time: '01:30', program: 'Truth for Life', host: 'Alistair Begg' },
    { time: '02:00', program: 'Word for Today (Evening)', host: 'Chuck Smith' },
    { time: '02:30', program: 'Crosswalk', host: 'Steve Whinery' },
    { time: '03:00', program: 'Open the Bible', host: 'Colin Smith' },
    { time: '03:30', program: 'Turning Point', host: 'Dr. David Jeremiah' },
    { time: '04:00', program: 'Real Radio', host: 'Jack Hibbs' },
    { time: '04:30', program: 'A New Beginning', host: 'Greg Laurie' },
    { time: '05:00', program: 'God-Centered Life', host: 'Josh Moody' },
    { time: '05:30', program: 'Streams of Life', host: 'Thom Carden' },
    { time: '06:00', program: 'Through the Bible', host: 'J. Vernon McGee' },
    { time: '06:30', program: 'Leading the Way', host: 'Michael Youssef' },
    { time: '07:00', program: 'A Sure Foundation', host: 'David Rosales' },
    { time: '07:30', program: 'Word for Today', host: 'Chuck Smith' },
    { time: '08:00', program: 'Focal Point', host: 'Mike Fabarez' },
    { time: '08:30', program: 'Running to Win', host: 'Erwin Lutzer' },
    { time: '09:00', program: 'Searchlight', host: 'Jon Courson' },
    { time: '09:30', program: 'Truth for Life', host: 'Alistair Begg' },
    { time: '10:00', program: 'A New Beginning', host: 'Greg Laurie' },
    { time: '10:30', program: 'Crosswalk', host: 'Steve Whinery' },
    { time: '11:00', program: 'God-Centered Life', host: 'Josh Moody' },
    { time: '11:30', program: 'Open the Bible', host: 'Colin Smith' },
    { time: '12:00', program: 'Real Radio', host: 'Jack Hibbs' },
    { time: '12:30', program: 'Word for Today', host: 'Chuck Smith' },
    { time: '13:00', program: 'Through the Bible', host: 'J. Vernon McGee' },
    { time: '13:30', program: 'Turning Point', host: 'Dr. David Jeremiah' },
    { time: '14:00', program: 'A Sure Foundation', host: 'David Rosales' },
    { time: '14:30', program: 'Love Worth Finding', host: 'Dr. Adrian Rogers' },
    { time: '15:00', program: 'Focal Point', host: 'Mike Fabarez' },
    { time: '15:30', program: 'Streams of Life', host: 'Thom Carden' },
    { time: '16:00', program: 'Word for Today (Evening)', host: 'Chuck Smith' },
    { time: '16:30', program: 'A New Beginning', host: 'Greg Laurie' },
    { time: '17:00', program: 'Truth for Life', host: 'Alistair Begg' },
    { time: '17:30', program: 'Through the Bible', host: 'J. Vernon McGee' },
    { time: '18:00', program: 'Real Radio', host: 'Jack Hibbs' },
    { time: '18:30', program: 'Leading the Way', host: 'Michael Youssef' },
    { time: '19:00', program: 'Crosswalk', host: 'Steve Whinery' },
    { time: '19:30', program: 'Word for Today', host: 'Chuck Smith' },
    { time: '20:00', program: 'God-Centered Life', host: 'Josh Moody' },
    { time: '20:30', program: 'Turning Point', host: 'Dr. David Jeremiah' },
    { time: '21:00', program: 'Open the Bible', host: 'Colin Smith' },
    { time: '21:30', program: 'Running to Win', host: 'Erwin Lutzer' },
    { time: '22:00', program: 'A Sure Foundation', host: 'David Rosales' },
    { time: '22:30', program: 'Love Worth Finding', host: 'Dr. Adrian Rogers' },
    { time: '23:00', program: 'Searchlight', host: 'Jon Courson' },
    { time: '23:30', program: 'A New Beginning', host: 'Greg Laurie' },
  ],

  // Source page publishes one single combined table for the whole weekend -
  // see header comment above. Both days share the exact same lineup.
  saturday: WEEKEND_SCHEDULE,
  sunday: WEEKEND_SCHEDULE,
};
