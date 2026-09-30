// Hand-transcribed from WHLP's (Calvary Radio Network, jesuspeoplefm.com)
// own published schedule table on 2026-10-01.
// See radio-station-published-schedule-notes.md for the transcription format
// and the lookup algorithm this feeds, and src/radioSchedules/wjwd.js for the
// sibling station on this same network/site.
//
// IMPORTANT CONTEXT: this site hosts three separate simulcast-group schedule
// pages under one nav menu - WHLP; WQKO/WOJC/WJCO/WJCI/WJCY; and
// WJWD/WJCZ/WTZY (see radio-station-published-schedule-notes.md, WJWD's own
// section). Only the WJWD group's page was transcribed back on 2026-09-10;
// WHLP itself was left un-added at the time, just noted as existing on the
// same site. Revisited 2026-10-01 after Larry reported hearing genuinely
// different audio on WJWD (phone) vs WHLP (laptop) at the same moment,
// which prompted a direct side-by-side check of the two stations' own
// published schedule pages rather than assuming WJWD's schedule could
// stand in for WHLP's.
//
// That comparison confirmed WHLP has its own genuinely distinct page (not a
// copy-paste duplicate of WJWD's), but the two are overwhelmingly identical
// in content - same national syndicated programs at the same times across
// nearly the entire week. Only three real weekday differences turned up:
//   - WJWD lists an 8:30 AM "Grace and Truth" (Andy Brendemihl) slot; WHLP's
//     page has no entry there at all (8:00 AM's "The Word For Today" runs
//     straight through to 9:00 AM "Day by Day" on WHLP's table).
//   - WJWD's 3:00 PM slot is "The Dwelling Place" (Jim Motshagen); WHLP's is
//     "The Upward Call" (Jeff Solwold) instead.
//   - WJWD lists a second "M-W-F Biblical Insights" airing at 6:00 PM; WHLP's
//     page has no entry there (5:00 PM's airing runs through to 7:00 PM
//     "Family Talk").
// Saturday and Sunday are fully identical between the two pages, including
// Sunday's own real 4-hour late-night gap and its 1/2/3 AM tail that
// conflicts with the weekday grid - both handled here exactly the way
// WJWD's file already does (see its own header comment for the reasoning):
// an explicit "Unknown Programming" placeholder for the gap, and the tail
// modeled as a Monday-only weekdayOverridesByDay entry under this station's
// same 4am-4am broadcast-day convention (every table on this site starts at
// 4:00 AM).
//
// None of this rules out the published schedule being imprecise in its own
// right (pre-emptions, local insertions, or syndication-feed differences
// that wouldn't show up on a static schedule board) - if what Larry hears on
// WHLP keeps disagreeing with this table at a specific time, that's worth
// another look rather than assuming the transcription itself is wrong.
//
// Station is licensed to Hanna, IN (LaPorte County) - Central time, same
// zone as WJWD's Marshall, WI - confirmed via this network's own /stations/
// listing page rather than assumed from the city name alone.
export const WHLP_SCHEDULE = {
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
    // No 8:30 AM entry on WHLP's own page (WJWD's has "Grace and Truth" here) -
    // see header comment. The Word For Today simply runs through to 9:00.
    { time: '09:00', program: 'Day by Day', host: 'Phil Ballmaier' },
    { time: '10:00', program: 'Battleground', host: 'Various' },
    { time: '11:00', program: 'ACLJ Live', host: 'Jay Sekulow' },
    { time: '11:30', program: 'Real Hope', host: 'Tom Worthington' },
    { time: '12:00', program: 'Second Chances', host: 'Roger Ulman' },
    { time: '13:00', program: 'Chapter and Verse', host: 'Mike MacIntosh' },
    { time: '14:00', program: 'Abiding Today', host: 'Mark Rekcowski' },
    // Differs from WJWD here: WJWD's 3:00 PM is "The Dwelling Place" - see
    // header comment.
    { time: '15:00', program: 'The Upward Call', host: 'Jeff Solwold' },
    { time: '15:30', program: 'Living Hope Radio', host: 'Tony Ferguson' },
    { time: '16:00', program: 'Cornerstone Connection', host: 'Gary Hamrick' },
    { time: '16:30', program: 'True Direction', host: 'Paul Mowery' },
    { time: '17:00', program: 'M-W-F Biblical Insights', host: 'Various' },
    // No second (6:00 PM) Biblical Insights airing on WHLP's page, unlike
    // WJWD - see header comment. Runs through to 7:00 PM Family Talk.
    { time: '19:00', program: 'Family Talk', host: 'James Dobson Institute' },
    { time: '20:00', program: 'The Word For Today', host: 'Chuck Smith' },
    { time: '21:00', program: 'Conference Speaker', host: 'Tue-Sat Various' },
    { time: '22:00', program: 'The Dwelling Place', host: 'Jim Motshagen' },
    { time: '23:00', program: 'Chapter and Verse', host: 'Mike MacIntosh' },
  ],

  weekdayOverridesByDay: {
    // Same reasoning as WJWD's own MON override (see wjwd.js) - WHLP's
    // Sunday table tail is identical to WJWD's, so it gets the same
    // "really carries into Monday morning under the 4am-4am broadcast day"
    // reading, overriding the weekday grid's 1am/2am Late Nights lineup only
    // (2:30am Cornerstone Connection is left in place, same as WJWD).
    MON: [
      { time: '01:00', program: 'Thru The Bible', host: 'J. Vernon McGee' },
      { time: '02:00', program: 'The Cleansing Word', host: 'John Pennell' },
      { time: '03:00', program: 'A Sure Foundation', host: 'David Rosales' },
    ],
  },

  // Identical to WJWD's own Saturday table - no differences found.
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

  // Identical to WJWD's own Sunday table (including the real 4-hour gap and
  // the 1/2/3 AM tail handled as a MON override above) - no differences
  // found.
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
    // Real gap in the source, not a transcription miss - see header comment.
    { time: '22:00', program: 'Unknown Programming', host: '' },
    // Sunday's own 1am/2am/3am tail is intentionally NOT listed here - it's
    // modeled as the MON override above instead (same as WJWD).
  ],
};
