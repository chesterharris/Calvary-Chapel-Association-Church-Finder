// Hand-transcribed from https://www.gracefm.com/schedule on 2026-09-10.
// See radio-station-published-schedule-notes.md for the transcription format,
// the lookup algorithm this feeds, and the one genuine naming inconsistency
// resolved below (Saturday's 7:00AM/1:00PM slot is listed on GraceFM's own
// page as both "Lead To Serve Podcast" and "Lead To Serve" - same host, same
// two times, clearly one program - canonicalized here to the fuller name).
//
// A manual re-check against the live page is scheduled for 2026-11-09 (60
// days out) - see that doc for what to compare against if anything's changed.
export const GRACEFM_SCHEDULE = {
  timezone: 'America/Denver',

  saturday: [
    { time: '00:00', program: 'Music', host: '' },
    { time: '07:00', program: 'Lead To Serve Podcast', host: 'Pastor Ed Taylor' },
    { time: '07:30', program: 'Music', host: '' },
    { time: '13:00', program: 'Lead To Serve Podcast', host: 'Pastor Ed Taylor' },
    { time: '13:30', program: 'Music', host: '' },
    { time: '18:00', program: 'Calvary Church Live Weekend Service', host: '' },
    { time: '19:30', program: 'Music', host: '' },
  ],

  sunday: [
    { time: '00:00', program: 'Music', host: '' },
    { time: '05:00', program: 'Somebody Loves You', host: 'Pastor Raul Ries' },
    { time: '05:30', program: 'Radical Living', host: 'Pastor Fernando Ortiz' },
    { time: '06:00', program: 'Simple Truth', host: 'Pastor Eric Cartier' },
    { time: '06:30', program: 'Dwelling Place', host: 'Pastor Al Pittman' },
    { time: '07:00', program: 'Abounding Grace', host: 'Pastor Ed Taylor' },
    { time: '07:30', program: 'A New Beginning', host: 'Pastor Greg Laurie' },
    { time: '08:00', program: 'Calvary Church Live Weekend Service', host: '' },
    { time: '09:15', program: 'Music', host: '' },
    { time: '09:45', program: 'Calvary Church Live Weekend Service', host: '' },
    { time: '11:15', program: 'Music', host: '' },
    { time: '11:45', program: 'Calvary Church Live Weekend Service', host: '' },
    { time: '13:15', program: 'Music', host: '' },
    { time: '13:30', program: 'Be Set Free', host: 'Pastor Nick Cady' },
    { time: '14:00', program: 'Come To The Table', host: 'Pastor Mark Kirk' },
    { time: '14:30', program: 'Life Light', host: 'Pastor Matt Korniotes' },
    { time: '15:00', program: 'Searchlight', host: 'Pastor Jon Courson' },
    { time: '15:30', program: 'Step By Step', host: 'Pastor Jim Gallagher' },
    { time: '16:00', program: 'Inside The Epicenter', host: 'Joel Rosenberg' },
    { time: '16:30', program: 'Abounding Grace', host: 'Pastor Ed Taylor' },
    { time: '17:00', program: 'Live The Word', host: 'Pastor Eric Souza' },
    { time: '17:30', program: 'Under The Fig Tree', host: 'Pastor Jeff Figgs' },
    { time: '18:00', program: 'The Word For Today', host: 'Pastor Chuck Smith' },
    { time: '18:30', program: 'According To The Scriptures', host: 'Pastor Damian Kyle' },
    { time: '19:00', program: 'A Time For Courage', host: 'Pastor John Nunnally' },
    { time: '19:30', program: 'Strengthened By Grace', host: 'Pastor Dominic Dinger' },
    { time: '19:45', program: 'Music', host: '' },
    { time: '20:00', program: 'Study The Word', host: 'Pastor Thom Keller' },
    { time: '20:30', program: 'Living The Word', host: 'Pastor Richard Perea' },
    { time: '21:00', program: 'Glad News', host: 'Pastor Samy Tanagho' },
    { time: '21:30', program: 'Changed By Love', host: 'Pastor Jim Keavney' },
    { time: '22:00', program: 'Truth For Life Weekend', host: 'Pastor Alistair Begg' },
    { time: '22:30', program: 'Love Worth Finding', host: 'Pastor Adrian Rogers' },
    { time: '23:00', program: 'Enduring Word', host: 'Pastor David Guzik' },
    { time: '23:30', program: 'Sound Doctrine', host: 'Pastor Jeff Johnson' },
  ],

  // The single Mon-Fri lineup that repeats identically all five days,
  // except where weekdayOverridesByDay below carves out one specific day.
  weekday: [
    { time: '00:00', program: 'Somebody Loves You', host: 'Pastor Raul Ries' },
    { time: '00:30', program: 'Abounding Grace', host: 'Pastor Ed Taylor' },
    { time: '01:00', program: 'Back To Basics', host: 'Pastor Brian Brodersen' },
    { time: '01:30', program: 'Refuge Radio', host: 'Pastor Bill Welsh' },
    { time: '02:00', program: 'The Word Made Plain', host: 'Pastor Tony Clark' },
    { time: '02:30', program: 'According To The Scriptures', host: 'Pastor Damian Kyle' },
    { time: '03:00', program: 'Searchlight', host: 'Pastor Jon Courson' },
    { time: '03:30', program: 'Jesus Is Real', host: 'Pastor Daniel Fusco' },
    { time: '04:00', program: 'Step By Step', host: 'Pastor Jim Gallagher' },
    { time: '04:30', program: 'Come Drink The Water', host: 'Pastor Ben Garate' },
    { time: '05:00', program: 'Practical Christian Living', host: 'Pastor Robert Furrow' },
    { time: '05:30', program: 'The Word Remains', host: 'Pastor George Small' },
    { time: '06:00', program: 'Simple Truth', host: 'Pastor Eric Cartier' },
    { time: '06:30', program: 'Real Life Radio', host: 'Pastor Jack Hibbs' },
    { time: '07:00', program: 'Dwelling Place', host: 'Pastor Al Pittman' },
    { time: '07:30', program: 'Abounding Grace', host: 'Pastor Ed Taylor' },
    { time: '08:00', program: 'A New Beginning', host: 'Pastor Greg Laurie' },
    { time: '08:30', program: 'Under The Fig Tree', host: 'Pastor Jeff Figgs' },
    { time: '09:00', program: 'Grace Walk', host: 'Pastor Louie Cruzado' },
    { time: '09:30', program: 'Be Set Free', host: 'Pastor Nick Cady' },
    { time: '10:00', program: 'Radical Living', host: 'Pastor Fernando Ortiz' },
    { time: '10:30', program: 'No Greater Love', host: 'Pastor Jeff Cramer' },
    { time: '11:00', program: 'Connect With Skip Heitzig', host: 'Pastor Skip Heitzig' },
    { time: '11:30', program: 'Abounding Grace', host: 'Pastor Ed Taylor' },
    { time: '12:00', program: 'Somebody Loves You', host: 'Pastor Raul Ries' },
    { time: '12:30', program: 'The Word For Today', host: 'Pastor Chuck Smith' },
    { time: '13:00', program: 'A Time For Courage', host: 'Pastor John Nunnally' },
    { time: '13:30', program: 'Step By Step', host: 'Pastor Jim Gallagher' },
    { time: '14:00', program: 'Overflow', host: 'Pastor Dave Pierce' },
    { time: '14:30', program: 'Be Set Free', host: 'Pastor Nick Cady' },
    { time: '15:00', program: 'Simple Truth', host: 'Pastor Eric Cartier' },
    { time: '15:30', program: 'Under The Fig Tree', host: 'Pastor Jeff Figgs' },
    { time: '16:00', program: 'Calvary Live', host: 'Various Pastors' },
    { time: '17:00', program: 'Abounding Grace', host: 'Pastor Ed Taylor' },
    { time: '17:30', program: 'Love Worth Finding', host: 'Pastor Adrian Rogers' },
    { time: '18:00', program: 'Truth For Life', host: 'Pastor Alistair Begg' },
    { time: '18:30', program: 'Sound Doctrine', host: 'Pastor Jeff Johnson' },
    { time: '19:00', program: 'A New Beginning', host: 'Pastor Greg Laurie' },
    { time: '19:30', program: 'The Implanted Word', host: 'Pastor Bill Gehm' },
    { time: '20:00', program: 'Enduring Word', host: 'Pastor David Guzik' },
    { time: '20:30', program: 'Live The Word', host: 'Pastor Eric Souza' },
    { time: '21:00', program: 'Changed By Love', host: 'Pastor Jim Keavney' },
    { time: '21:30', program: 'Hope From The Word', host: 'Pastor Bill Luebkemann' },
    { time: '22:00', program: 'Grace Upon Grace', host: 'Pastor Mark Martin' },
    { time: '22:30', program: 'Apply The Word', host: 'Pastor Ty Orr' },
    { time: '23:00', program: 'As We Gather', host: 'Pastor Bill Stonebraker' },
    { time: '23:30', program: 'A Transforming Word', host: 'Pastor Bill Buffington' },
  ],

  // One-off, not a general mechanism: GraceFM's own page lists this single
  // slot as Wednesday-only, overriding the generic 7:00 PM weekday entry
  // (A New Beginning) just for that one day of the week.
  weekdayOverridesByDay: {
    WED: [
      { time: '19:00', program: 'Calvary Church Live Midweek Service', host: 'Pastor Ed Taylor' },
    ],
  }
};
