// Hand-transcribed from WJWD/WJCZ/WTZY's (Calvary Radio Network,
// jesuspeoplefm.com) published schedule tables on 2026-09-10.
// See radio-station-published-schedule-notes.md for the transcription format
// and the lookup algorithm this feeds. Two things below are judgment calls,
// not verbatim source data - both flagged to Larry for confirmation whenever
// he happens to be listening at those hours:
//
// 1) Sunday's own table lists nothing between 9:00 PM ("The Word For
//    Today") and 1:00 AM ("Thru The Bible") - a real 4-hour gap in the
//    source, not a transcription miss. Per Larry's call: show "The Word For
//    Today" for one hour (9-10pm), then an explicit "Unknown Programming"
//    placeholder for the rest of the gap, rather than incorrectly extending
//    a real program's credit for 4 hours.
//
// 2) Sunday's table also lists 1:00 AM/2:00 AM/3:00 AM entries (Thru The
//    Bible / The Cleansing Word / A Sure Foundation) that directly conflict
//    with the weekday grid's own Late Nights lineup for that same clock
//    window. Best read: this station's broadcast day runs 4:00 AM-3:59 AM
//    (every table here starts at 4:00 AM), so Sunday's table tail is really
//    what airs heading into Monday morning, overriding the generic Mon-Fri
//    lineup just for Monday. Modeled as a MON weekdayOverridesByDay entry
//    (same mechanism GraceFM uses for its Wednesday override) rather than
//    folded into Sunday's own array. This is a best guess, not confirmed -
//    Larry said to adjust later if he can verify it firsthand.
//
// Two source-side naming inconsistencies were also canonicalized here:
// "Mark Rekcowski" (weekday) vs "Mark Rekcowsky" (Saturday) - same host,
// same program ("Abiding Today") - kept the weekday spelling. And
// "J Vernon McGee" (Saturday) vs "J. Vernon Mcgee" (Sunday, twice) - both
// refer to the well-known "Thru The Bible" teacher, whose name is properly
// "J. Vernon McGee" - used that spelling throughout.
export const WJWD_SCHEDULE = {
  timezone: 'America/Chicago',

  weekday: [
    { time: '00:00', program: 'Day by Day', host: 'Phil Ballmaier' },
    { time: '01:00', program: 'The Word For Today', host: 'Chuck Smith' },
    { time: '02:00', program: 'Real Hope', host: 'Tom Worthington' },
    { time: '02:30', program: 'Cornerstone Connection', host: 'Gary Hamrick' },
    { time: '03:00', program: 'Real Life Radio', host: 'Jack Hibbs' },
    { time: '04:00', program: 'Second Chances', host: 'Roger Ulman' },
    { time: '05:00', program: 'True Direction', host: 'Paul Mowery' },
    { time: '05:30', program: 'The Upward Call', host: 'Jeff Solwold' },
    { time: '06:00', program: 'The Sustaining Word', host: 'Joe Guglielmo' },
    { time: '06:30', program: 'Chapter and Verse', host: 'Mike MacIntosh' },
    { time: '07:00', program: 'The Word Remains', host: 'George Small' },
    { time: '07:30', program: 'Real Life Radio', host: 'Jack Hibbs' },
    { time: '08:00', program: 'The Word For Today', host: 'Chuck Smith' },
    { time: '08:30', program: 'Grace and Truth', host: 'Andy Brendemihl' },
    { time: '09:00', program: 'Day by Day', host: 'Phil Ballmaier' },
    { time: '10:00', program: 'Battleground', host: 'Various' },
    { time: '11:00', program: 'ACLJ Live', host: 'Jay Sekulow' },
    { time: '11:30', program: 'Real Hope', host: 'Tom Worthington' },
    { time: '12:00', program: 'Second Chances', host: 'Roger Ulman' },
    { time: '13:00', program: 'Chapter and Verse', host: 'Mike MacIntosh' },
    { time: '14:00', program: 'Abiding Today', host: 'Mark Rekcowski' },
    { time: '15:00', program: 'The Dwelling Place', host: 'Jim Motshagen' },
    { time: '15:30', program: 'Living Hope Radio', host: 'Tony Ferguson' },
    { time: '16:00', program: 'Cornerstone Connection', host: 'Gary Hamrick' },
    { time: '16:30', program: 'True Direction', host: 'Paul Mowery' },
    { time: '17:00', program: 'M-W-F Biblical Insights', host: 'Various' },
    { time: '18:00', program: 'M-W-F Biblical Insights', host: 'Jeff Solwold' },
    { time: '19:00', program: 'Family Talk', host: 'James Dobson Institute' },
    { time: '20:00', program: 'The Word For Today', host: 'Chuck Smith' },
    { time: '21:00', program: 'Conference Speaker', host: 'Tue-Sat Various' },
    { time: '22:00', program: 'The Dwelling Place', host: 'Jim Motshagen' },
    { time: '23:00', program: 'Chapter and Verse', host: 'Mike MacIntosh' },
  ],

  weekdayOverridesByDay: {
    // See note (2) above - this is the tail of Sunday's own published table,
    // read as carrying into Monday morning under this station's 4am-4am
    // broadcast-day convention. Overrides the generic weekday Late Nights
    // lineup at 1am and 2am only; the weekday grid's 2:30am Cornerstone
    // Connection slot is left in place since Sunday's table has nothing at
    // that specific time.
    MON: [
      { time: '01:00', program: 'Thru The Bible', host: 'J. Vernon McGee' },
      { time: '02:00', program: 'The Cleansing Word', host: 'John Pennell' },
      { time: '03:00', program: 'A Sure Foundation', host: 'David Rosales' },
    ],
  },

  saturday: [
    { time: '00:00', program: 'The Upward Call', host: 'Jeff Solwold' },
    { time: '01:00', program: 'Thru The Bible', host: 'J. Vernon McGee' },
    { time: '02:00', program: 'The Word For Today', host: 'Chuck Smith' },
    { time: '04:00', program: 'Breaking Bread', host: 'Frank Peacock' },
    { time: '05:00', program: 'A Word For The Church', host: 'Scott Parker' },
    { time: '06:00', program: 'Abiding Today', host: 'Mark Rekcowski' },
    { time: '07:00', program: 'Saturday Morning Kids Show', host: '' },
    { time: '09:00', program: 'Wake Up America', host: 'Mike MacIntosh' },
    { time: '10:00', program: 'The Upward Call', host: 'Jeff Solwold' },
    { time: '11:00', program: 'Servant Quarters', host: 'Gayle Erwin' },
    { time: '12:00', program: 'The Word For Today', host: 'Chuck Smith' },
    { time: '12:30', program: 'We Would See Jesus', host: 'C C Old Bridge' },
    { time: '13:00', program: 'Breaking Bread', host: 'Frank Peacock' },
    { time: '14:00', program: 'The Cleansing Word', host: 'John Pennell' },
    { time: '15:00', program: 'A Sure Foundation', host: 'David Rosales' },
    { time: '16:00', program: 'A Word For The Church', host: 'Scott Parker' },
    { time: '17:00', program: 'Worship Life Radio', host: 'Holland Davis' },
    { time: '18:00', program: 'Real Life Radio', host: 'Jack Hibbs' },
    { time: '19:00', program: 'World News Briefing', host: 'Various' },
    { time: '20:00', program: 'Family Talk', host: 'James Dobson Institute' },
    { time: '21:00', program: 'Conference Speaker', host: 'Tue-Sat Various' },
  ],

  sunday: [
    { time: '04:00', program: 'A Word For The Church', host: 'Scott Parker' },
    { time: '05:00', program: 'Worship Life Today', host: 'Holland Davis' },
    { time: '06:00', program: 'Wakeup America', host: 'Mike MacIntosh' },
    { time: '07:00', program: 'The Upward Call', host: 'Jeff Solwold' },
    { time: '08:00', program: 'Horizon Fellowship Live', host: 'Phillip MacIntosh' },
    { time: '09:00', program: 'The Word For Today', host: 'Chuck Smith' },
    { time: '10:00', program: 'The Dwelling Place Live', host: 'Jim Motshagen' },
    { time: '12:00', program: 'Issues in Education', host: 'Bob Boyd' },
    { time: '12:35', program: 'Calvary San Clemente Live', host: 'Holland Davis' },
    { time: '14:00', program: 'Thru The Bible', host: 'J. Vernon McGee' },
    { time: '15:00', program: 'Calvary Chapel Chino Hills Live', host: 'Jack Hibbs' },
    { time: '17:00', program: 'Calvary Mission Outreach Live', host: 'Tom Worthington' },
    { time: '18:10', program: 'The Dwelling Place Live', host: 'Jim Motshagen' },
    { time: '20:00', program: 'Servant Quarters', host: 'Gayle Erwin' },
    { time: '21:00', program: 'The Word For Today', host: 'Chuck Smith' },
    // See note (1) above - real gap in the source, not a transcription miss.
    { time: '22:00', program: 'Unknown Programming', host: '' },
    // Sunday's own 1am/2am/3am tail is intentionally NOT listed here - see
    // note (2) above; it's modeled as the MON override instead.
  ],
};
