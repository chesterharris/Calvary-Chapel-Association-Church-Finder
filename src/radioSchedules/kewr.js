// Hand-transcribed from https://enduringwordradio.com/schedule/ on 2026-09-17.
// See radio-station-published-schedule-notes.md for the transcription format,
// the lookup algorithm this feeds, and the per-station notes below for the
// two judgment calls made here.
//
// Two naming inconsistencies in the source itself (same pattern as GraceFM's
// "Lead To Serve Podcast" vs "Lead To Serve"): the 7:30 AM slot is listed as
// "God Sword" while the identical 8:00 PM airing (same host, Ken Graves) is
// "GodSword" - canonicalized to "GodSword" throughout. The 11:30 AM host is
// misspelled "Mike Macintosh" on the source page itself (not a transcription
// error) - corrected to "Mike MacIntosh" per Larry.
//
// The source splits Monday-Friday across two separate tables (a daytime one
// and a "Monday - Friday (Overnight)" one) that hand off cleanly - the
// daytime table's last row is a plain "See Overnight Broadcast Schedule"
// pointer (not a real program, dropped here) at 10:30 PM, and the overnight
// table's last entry (5:00 AM, "40 Days Thru The NT") duplicates the daytime
// table's very first entry - dropped here too since the lookup wraps around
// midnight on its own. The two tables are merged into one 24-hour `weekday`
// array below.
//
// Judgment call (Larry's, 2026-09-17): the shared Saturday/Sunday table only
// carries one day-specific note - an 8:30-11:30 PM "Praise & Worship (Sat.
// Only)" block - and has nothing listed for Sunday past 8:00 PM. Rather than
// leave a multi-hour gap or guess at real programming, a single
// `Praise & Worship` entry was added at 8:30 PM on Sunday only, using the
// station's own generic filler category (used throughout this table already)
// rather than crediting a real program for hours it likely didn't run.
// Convenient side effect: that one addition also covers the Saturday-night-
// into-Sunday-morning stretch (11:30 PM Saturday - 5:00 AM Sunday) via the
// normal wraparound lookup, since Sunday's array has no entries before
// 5:00 AM otherwise. No weekdayOverridesByDay hack needed here, unlike
// WJWD - KEWR's Sunday table has no early-morning entries that would
// conflict with the weekday grid, so the weekday array just takes over
// cleanly at true midnight Monday.
//
// A 60-day manual re-check against the live page is scheduled for
// 2026-11-16.
export const KEWR_SCHEDULE = {
  timezone: 'America/Chicago',

  saturday: [
    { time: '05:00', program: 'Praise & Worship', host: '' },
    { time: '07:00', program: 'Bridging The Gap', host: 'Lloyd Pulley' },
    { time: '07:30', program: 'Praise & Worship', host: '' },
    { time: '08:00', program: 'Anchored Deep', host: 'Jeremy Higgins' },
    { time: '08:30', program: 'Praise & Worship', host: '' },
    { time: '10:00', program: 'Study The Word', host: 'Ryan Shaddix' },
    { time: '10:30', program: 'In His Word', host: 'Kolby Kriedel' },
    { time: '11:00', program: 'Praise & Worship', host: '' },
    { time: '12:00', program: 'The Word For Today', host: 'Chuck Smith' },
    { time: '12:30', program: 'Praise & Worship', host: '' },
    { time: '13:00', program: 'Radio Free Church', host: 'John Higgins' },
    { time: '13:30', program: 'Praise & Worship', host: '' },
    { time: '14:00', program: 'Only By Grace', host: 'Doug Warwick' },
    { time: '14:30', program: 'Praise & Worship', host: '' },
    { time: '15:00', program: 'Turning Point', host: 'David Jeremiah' },
    { time: '15:30', program: 'Praise & Worship', host: '' },
    { time: '16:00', program: 'According To Scripture', host: 'Damian Kyle' },
    { time: '16:30', program: 'Praise & Worship', host: '' },
    { time: '17:00', program: 'Anchored Deep', host: 'Jeremy Higgins' },
    { time: '17:30', program: 'Praise & Worship', host: '' },
    { time: '18:00', program: 'All Who Are Thirsty', host: 'Jim Remington' },
    { time: '18:30', program: 'Praise & Worship', host: '' },
    { time: '20:00', program: '40 Days Thru The NT', host: 'Faith Comes By Hearing' },
    // Sat.-only block per the source table.
    { time: '20:30', program: 'Praise & Worship', host: '' },
  ],

  // Identical to Saturday through 8:00 PM, but WITHOUT Saturday's "Sat.
  // Only" 8:30 PM block - see the judgment-call note above for the 20:30
  // filler entry added here instead.
  sunday: [
    { time: '05:00', program: 'Praise & Worship', host: '' },
    { time: '07:00', program: 'Bridging The Gap', host: 'Lloyd Pulley' },
    { time: '07:30', program: 'Praise & Worship', host: '' },
    { time: '08:00', program: 'Anchored Deep', host: 'Jeremy Higgins' },
    { time: '08:30', program: 'Praise & Worship', host: '' },
    { time: '10:00', program: 'Study The Word', host: 'Ryan Shaddix' },
    { time: '10:30', program: 'In His Word', host: 'Kolby Kriedel' },
    { time: '11:00', program: 'Praise & Worship', host: '' },
    { time: '12:00', program: 'The Word For Today', host: 'Chuck Smith' },
    { time: '12:30', program: 'Praise & Worship', host: '' },
    { time: '13:00', program: 'Radio Free Church', host: 'John Higgins' },
    { time: '13:30', program: 'Praise & Worship', host: '' },
    { time: '14:00', program: 'Only By Grace', host: 'Doug Warwick' },
    { time: '14:30', program: 'Praise & Worship', host: '' },
    { time: '15:00', program: 'Turning Point', host: 'David Jeremiah' },
    { time: '15:30', program: 'Praise & Worship', host: '' },
    { time: '16:00', program: 'According To Scripture', host: 'Damian Kyle' },
    { time: '16:30', program: 'Praise & Worship', host: '' },
    { time: '17:00', program: 'Anchored Deep', host: 'Jeremy Higgins' },
    { time: '17:30', program: 'Praise & Worship', host: '' },
    { time: '18:00', program: 'All Who Are Thirsty', host: 'Jim Remington' },
    { time: '18:30', program: 'Praise & Worship', host: '' },
    { time: '20:00', program: '40 Days Thru The NT', host: 'Faith Comes By Hearing' },
    // Added filler, Sunday only - see the judgment-call note above.
    { time: '20:30', program: 'Praise & Worship', host: '' },
  ],

  // The single Mon-Fri lineup, stitched from the source's two separate
  // tables (daytime + overnight) into one continuous 24-hour cycle - see
  // the note above on the dropped placeholder row and the dropped duplicate.
  weekday: [
    { time: '05:00', program: '40 Days Thru The NT', host: 'Faith Comes By Hearing' },
    { time: '05:30', program: 'The Transforming Word', host: 'Mike Spaulding' },
    { time: '06:00', program: 'Thru The Bible', host: 'J. Vernon McGee' },
    { time: '06:30', program: 'Sound Truth', host: 'Malcolm Wild' },
    { time: '07:00', program: 'Radio Free Church', host: 'John Higgins' },
    { time: '07:30', program: 'GodSword', host: 'Ken Graves' },
    { time: '08:00', program: 'Anchored Deep', host: 'Jeremy Higgins' },
    { time: '08:30', program: 'Abounding Grace', host: 'Ed Taylor' },
    { time: '09:00', program: 'Turning Point', host: 'David Jeremiah' },
    { time: '09:30', program: 'A Chosen Generation', host: 'Derald Skinner' },
    { time: '10:00', program: 'Thru The Bible', host: 'J. Vernon McGee' },
    { time: '10:30', program: 'Come To The Table', host: 'Mark Kirk' },
    { time: '11:00', program: 'A Daily Walk', host: 'John Randall' },
    { time: '11:30', program: 'Chapter And Verse', host: 'Mike MacIntosh' },
    { time: '12:00', program: 'The Word For Today', host: 'Chuck Smith' },
    { time: '12:30', program: 'According To Scripture', host: 'Damian Kyle' },
    { time: '13:00', program: 'Living Fountains', host: 'Jim Stewart' },
    { time: '13:30', program: 'Renewing The Mind', host: 'Greg Young' },
    { time: '14:00', program: 'The Berean Call', host: 'T.A. McMahon' },
    { time: '14:30', program: 'Bridging The Gap', host: 'Lloyd Pulley' },
    { time: '15:00', program: 'Study The Word', host: 'Thom Keller' },
    { time: '15:30', program: 'All Who Are Thirsty', host: 'Jim Remington' },
    { time: '16:00', program: 'Upward Call', host: 'Jeff Solwold' },
    { time: '16:30', program: 'Real Radio', host: 'Jack Hibbs' },
    { time: '17:00', program: 'Anchored Deep', host: 'Jeremy Higgins' },
    { time: '17:30', program: 'Straight From The Heart', host: 'Joe Focht' },
    { time: '18:00', program: 'Living In Christ', host: 'Bob Hoekstra' },
    { time: '18:15', program: 'Music', host: 'Various Artists' },
    { time: '18:30', program: 'Strength For Today', host: 'Pat Lazovich' },
    { time: '19:00', program: 'The Word For Today', host: 'Chuck Smith' },
    { time: '19:30', program: 'Radio Free Church', host: 'John Higgins' },
    { time: '20:00', program: 'GodSword', host: 'Ken Graves' },
    { time: '20:30', program: 'Changed By Love', host: 'Jim Keavney' },
    { time: '21:00', program: '66/40', host: 'Chuck Missler' },
    { time: '21:30', program: 'Living Waters', host: 'Steve Johnson' },
    { time: '22:00', program: 'Only By Grace', host: 'Doug Warwick' },
    // Overnight table picks up here (source's own "See Overnight Broadcast
    // Schedule" pointer at 10:30 PM is not a real program - dropped).
    { time: '22:30', program: 'All Who Are Thirsty', host: 'Jim Remington' },
    { time: '23:00', program: 'Love Worth Finding', host: 'Adrian Rogers' },
    { time: '23:30', program: 'Praise & Worship', host: '' },
    { time: '00:00', program: 'Thru The Bible', host: 'J. Vernon McGee' },
    { time: '00:30', program: 'Praise & Worship', host: '' },
    { time: '01:00', program: 'In Touch', host: 'Charles Stanley' },
    { time: '01:30', program: 'Praise & Worship', host: '' },
    { time: '02:00', program: 'Anchored Deep', host: 'Jeremy Higgins' },
    { time: '02:30', program: 'Praise & Worship', host: '' },
    { time: '03:00', program: 'Turning Point', host: 'David Jeremiah' },
    { time: '03:30', program: 'Praise & Worship', host: '' },
    { time: '04:00', program: 'A Chosen Generation', host: 'Derald Skinner' },
    { time: '04:30', program: 'Praise & Worship', host: '' },
    // Overnight table's own 5:00 AM row ("40 Days Thru The NT") duplicates
    // this array's first entry - dropped, the lookup wraps around on its own.
  ],
};
