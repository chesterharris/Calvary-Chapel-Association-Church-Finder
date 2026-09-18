// Hand-transcribed from https://www.kgps.org/'s published weekly schedule
// (Wix rich-text page, raw source supplied directly by Larry) on 2026-09-18.
// See radio-station-published-schedule-notes.md for the transcription format,
// the lookup algorithm this feeds, and this station's own notes (including
// the seasonal Summer/Winter slot swap and the couple of judgment calls
// below). A manual re-check against the live page is scheduled for
// 2026-11-17 (60 days out).
//
// Fourth station on this provider. Two things below are judgment calls, not
// verbatim source data - flagged to Larry for confirmation whenever he
// happens to be listening at those hours:
//
// 1) The source page lists a genuine seasonal swap in the 3:00-4:31pm
//    weekday block: the same four programs air an hour earlier in "Summer"
//    than in "Winter" (e.g. Calvary Live airs at 3:00pm/Summer or
//    4:00pm/Winter; Grace Upon Grace takes whichever slot Calvary Live isn't
//    using). There's no seasonal concept in this schedule format (see the
//    notes doc - weekdayOverridesByDay is day-of-week only, deliberately not
//    a generalized mechanism), so this file just picks the Summer lineup
//    (accurate as of the September 2026 transcription date, since Arizona's
//    own clock doesn't shift but this simulcast's *source* apparently does)
//    and drops the Winter-tagged duplicates entirely. Needs a manual swap
//    back around when DST ends (first Sunday of November).
//
// 2) The weekday grid lists two different, unrelated programs at the exact
//    same 7:00pm slot with no other qualifier - "Movieguide" and "Answers in
//    Genesis - Ken Ham" - unlike the Summer/Winter pairs above, neither is
//    tagged, so there's no way to tell which one is a source-page error.
//    Kept "Answers in Genesis" (it already recurs elsewhere in this same
//    schedule at 1:00am, suggesting it's the real regular booking) and
//    dropped "Movieguide" as the likely duplicate/artifact. Worth confirming
//    firsthand.
//
// One transcription cleanup, not a judgment call: Saturday's own table lists
// "Grace Infusion - Mike Nimer" twice within two minutes of each other
// (6:00am and 6:02am) - the same kind of stray duplicate row KEWR's overnight/
// daytime table split produced. Kept the 6:02am instance (consistent with its
// position relative to the surrounding entries) and dropped the 6:00am one.
export const KGPS_SCHEDULE = {
  timezone: 'America/Phoenix',

  weekday: [
    { time: '00:00', program: 'Weather', host: '' },
    { time: '00:03', program: 'Straight From the Heart', host: 'Joe Focht' },
    { time: '00:30', program: 'A Sure Foundation', host: 'David Rosales' },
    { time: '01:00', program: 'Answers in Genesis', host: 'Ken Ham' },
    { time: '01:01', program: 'Horizon Radio', host: 'Mike MacIntosh' },
    { time: '01:30', program: 'The Word Made Plain', host: 'Tony Clark' },
    { time: '02:00', program: '66/40', host: 'Chuck Missler' },
    { time: '02:30', program: 'Come Drink the Water', host: 'Ben Garate' },
    { time: '03:00', program: 'According to Scripture', host: 'Damian Kyle' },
    { time: '03:30', program: 'Revive Our Hearts', host: 'Nancy Wolgemuth' },
    { time: '04:00', program: 'On the Level', host: 'Pancho Juarez' },
    { time: '04:30', program: 'Hope from the Word', host: 'Bill Luebkemann' },
    { time: '05:00', program: 'Washington Watch', host: 'Tony Perkins' },
    { time: '05:01', program: 'Study the Word', host: 'Thom Keller' },
    { time: '05:30', program: 'Step by Step', host: 'Jim Gallagher' },
    { time: '06:00', program: 'Wisdom for Women', host: 'Debbi Bryson' },
    { time: '06:02', program: 'Somebody Loves You', host: 'Raul Ries' },
    { time: '06:30', program: 'Jesus is Real', host: 'Daniel Fusco' },
    { time: '07:00', program: 'Real Radio', host: 'Jack Hibbs' },
    { time: '07:30', program: 'The Word for Today', host: 'Chuck Smith' },
    { time: '08:00', program: 'Weather', host: '' },
    { time: '08:03', program: 'Searchlight', host: 'Jon Courson' },
    { time: '08:30', program: 'A New Beginning', host: 'Greg Laurie' },
    { time: '09:00', program: 'Hope for Today', host: 'David Hocking' },
    { time: '09:30', program: 'The Word Made Plain', host: 'Tony Clark' },
    { time: '10:00', program: 'Living in Christ', host: 'Bob Hoekstra' },
    { time: '10:30', program: 'Enduring Word', host: 'David Guzik' },
    { time: '11:00', program: 'A Sure Foundation', host: 'David Rosales' },
    { time: '11:30', program: 'Bridging the Gap', host: 'Lloyd Pulley' },
    { time: '12:00', program: 'Weather', host: '' },
    { time: '12:03', program: 'Revive Our Hearts', host: 'Nancy Wolgemuth' },
    { time: '12:30', program: 'Grace Infusion', host: 'Mike Nimer' },
    { time: '13:00', program: 'Daily Light', host: 'Anne Graham Lotz' },
    { time: '13:01', program: '66/40', host: 'Chuck Missler' },
    { time: '13:30', program: 'Abounding Grace', host: 'Ed Taylor' },
    { time: '14:00', program: 'According to Scripture', host: 'Damian Kyle' },
    { time: '14:30', program: 'The Word for Today', host: 'Chuck Smith' },
    // See note (1) above - Summer lineup for this whole 3:00-4:31pm block.
    { time: '15:00', program: 'Calvary Live', host: '' },
    { time: '16:00', program: 'Grace Upon Grace', host: 'Mark Martin' },
    { time: '16:30', program: 'Washington Watch', host: 'Tony Perkins' },
    { time: '16:31', program: 'Light on the Hill', host: 'James Kaddis' },
    { time: '17:02', program: 'A New Beginning', host: 'Greg Laurie' },
    { time: '17:30', program: 'Searchlight', host: 'Jon Courson' },
    { time: '18:00', program: 'Weather', host: '' },
    { time: '18:03', program: 'Horizon Radio', host: 'Mike MacIntosh' },
    { time: '18:30', program: 'Boldly Speaking', host: 'Ron Dozler' },
    // See note (2) above - "Answers in Genesis" kept over "Movieguide".
    { time: '19:00', program: 'Answers in Genesis', host: 'Ken Ham' },
    { time: '19:01', program: 'On the Level', host: 'Pancho Juarez' },
    { time: '19:30', program: 'Straight From the Heart', host: 'Joe Focht' },
    { time: '20:00', program: 'In Your Faith', host: 'Joe Domico' },
    { time: '20:30', program: 'Cornerstone Connection', host: 'Gary Hamrick' },
    { time: '21:00', program: 'Back to Basics', host: 'Brian Brodersen' },
    { time: '21:30', program: 'Balanced Word', host: 'Dave Rolph' },
    { time: '22:00', program: 'Sandy Adams Radio', host: '' },
    { time: '22:30', program: 'GodSword', host: 'Ken Graves' },
    { time: '23:00', program: 'Light on the Hill', host: 'James Kaddis' },
    { time: '23:30', program: 'Hope from the Word', host: 'Bill Luebkemann' },
  ],

  // The source page carves out a Friday-night music block, replacing the
  // generic weekday GodSword/Hope from the Word slots for those two hours
  // only - same one-off mechanism GraceFM (Wednesday) and WJWD (Monday) use.
  weekdayOverridesByDay: {
    FRI: [
      { time: '22:30', program: "Christian Rock Music", host: '' },
      { time: '23:30', program: "Christian Rock Music", host: '' },
    ],
  },

  saturday: [
    { time: '00:02', program: 'Weather', host: '' },
    { time: '00:03', program: 'Christian Rock Music', host: '' },
    { time: '01:00', program: 'Science, Scripture & Salvation', host: 'ICR' },
    { time: '01:30', program: 'Unshackled', host: '' },
    { time: '03:00', program: 'According to Scripture', host: 'Damian Kyle' },
    { time: '03:30', program: 'Jesus Style', host: 'Gayle Erwin' },
    { time: '04:00', program: 'Washington Watch', host: 'Tony Perkins' },
    { time: '05:00', program: 'Somebody Loves You', host: 'Raul Ries' },
    { time: '06:00', program: 'Wisdom for Women', host: 'Debbi Bryson' },
    { time: '06:02', program: 'Grace Infusion', host: 'Mike Nimer' },
    { time: '06:30', program: 'We Would See Jesus', host: 'Karen Pulley' },
    { time: '07:00', program: 'Music', host: '' },
    { time: '08:00', program: 'Weather', host: '' },
    { time: '08:03', program: 'Lamplighter Theatre', host: '' },
    { time: '08:30', program: 'Rinse & Repeat', host: 'Carol Eskaros' },
    { time: '09:00', program: 'Science, Scripture & Salvation', host: 'ICR' },
    { time: '09:30', program: 'No Other Foundation', host: 'Phil McKay' },
    { time: '10:00', program: 'Thru the Bible', host: 'J. Vernon McGee' },
    { time: '11:00', program: 'According to Scripture', host: 'Damian Kyle' },
    { time: '11:30', program: 'Light on the Hill', host: 'James Kaddis' },
    { time: '12:00', program: 'Weather', host: '' },
    { time: '12:03', program: 'The Word for Today', host: 'Chuck Smith' },
    { time: '12:30', program: 'Abounding Grace', host: 'Ed Taylor' },
    { time: '13:30', program: 'Countdown 2 Eternity', host: '' },
    { time: '14:00', program: 'Truth for Life', host: 'Alistair Begg' },
    { time: '14:30', program: 'Voice of the Martyrs', host: '' },
    { time: '15:00', program: 'Real Radio', host: 'Jack Hibbs' },
    { time: '15:30', program: 'A New Beginning', host: 'Greg Laurie' },
    { time: '16:00', program: 'Walk in Truth', host: 'Michael Lantz' },
    { time: '17:30', program: 'The Word Made Plain', host: 'Tony Clark' },
    { time: '18:00', program: 'Weather', host: '' },
    { time: '18:03', program: "History's Greatest Sermons", host: '' },
    { time: '18:30', program: 'Study the Word', host: 'Thom Keller' },
    { time: '19:00', program: 'Pacific Justice Institute', host: '' },
    { time: '19:30', program: 'Washington Watch', host: 'Tony Perkins' },
    { time: '20:00', program: 'Lamplighter Theatre', host: '' },
    { time: '20:30', program: 'Balanced Word', host: 'Dave Rolph' },
    { time: '21:00', program: 'The Word for Today', host: 'Chuck Smith' },
    { time: '21:30', program: 'Jesus Style', host: 'Gayle Erwin' },
    { time: '22:00', program: 'Unshackled', host: '' },
    { time: '22:30', program: 'GodSword', host: 'Ken Graves' },
    { time: '23:00', program: 'Bridging the Gap', host: 'Lloyd Pulley' },
    { time: '23:30', program: 'Mission Compass', host: 'Galcom International' },
  ],

  sunday: [
    { time: '00:00', program: 'Weather', host: '' },
    { time: '00:03', program: 'Real Radio', host: 'Jack Hibbs' },
    { time: '00:30', program: 'Countdown 2 Eternity', host: '' },
    { time: '01:00', program: 'Truth for Life', host: 'Alistair Begg' },
    { time: '03:00', program: 'Thru the Bible', host: 'J. Vernon McGee' },
    { time: '04:30', program: 'Pacific Justice Institute', host: 'Brad Dacus' },
    { time: '05:00', program: 'Washington Watch', host: 'Tony Perkins' },
    { time: '05:30', program: "History's Greatest Sermons", host: '' },
    { time: '06:00', program: 'Hymns for Him', host: '' },
    { time: '07:00', program: 'Wisdom for Women', host: 'Debbi Bryson' },
    { time: '07:30', program: 'Somebody Loves You', host: 'Raul Ries' },
    { time: '08:00', program: 'Weather', host: '' },
    { time: '08:03', program: 'The Word for Today', host: 'Chuck Smith' },
    { time: '09:00', program: 'Study the Word', host: 'Thom Keller' },
    { time: '09:30', program: 'A New Beginning', host: 'Greg Laurie' },
    { time: '10:00', program: 'Jesus Style', host: 'Gayle Erwin' },
    { time: '10:30', program: 'Balanced Word', host: 'Dave Rolph' },
    // Local live service, not a syndicated program - the station's own
    // sponsoring church.
    { time: '11:00', program: 'Calvary Chapel of Kingman (pre-recorded)', host: '' },
    { time: '12:00', program: 'Weather', host: '' },
    { time: '12:30', program: 'Mission Compass', host: 'Galcom International' },
    { time: '13:00', program: 'Bridging the Gap', host: 'Lloyd Pulley' },
    { time: '13:30', program: 'We Would See Jesus', host: 'Karen Pulley' },
    { time: '14:00', program: 'Music', host: '' },
    { time: '15:00', program: 'Unshackled', host: 'Pacific Garden Mission' },
    { time: '15:30', program: 'According to Scripture', host: 'Damian Kyle' },
    { time: '16:00', program: 'Walk in Truth', host: 'Michael Lantz' },
    { time: '16:30', program: 'GodSword', host: 'Ken Graves' },
    { time: '17:02', program: 'Light on the Hill', host: 'James Kaddis' },
    { time: '17:30', program: 'The Word Made Plain', host: 'Tony Clark' },
    { time: '18:00', program: 'Weather', host: '' },
    { time: '18:03', program: 'Boldly Speaking', host: 'Ron Dozler' },
    { time: '18:30', program: 'Abounding Grace', host: 'Ed Taylor' },
    { time: '19:00', program: 'Bringing You Back (Jesus Music)', host: '' },
    { time: '21:00', program: 'Rinse & Repeat', host: 'Carol Eskaros' },
    { time: '22:00', program: 'Countdown 2 Eternity', host: '' },
    { time: '23:00', program: 'Lamplighter Theatre', host: '' },
  ],
};
