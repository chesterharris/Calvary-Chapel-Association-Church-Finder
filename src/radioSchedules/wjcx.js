// Hand-transcribed from WJCX 99.5's own published schedule page
// (https://ccbangor.org/radio, "WEEKDAY SCHEDULE" / "WEEKEND SCHEDULE"
// accordions) on 2026-09-23. Brand-new station - Larry supplied the
// station's own radio page, its Subsplash "Listen Now" link, and the WJCX
// logo directly; no prior investigation or removal history exists for it.
// See radio-station-published-schedule-notes.md for the transcription
// format and the lookup algorithm this feeds.
//
// Stream: the Subsplash "Listen Now" page (https://subsplash.com/u/
// calvarychapelbangor/media/d/k8kcrh7-wjcx-99-5-fm) embeds a plain <audio>
// element whose confirmed src is https://ice7.securenetsystems.net/WJCX -
// this is a SecureNetSystems-hosted stream (same platform as KFLK/KKJC/
// WXMB/etc.), confirmed genuinely live via the element's own paused/
// readyState and by the station's own SecureNetSystems player page
// (https://radio.securenetsystems.net/v5/WJCX, which resolves without a
// per-account streamdbXweb.securenetsystems.net redirect for this station -
// unusual compared to every other SecureNetSystems entry in this file).
//
// Now-playing: went straight to this published schedule instead of the
// securenetsystems provider because the metadata pipeline is confirmed dead
// two different ways, not just one. First, the v5 player's own inline
// config sets `polling.enabled = false` for this station specifically -
// i.e. the station's own player never even attempts a metadata fetch, a
// different (and more deliberate-looking) flavor of dead feed than the
// usual "soft-404" cases elsewhere in this file. Second, calling the
// standard endpoint shape by hand anyway
// (https://radio.securenetsystems.net/player_status_update/WJCX.xml,
// mirroring how the page's own getNowPlaying() builds the URL from its
// stationCallUrl/stationCallSign globals - stationCallUrl here is just
// radio.securenetsystems.net itself, not a distinct streamdbXweb host)
// still returns the same HTTP-200-with-error-body "The system cannot find
// the file specified" seen for GraceFM/WJWD/KEWR/KGPS/WAYGLP/WXMB. Two
// independent dead ends, so this was wired up via the published schedule
// from the start rather than added-then-later-pulled.
//
// The weekday and weekend grids are each internally consistent (verified
// script-side: every day's entries have distinct start times and their
// covered spans sum to exactly 1440 minutes), but the site itself only
// publishes TWO accordions - "WEEKDAY SCHEDULE" and a single "WEEKEND
// SCHEDULE" covering both Saturday and Sunday - unlike most stations in
// this file, which publish Saturday and Sunday separately. Modeled here by
// pointing both `saturday` and `sunday` at the same WEEKEND_SCHEDULE array.
//
// Two source-side notes worth flagging to Larry:
//
// 1) The weekday grid spells the 6/6:30am and 6/6:30pm "Walk In The Light"
//    host as "Bil Gallatin" (6:00 AM) vs "Bil Galatin" (6:00 PM) - same
//    program, same host link (ccfingerlakes.org) both times. Canonicalized
//    to "Bil Gallatin" throughout (the spelling used the first time it
//    appears) rather than treating it as two different people.
//
// 2) The weekend grid's 1:00 PM "Focus On The Family" slot has no host
//    name in the source at all - unlike every other row, its <a> link
//    (focusonthefamily.com) follows directly with no name text before it.
//    Left as host: '' rather than guessing (Focus On The Family's public
//    host has changed over the years and isn't otherwise stated anywhere
//    on this station's own pages, so there's nothing on-site to
//    cross-reference against, unlike Faith FM's missing Saturday host
//    cell).
//
// Timezone: America/New_York (Bangor, ME - Eastern).

// Published as a single "WEEKEND SCHEDULE" covering both Saturday and
// Sunday - see note above. Used for both the `saturday` and `sunday`
// fields below.
const WEEKEND_SCHEDULE = [
  { time: '00:00', program: 'Music', host: '' },
  { time: '01:00', program: 'GodSword', host: 'Ken Graves' },
  { time: '01:30', program: 'Music', host: '' },
  { time: '04:00', program: 'GodSword', host: 'Ken Graves' },
  { time: '04:30', program: 'Music', host: '' },
  { time: '07:30', program: 'Living In Christ', host: 'Bob Hoekstra' },
  { time: '08:00', program: 'Straight From The Heart', host: 'Joe Focht' },
  { time: '08:30', program: 'Music', host: '' },
  { time: '09:00', program: 'GodSword', host: 'Ken Graves' },
  { time: '09:30', program: 'The Word Remains', host: 'George Small' },
  { time: '10:00', program: 'Music', host: '' },
  { time: '10:30', program: 'Issues In Education', host: 'The Boyds' },
  { time: '11:00', program: 'Music', host: '' },
  { time: '12:00', program: 'The Word For Today', host: 'Chuck Smith' },
  { time: '12:30', program: 'Music', host: '' },
  // No host name given in the source for this slot - see note (2) above.
  { time: '13:00', program: 'Focus On The Family', host: '' },
  { time: '14:00', program: 'Sound Doctrine', host: 'Jeff Johnson' },
  { time: '14:30', program: 'Music', host: '' },
  { time: '16:30', program: 'According To The Scriptures', host: 'Damian Kyle' },
  { time: '17:00', program: 'GodSword', host: 'Ken Graves' },
  { time: '17:30', program: 'Bridging The Gap', host: 'Lloyd Pulley' },
  { time: '18:00', program: 'Music', host: '' },
  { time: '18:30', program: 'Straight From The Heart', host: 'Joe Focht' },
  { time: '19:00', program: 'Music', host: '' },
  { time: '20:00', program: 'Somebody Loves You', host: 'Raul Ries' },
  { time: '20:30', program: 'Music', host: '' },
];

export const WJCX_SCHEDULE = {
  timezone: 'America/New_York',

  weekday: [
    { time: '00:00', program: 'Music', host: '' },
    { time: '01:00', program: 'GodSword', host: 'Ken Graves' },
    { time: '01:30', program: 'Music', host: '' },
    { time: '02:00', program: 'The Word For Today', host: 'Chuck Smith' },
    { time: '02:30', program: 'Music', host: '' },
    { time: '03:00', program: 'The Word Remains', host: 'George Small' },
    { time: '03:30', program: 'Music', host: '' },
    { time: '04:00', program: 'GodSword', host: 'Ken Graves' },
    { time: '04:30', program: 'According To The Scriptures', host: 'Damian Kyle' },
    { time: '05:00', program: 'Living in Christ', host: 'Bob Hoekstra' },
    { time: '05:30', program: 'Main Thing Radio', host: 'Robert Fountain' },
    { time: '06:00', program: 'Walk In The Light', host: 'Bil Gallatin' },
    { time: '06:30', program: 'Faith and Freedom', host: 'Mat Staver' },
    { time: '07:00', program: 'Living Fountains', host: 'Jim Stewart' },
    { time: '07:30', program: 'The Word For Today', host: 'Chuck Smith' },
    { time: '08:00', program: 'Straight From The Heart', host: 'Joe Focht' },
    { time: '08:30', program: 'A Sure Foundation', host: 'David Rosales' },
    { time: '09:00', program: 'GodSword', host: 'Ken Graves' },
    { time: '09:30', program: 'Take Me Deeper', host: 'Aaron Dudley' },
    { time: '10:00', program: 'Turning Point', host: 'David Jeremiah' },
    { time: '10:30', program: 'Enduring Word', host: 'David Guzik' },
    { time: '11:00', program: 'Crosswalk', host: 'Steve Whinery' },
    { time: '11:30', program: 'Wisdom For Women', host: 'Debbi Bryson' },
    { time: '12:00', program: 'Growing Deeper Together', host: 'Josh Lawrence' },
    { time: '12:30', program: 'The Emmaus Exposition', host: 'Travis Carey' },
    { time: '13:00', program: 'The Word For Today', host: 'Chuck Smith' },
    { time: '13:30', program: 'As We Gather', host: 'Bill Stonebraker' },
    { time: '14:00', program: 'Sound Doctrine', host: 'Jeff Johnson' },
    { time: '14:30', program: 'Believing The Word', host: 'Dan Shunk' },
    { time: '15:00', program: 'Take Heart', host: 'Greg Huston' },
    { time: '15:30', program: 'Hope', host: 'Jeff Esterline' },
    { time: '16:00', program: 'Sound Truth', host: 'Malcom Wild' },
    { time: '16:30', program: 'According To The Scriptures', host: 'Damian Kyle' },
    { time: '17:00', program: 'GodSword', host: 'Ken Graves' },
    { time: '17:30', program: 'Bridging The Gap', host: 'Lloyd Pulley' },
    { time: '18:00', program: 'Walk In The Light', host: 'Bil Gallatin' },
    { time: '18:30', program: 'Straight From The Heart', host: 'Joe Focht' },
    { time: '19:00', program: 'Plow Boy', host: 'Adam Kasprzak' },
    { time: '19:30', program: 'Living In Christ', host: 'Bob Hoekstra' },
    { time: '20:00', program: 'Somebody Loves You', host: 'Raul Ries' },
    { time: '20:30', program: 'Sword and Spirit', host: 'Zak Vazquez' },
    { time: '21:00', program: 'Faith and Freedom', host: 'Mat Staver' },
    { time: '21:30', program: 'Take Me Deeper', host: 'Aaron Dudley' },
    { time: '22:00', program: 'The Word For Today PM', host: 'Chuck Smith' },
    { time: '22:30', program: 'Enduring Word', host: 'David Guzik' },
    { time: '23:00', program: 'Verse By Verse', host: 'John Reed' },
    { time: '23:30', program: 'Music', host: '' },
  ],

  saturday: WEEKEND_SCHEDULE,
  sunday: WEEKEND_SCHEDULE,
};
