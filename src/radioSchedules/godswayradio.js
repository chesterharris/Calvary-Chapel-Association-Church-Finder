// Hand-transcribed from https://www.godswayradio.com/'s published weekly
// schedule (three separate Wix rich-text pages - Weekdays, Saturday, and
// Sunday - raw source supplied directly by Larry) on 2026-09-18. See
// radio-station-published-schedule-notes.md for the transcription format,
// the lookup algorithm this feeds, and this station's own notes. A manual
// re-check against the live pages is scheduled for 2026-11-17 (60 days out).
//
// Fifth station on this provider. No scheduling conflicts or seasonal splits
// here (unlike KGPS) - just a handful of small spelling/casing
// inconsistencies between the three source pages, normalized to the
// majority/most-likely-correct spelling and noted here rather than in three
// separate places:
//
// - "According To The Scriptures" - the Saturday page alone spells its host
//   "Damien Kyle"; Weekdays and Sunday both agree on "Damian Kyle" (also the
//   spelling already used for this same person on KEWR and KGPS), so
//   Saturday's entry was corrected to match.
// - "Glad News For Muslims" - the Saturday page spells its host "Sammy
//   Tanagho"; Sunday spells it "Samy Tanagho", which matches the host's
//   actual name (founder of the Glad News for Muslims ministry), so
//   Saturday's entry was corrected to match.
// - "Voice Of The Martyrs" - Saturday's page spells the host "Voice Of The
//   Martyrs Ministires" (transposed letters); corrected to "Voice Of The
//   Martyrs Ministries" per Sunday's page.
// - "Friends And Family Interviews" - Sunday's page uses lowercase "and";
//   capitalized to match Saturday's title-case rendering.
// - "GodSword" - rendered inconsistently across all three pages (Weekdays:
//   "Godsword", Saturday: both "GodSword" and "godsword", Sunday:
//   "GodSword"); standardized to "GodSword" throughout.
// - Two Weekday slots ("LIVE For Jesus" at 7:00am and "Refresh | LIVE" at
//   3:30pm) have no listed host on the source page - the markup has a bare
//   zero-width-space character where the host name usually is - so both are
//   transcribed with an empty host string rather than a guessed name.
export const GODSWAYRADIO_SCHEDULE = {
  timezone: 'America/New_York',

  weekday: [
    { time: '00:00', program: 'Music', host: 'Various Artists' },
    { time: '00:30', program: 'A Loving Word', host: 'Razz Vazquez' },
    { time: '01:30', program: 'Bridging The Gap', host: 'Lloyd Pulley' },
    { time: '02:00', program: 'Bodly Speaking', host: 'Ron Dozler' },
    { time: '02:30', program: 'Ring Of Truth', host: 'Daniel Sexton' },
    { time: '03:00', program: 'A Daily Walk', host: 'John Randall' },
    { time: '03:30', program: 'Walk In The Light', host: 'Bill Gallatin' },
    { time: '04:00', program: 'Sound Doctrine', host: 'Jeff Johnson' },
    { time: '04:30', program: 'GodSword', host: 'Ken Graves' },
    { time: '05:00', program: 'Chapter And Verse', host: 'Mike Macintosh' },
    { time: '05:30', program: 'Sound Truth', host: 'Malcom Wilde' },
    { time: '06:00', program: 'Enduring Word', host: 'David Guzik' },
    { time: '06:30', program: 'Straight From The Heart', host: 'Joe Focht' },
    { time: '07:00', program: 'LIVE For Jesus', host: '' },
    { time: '08:00', program: 'A Loving Word', host: 'Razz Vazquez' },
    { time: '08:30', program: 'Sword And Spirit', host: 'Zak Vazquez' },
    { time: '09:00', program: 'The Word For Today', host: 'Chuck Smith' },
    { time: '09:30', program: 'Music', host: 'Various Artists' },
    { time: '10:00', program: 'Connect Radio', host: 'Skip Heitzig' },
    { time: '10:30', program: 'Faith And Finance', host: 'Rob West' },
    { time: '11:00', program: 'The Emmaus Exposition', host: 'Travis Carey' },
    { time: '11:30', program: 'Step By Step', host: 'Jim Gallagher' },
    { time: '12:00', program: 'Enduring Word', host: 'David Guzik' },
    { time: '12:30', program: 'Music', host: 'Various Artists' },
    { time: '13:00', program: 'Sandy Adams Radio', host: 'Sandy Adams' },
    { time: '13:30', program: 'Bridging The Gap', host: 'Lloyd Pulley' },
    { time: '14:00', program: 'A Daily Walk', host: 'John Randall' },
    { time: '14:30', program: 'A Sure Foundation', host: 'David Rosales' },
    { time: '15:00', program: 'The Word For Today', host: 'Chuck Smith' },
    { time: '15:30', program: 'Refresh | LIVE', host: '' },
    { time: '16:30', program: 'Straight From The Heart', host: 'Joe Focht' },
    { time: '17:00', program: 'Chapter And Verse', host: 'Mike Macintosh' },
    { time: '17:30', program: 'A Loving Word', host: 'Razz Vazquez' },
    { time: '18:00', program: 'Sword And Spirit', host: 'Zak Vazquez' },
    { time: '18:30', program: 'Dwelling Place', host: 'Al Pittman' },
    { time: '19:00', program: 'Revival Radio', host: 'John Miller' },
    { time: '19:30', program: 'Adventures In Odessey', host: 'Focus On The Family' },
    { time: '20:00', program: 'The Faithful Word', host: 'Bob Hargraves' },
    { time: '20:30', program: 'Time In The Word', host: 'Troy Warner' },
    { time: '21:00', program: 'GodSword', host: 'Ken Graves' },
    { time: '21:30', program: 'According To The Scriptures', host: 'Damian Kyle' },
    { time: '22:00', program: 'Truth For Life', host: 'Alistair Begg' },
    { time: '22:30', program: 'Simple Truths', host: 'Xavier Ries' },
    { time: '23:00', program: 'Live In The Light', host: 'Mike McClure' },
    { time: '23:30', program: 'Learn The Word', host: 'Doug McClean' },
  ],

  saturday: [
    { time: '00:00', program: 'Music', host: 'Various Artists' },
    { time: '09:00', program: 'Adventures In Odyssey Weekend', host: 'Focus On The Family' },
    { time: '10:00', program: 'Threads Of Grace', host: 'Woven - CCM' },
    { time: '11:00', program: 'Servant Quarters', host: 'Gayle Erwin' },
    { time: '11:30', program: 'The Word For Today', host: 'Chuck Smith' },
    { time: '12:00', program: 'GodSword', host: 'Ken Graves' },
    { time: '12:30', program: 'Voice Of The Martyrs', host: 'Voice Of The Martyrs Ministries' },
    { time: '13:00', program: 'Friends And Family Interviews', host: '' },
    { time: '14:00', program: 'Bridging The Gap', host: 'Lloyd Pulley' },
    { time: '14:30', program: 'Faith And Finance', host: 'Rob West' },
    { time: '15:00', program: 'License To Parent', host: 'Trace Embry' },
    { time: '15:30', program: 'A Daily Walk', host: 'John Randall' },
    { time: '16:00', program: 'The Emmaus Exposition', host: 'Travis Carey' },
    { time: '17:00', program: 'According To The Scriptures', host: 'Damian Kyle' },
    { time: '17:30', program: 'Science Scripture and Salvation Daily', host: 'ICR' },
    { time: '19:00', program: 'Glad News For Muslims', host: 'Samy Tanagho' },
    { time: '19:30', program: 'The Storyteller', host: 'Without Reservation' },
  ],

  sunday: [
    { time: '00:00', program: 'Music', host: 'Various Artists' },
    { time: '11:00', program: 'Calvary Chapel Miami Sunday Service | LIVE', host: 'Calvary Chapel Miami' },
    { time: '14:00', program: 'The Emmaus Exposition', host: 'Travis Carey' },
    { time: '15:00', program: 'The Word For Today', host: 'Chuck Smith' },
    { time: '15:30', program: 'A Daily Walk', host: 'John Randall' },
    { time: '16:00', program: 'According To The Scriptures', host: 'Damian Kyle' },
    { time: '16:30', program: 'GodSword', host: 'Ken Graves' },
    { time: '17:00', program: 'Bridging The Gap', host: 'Lloyd Pulley' },
    { time: '17:30', program: 'Voice Of The Martyrs', host: 'Voice Of The Martyrs Ministries' },
    { time: '18:00', program: 'Faith And Finance', host: 'Rob West' },
    { time: '18:30', program: 'License To Parent', host: 'Trace Embry' },
    { time: '19:00', program: 'Friends And Family Interviews', host: '' },
    { time: '20:00', program: 'Glad News For Muslims', host: 'Samy Tanagho' },
    { time: '20:30', program: 'The Storyteller', host: 'Without Reservation' },
    { time: '21:00', program: 'Servant Quarters', host: 'Gayle Erwin' },
    { time: '21:30', program: 'Institute For Creation Research', host: 'ICR' },
  ],
};
