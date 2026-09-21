// Hand-transcribed from WXMB's own schedule pages -
// https://wxmbfm.com/schedule/weekday/, /schedule/saturday/, and
// /schedule/sunday/ - on 2026-09-21. Unlike KFLK/KKJC's embedded-image
// grids, these are plain HTML text (one "H:MMam/pm- Program - Host" line
// per half-hour slot), so this was a direct read via get_page_text rather
// than an image transcription - no OCR-style judgment calls needed.
//
// WXMB was investigated once before and actually added, then removed -
// see radio-station-providers-notes-consolidated.md's `securenetsystems`
// section. The stream itself was never the problem: page source supplied
// by Larry (`WXMB-pagesource_listen.txt`) declares
// `streamSRC = "https://ice25.securenetsystems.net/WXMB?playSessionID=..."`,
// confirmed actually playing 2026-09-21 by inspecting the page's live
// <audio> element (`paused: false`, `readyState: 3`,
// `currentSrc` matching that same ice25 URL) - direct curl to the ice
// server itself is blocked by this environment's egress policy, so the
// in-page element check stood in for it. The now-playing metadata is the
// genuinely dead part: re-querying `player_status_update/WXMB.xml`
// 2026-09-21 returned the exact same frozen `programStartTS` (`29 Jul 2026
// 21:31:10`) and the same `"Boldly Speaking" / "Ron Dozler"` title/artist
// pair documented at the original removal - now pushing two months stale,
// not a fluke. Same dead-metadata situation as every other
// publishedschedule station, so this goes straight to a published-schedule
// transcription. subdomain `streamdb7web.securenetsystems.net` and
// callSign `WXMB` both match the original writeup exactly.
//
// Every slot is a plain half-hour block, one row per airing - the
// "repeat = separate entries" convention (see
// radio-station-published-schedule-notes.md's "Transcription format")
// applies automatically since each page already lists every airing as its
// own row (e.g. "Boldly Speaking Radio" appears at both 7:30am and 12:00pm
// on the weekday grid, transcribed as two independent entries below). All
// three days verified by script to be exactly 48 half-hour entries with no
// duplicate start times, summing to exactly 1440 minutes - trivial here
// since the source itself is already a uniform half-hour grid with full
// day coverage, but checked anyway per the established methodology.
//
// Normalization, not a judgment call: "God Sword" (weekday page's own
// spelling) / "Godsword" (Saturday/Sunday pages' spelling) unified to
// "GodSword" everywhere, matching the spelling already used for the same
// program (Ken Graves) on KFLK's schedule in this codebase.
//
// Left as literally transcribed, not reconciled, because the two source
// pages disagree and neither is obviously the typo: "Zack Vazquez"
// (weekday's "Sword & Spirit" host) vs "Zak Vasquez" (Saturday's same
// program); "Al Pittman" (weekday's "Dwelling Place" host) vs "Al Pitman"
// (Saturday's same program). Each kept exactly as its own page spells it.
//
// Timezone: America/New_York (Myrtle Beach, SC is Eastern).
//
// Logo: staticCoverUrl '/wxmb-icon.png' / staticCoverThumbUrl
// '/wxmb-icon-128.png' - Larry's own "WXMB 101.5 Myrtle Beach FM" badge.
// Unlike KFLK/KKJC's circular line-art marks on a plain white field, this
// source image (168x160, opaque RGB, no alpha) is already a complete,
// finished rectangular badge with its own full-bleed blue gradient
// background baked in - nothing to flood-fill or frame. Only processing
// applied: padded the non-square 168x160 source onto a 168x168 canvas by
// replicating the top/bottom edge rows into the new 4px top/bottom strips
// (rather than leaving them transparent, which would show as a seam
// against the badge's own background), then resized to 512x512 and
// 128x128 via LANCZOS.

const WEEKDAY_SCHEDULE = [
  { time: '00:00', program: 'The Word Remains', host: 'George Small' },
  { time: '00:30', program: 'Somebody Loves You', host: 'Raul Ries' },
  { time: '01:00', program: 'The Faithful Word', host: 'Bob Hargraves' },
  { time: '01:30', program: 'Dwelling Place', host: 'Al Pittman' },
  { time: '02:00', program: 'In Spirit and Truth', host: 'JD Farag' },
  { time: '02:30', program: 'Sword & Spirit', host: 'Zack Vazquez' },
  { time: '03:00', program: 'Light on a Hill', host: 'James Kaddis' },
  { time: '03:30', program: 'Larger than Life', host: 'Ron Hindt' },
  { time: '04:00', program: 'Chapter and Verse', host: 'Mike McIntosh' },
  { time: '04:30', program: 'Sandy Adams Radio', host: '' },
  { time: '05:00', program: 'Connection Radio', host: 'Skip Heitzig' },
  { time: '05:30', program: 'Grace upon Grace', host: 'Mark Martin' },
  { time: '06:00', program: 'Sound Doctrine', host: 'Jeff Johnson' },
  { time: '06:30', program: 'Revival Radio', host: 'John Miller' },
  { time: '07:00', program: 'A New Beginning', host: 'Greg Laurie' },
  { time: '07:30', program: 'Boldly Speaking Radio', host: 'Ron Dozler' },
  { time: '08:00', program: 'Straight From the Heart', host: 'Joe Focht' },
  { time: '08:30', program: 'According to the Scriptures', host: 'Damian Kyle' },
  { time: '09:00', program: 'The Word for Today', host: 'Chuck Smith' },
  { time: '09:30', program: 'Jesus in Our Time', host: 'Doug Kinney' },
  { time: '10:00', program: 'A Loving Word', host: 'Razz Vazquez' },
  { time: '10:30', program: 'Bridging the Gap', host: 'Lloyd Pulley' },
  { time: '11:00', program: 'The Balanced Word', host: 'Dave Rolph' },
  { time: '11:30', program: 'Insight for Living', host: 'Chuck Swindoll' },
  { time: '12:00', program: 'Boldly Speaking Radio', host: 'Ron Dozler' },
  { time: '12:30', program: 'Hope from the Word', host: 'Bill Luebkemann' },
  { time: '13:00', program: 'WallBuilders Radio', host: '' },
  { time: '13:30', program: 'A Sure Foundation', host: 'David Rosales' },
  { time: '14:00', program: 'Family Life Today', host: '' },
  { time: '14:30', program: 'Revive Our Hearts', host: 'Nancy DeMoss Wolgemuth' },
  { time: '15:00', program: 'The Word Made Plain', host: 'Tony Clark' },
  { time: '15:30', program: 'Cornerstone Connection', host: 'Gary Hamrick' },
  { time: '16:00', program: 'SearchLight', host: 'Jon Courson' },
  { time: '16:30', program: 'Real Radio', host: 'Jack Hibbs' },
  { time: '17:00', program: 'Enduring Word', host: 'David Guzik' },
  { time: '17:30', program: 'Boldly Speaking Radio', host: 'Ron Dozler' },
  { time: '18:00', program: 'Study the Word', host: 'Thom Keller' },
  { time: '18:30', program: 'According to the Scriptures', host: 'Damian Kyle' },
  { time: '19:00', program: 'Changed by Love', host: 'Jim Keavney' },
  { time: '19:30', program: 'Life from the Word', host: 'Chris Swansen' },
  { time: '20:00', program: 'Sound Truth', host: 'Malcolm Wild' },
  { time: '20:30', program: 'Hope For Today', host: 'David Hocking' },
  { time: '21:00', program: 'Abiding in the Word', host: 'Dave Love' },
  { time: '21:30', program: 'Jesus is Real', host: 'Daniel Fusco' },
  { time: '22:00', program: 'The Living Word', host: 'Danny Hodges' },
  { time: '22:30', program: 'A Daily Walk', host: 'John Randall' },
  { time: '23:00', program: 'Revival Radio', host: 'John Miller' },
  { time: '23:30', program: 'GodSword', host: 'Ken Graves' },
];

const SATURDAY_SCHEDULE = [
  { time: '00:00', program: 'Upbeat Music', host: '' },
  { time: '00:30', program: 'Upbeat Music', host: '' },
  { time: '01:00', program: 'Upbeat Music', host: '' },
  { time: '01:30', program: 'Upbeat Music', host: '' },
  { time: '02:00', program: 'Living For Jesus', host: 'John Gundacker' },
  { time: '02:30', program: 'Boldly Speaking', host: 'Ron Dozler' },
  { time: '03:00', program: 'Sound Doctrine', host: 'Jeff Johnson' },
  { time: '03:30', program: 'Worship Life Radio', host: 'Holland Davis' },
  { time: '04:00', program: 'Study the Word', host: 'Thom Keller' },
  { time: '04:30', program: 'At His Feet', host: 'Tom Dickerson' },
  { time: '05:00', program: 'Run the Race to Win', host: 'Greg Blanc' },
  { time: '05:30', program: 'According to the Scriptures', host: 'Damian Kyle' },
  { time: '06:00', program: 'GodSword', host: 'Ken Graves' },
  { time: '06:30', program: 'A New Beginning', host: 'Greg Laurie' },
  { time: '07:00', program: 'Countdown 2 Eternity', host: 'James Kaddis' },
  { time: '07:30', program: 'Boldly Speaking', host: 'Ron Dozler' },
  { time: '08:00', program: 'Keys for Kids', host: '' },
  { time: '08:30', program: 'Adventures in Odyssey', host: '' },
  { time: '09:00', program: 'Rinse & Repeat', host: 'Carol Eskaos' },
  { time: '09:30', program: 'We Would See Jesus', host: '' },
  { time: '10:00', program: 'Family Life This Week', host: '' },
  { time: '10:30', program: 'The Word for Today', host: 'Chuck Smith' },
  { time: '11:00', program: "Servant's Quarters", host: 'Gayle Erwin' },
  { time: '11:30', program: 'Somebody Loves You', host: 'Raul Ries' },
  { time: '12:00', program: 'According to the Scriptures', host: 'Damian Kyle' },
  { time: '12:30', program: 'The Dacus Report', host: 'Brad Dacus' },
  { time: '13:00', program: 'The Word Made Plain', host: 'Tony Clark' },
  { time: '13:30', program: 'Anchored Truth', host: 'Justin Marbury' },
  { time: '14:00', program: 'World News Briefing', host: '' },
  { time: '14:30', program: 'World News Briefing', host: '' },
  { time: '15:00', program: 'Voice of the Martyrs', host: '' },
  { time: '15:30', program: 'The Dwelling Place', host: 'Al Pitman' },
  { time: '16:00', program: 'Real Radio', host: 'Jack Hibbs' },
  { time: '16:30', program: 'Sound Doctrine', host: 'Jeff Johnson' },
  { time: '17:00', program: 'Boldly Speaking', host: 'Ron Dozler' },
  { time: '17:30', program: 'Changed by Love', host: 'Jim Keavney' },
  { time: '18:00', program: 'The Balanced Word', host: 'Dave Rolph' },
  { time: '18:30', program: 'Countdown 2 Eternity', host: 'James Kaddis' },
  { time: '19:00', program: 'Jesus is Real', host: 'Daniel Fusco' },
  { time: '19:30', program: 'Sword & Spirit', host: 'Zak Vasquez' },
  { time: '20:00', program: 'Anchored Truth', host: 'Justin Marbury' },
  { time: '20:30', program: 'Worship Life Radio', host: 'Holland Davis' },
  { time: '21:00', program: 'Upbeat Music', host: '' },
  { time: '21:30', program: 'Upbeat Music', host: '' },
  { time: '22:00', program: 'Upbeat Music', host: '' },
  { time: '22:30', program: 'Upbeat Music', host: '' },
  { time: '23:00', program: 'Upbeat Music', host: '' },
  { time: '23:30', program: 'Upbeat Music', host: '' },
];

const SUNDAY_SCHEDULE = [
  { time: '00:00', program: 'UpBeat Music', host: '' },
  { time: '00:30', program: 'UpBeat Music', host: '' },
  { time: '01:00', program: 'A New Beginning', host: 'Greg Laurie' },
  { time: '01:30', program: 'Abounding Grace', host: 'Ed Taylor' },
  { time: '02:00', program: 'GodSword', host: 'Ken Graves' },
  { time: '02:30', program: 'Simple Faith', host: 'Bill Henry' },
  { time: '03:00', program: "Servant's Quarters", host: 'Gayle Erwin' },
  { time: '03:30', program: 'Countdown to Eternity', host: 'James Kaddis' },
  { time: '04:00', program: 'Study the Word', host: 'Thom Keller' },
  { time: '04:30', program: 'Looking to Jesus', host: 'Ray Torey' },
  { time: '05:00', program: 'Boldly Speaking', host: 'Ron Dozler' },
  { time: '05:30', program: 'Run the Race to Win', host: 'Greg Blanc' },
  { time: '06:00', program: 'Real Radio', host: 'Jack Hibbs' },
  { time: '06:30', program: 'According to the Scriptures', host: 'Damian Kyle' },
  { time: '07:00', program: 'TWFT', host: 'Chuck Smith' },
  { time: '07:30', program: 'TWFT', host: 'Chuck Smith' },
  { time: '08:00', program: 'Bridge Gap', host: 'Lloyd Pulley' },
  { time: '08:30', program: 'Somebody Loves You', host: 'Raul Ries' },
  { time: '09:00', program: 'A New Beginning', host: 'Greg Laurie' },
  { time: '09:30', program: 'The Word Made Plain', host: 'Tony Clark' },
  { time: '10:00', program: 'A Daily Walk', host: 'John Randall' },
  { time: '10:30', program: 'Live at Calvary Chapel Myrtle Beach', host: '' },
  { time: '11:00', program: 'Live at Calvary Chapel Myrtle Beach', host: '' },
  { time: '11:30', program: 'Insight for Living', host: 'Chuck Swindoll' },
  { time: '12:00', program: 'Study the Word', host: 'Thom Keller' },
  { time: '12:30', program: 'The Dacus Report', host: 'Brad Dacus' },
  { time: '13:00', program: 'Family Life This Week', host: '' },
  { time: '13:30', program: 'Light on the Hill', host: 'James Kaddis' },
  { time: '14:00', program: 'Rinse & Repeat', host: 'Carol Eskaros' },
  { time: '14:30', program: 'Epicenter', host: 'Joel Rosenberg' },
  { time: '15:00', program: 'Voice of the Martyrs', host: '' },
  { time: '15:30', program: "Servant's Quarters", host: 'Gayle Erwin' },
  { time: '16:00', program: 'World News Briefing', host: '' },
  { time: '16:30', program: 'World News Briefing', host: '' },
  { time: '17:00', program: 'Washington Watch', host: 'Tony Perkins' },
  { time: '17:30', program: 'Boldly Speaking', host: 'Ron Dozler' },
  { time: '18:00', program: 'Gaither Music Hour', host: '' },
  { time: '18:30', program: 'Gaither Music Hour', host: '' },
  { time: '19:00', program: 'Lamplighter Theatre', host: '' },
  { time: '19:30', program: 'Radio Theatre', host: '' },
  { time: '20:00', program: 'Abounding Grace', host: 'Ed Taylor' },
  { time: '20:30', program: 'Growing in the Word', host: 'Jim Jarrett' },
  { time: '21:00', program: 'GodSword', host: 'Ken Graves' },
  { time: '21:30', program: 'Worship Life Radio', host: 'Holland Davis' },
  { time: '22:00', program: 'Come Drink Water', host: 'Ben Garate' },
  { time: '22:30', program: 'Looking to Jesus', host: 'Ray Torey' },
  { time: '23:00', program: 'At His Feet', host: 'Tom Dickerson' },
  { time: '23:30', program: 'Living for Jesus', host: 'John Gundacker' },
];

export const WXMB_SCHEDULE = {
  timezone: 'America/New_York',
  weekday: WEEKDAY_SCHEDULE,
  saturday: SATURDAY_SCHEDULE,
  sunday: SUNDAY_SCHEDULE,
};
