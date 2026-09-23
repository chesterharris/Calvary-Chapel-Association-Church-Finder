// Hand-transcribed from KYYR "The Bridge of Hope" 97.9 FM's own published
// schedule page (https://www.calvaryyakima.com/radio-playlist, "Week Day
// AM" / "Week Day PM" / "Weekend AM" / "Weekend PM" sections) on
// 2026-09-23. Larry supplied the station's own site, its raw stream URL,
// and the WTTP FM... er, KYYR logo directly, and explicitly asked for this
// one to be built from the published schedule from the start rather than
// investigated as a live feed first - no now-playing endpoint was ever
// given or looked for.
//
// Stream: https://calvaryyakima.com's player embeds
// http://us9.streamingpulse.com:7107/xstream directly (same
// streamingpulse.com platform as Faith FM's streamUrl, different node) -
// confirmed genuinely live by loading the raw stream URL itself in a
// browser tab and reading its own <video> element's state directly
// (paused: false, readyState: 4/HAVE_ENOUGH_DATA, currentTime advancing).
//
// Time-of-day modeling: unlike every other publishedschedule station in
// this file, the source page doesn't label each row with AM/PM - instead
// it splits each day into two whole sections ("Week Day AM" / "Week Day
// PM", "Weekend AM" / "Weekend PM"), each running its own 12:00-to-~11:30
// range with no AM/PM marker on the individual times. Confirmed this
// means AM section = 12:00 AM (midnight) through 11:59 AM and PM section =
// 12:00 PM (noon) through 11:59 PM - not just assumed - by converting both
// sections to 24-hour time and checking the result is one continuous,
// strictly-increasing 24-hour cycle with no gap or overlap at the noon/
// midnight seams (verified script-side for both the weekday pair and the
// weekend pair).
//
// Like WJCX, the site publishes one combined "Weekend AM"/"Weekend PM"
// pair rather than separate Saturday and Sunday schedules - but UNLIKE
// WJCX, it isn't identical for both days: two slots explicitly read "Sat.
// Music / Sun. Live Service CCY" (9:30 AM) and "Sat. Music / Sun. Live
// Service" (6:00 PM). Modeled as two full SATURDAY_SCHEDULE/SUNDAY_SCHEDULE
// arrays (not a shared reference like WJCX) that are identical everywhere
// except those two slots: Saturday keeps "Music" there, Sunday becomes
// "Live Service" hosted by "Calvary Chapel Yakima" (CCY, per the AM slot's
// own text - the PM slot's text doesn't repeat "CCY" but is presumed the
// same live service continuing/repeating, not a different program).
//
// Two source-side items transcribed as literal renderings of an obvious
// typo/formatting slip rather than left as-is: the PM grid's "7:00
// Turning Point - David Jeremaih" is canonicalized to "David Jeremiah"
// (matches every other Turning Point credit on this same page, including
// the AM grid's own 1:00 entry and the weekend PM's 4:30 entry - "Jeremaih"
// reads as a simple letter transposition, not an intentional alternate
// spelling the way WJCX's "Bil Gallatin"/"Bil Galatin" needed care about).
// Casing on "Science Scripture and Salvation - ICR" also varies
// (weekend AM capitalizes "Salvation", weekend PM lowercases it) -
// canonicalized to the AM page's capitalized form throughout.
//
// Timezone: America/Los_Angeles (Yakima, WA - Pacific).

const WEEKDAY_SCHEDULE = [
  { time: '00:00', program: 'Hope', host: 'Jeff Esterline' },
  { time: '00:30', program: 'Truth for Life', host: 'Alistair Begg' },
  { time: '01:00', program: 'Turning Point', host: 'David Jeremiah' },
  { time: '01:30', program: 'The Word for Today', host: 'Chuck Smith' },
  { time: '02:00', program: 'Searchlight', host: 'Jon Courson' },
  { time: '02:30', program: 'Light on the Hill', host: 'James Kaddis' },
  { time: '03:00', program: 'Somebody Loves You', host: 'Raul Ries' },
  { time: '03:30', program: 'God Sword', host: 'Ken Graves' },
  { time: '04:00', program: 'Music', host: '' },
  { time: '05:30', program: 'Bridging the Gap', host: 'Lloyd Pulley' },
  { time: '06:00', program: 'According to the Scriptures', host: 'Damian Kyle' },
  { time: '06:30', program: 'Balanced Word', host: 'Dave Rolph' },
  { time: '07:00', program: 'Living in Christ', host: 'Bob Hoekstra' },
  { time: '07:30', program: 'The Word for Today', host: 'Chuck Smith' },
  { time: '08:00', program: 'Hope', host: 'Jeff Esterline' },
  { time: '08:30', program: 'Enduring Word', host: 'David Guzick' },
  { time: '09:00', program: 'Straight From the Heart', host: 'Joe Focht' },
  { time: '09:30', program: 'A Sure Foundation', host: 'David Rosales' },
  { time: '10:00', program: 'The Dwelling Place', host: 'Al Pitman' },
  { time: '10:30', program: 'Abounding Grace', host: 'Ed Taylor' },
  { time: '11:00', program: 'Walk in the Light', host: 'Bill Gallatin' },
  { time: '11:30', program: 'God Sword', host: 'Ken Graves' },
  { time: '12:00', program: 'Hope for Today', host: 'David Hocking' },
  { time: '12:30', program: 'Apply Within', host: 'Bob Davis' },
  { time: '13:00', program: 'Searchlight', host: 'Jon Courson' },
  { time: '13:30', program: 'Truth for Life', host: 'Alistair Begg' },
  { time: '14:00', program: 'The Word for Today', host: 'Chuck Smith' },
  { time: '14:30', program: 'Grace Upon Grace', host: 'Mark Martin' },
  { time: '15:00', program: 'Adventures in Odyssey', host: '' },
  { time: '15:30', program: 'Abide in Truth', host: 'Mike Hughes' },
  { time: '16:00', program: 'Sound Doctrine', host: 'Jeff Johnson' },
  { time: '16:30', program: 'Crosswalk', host: 'Steve Whinery' },
  { time: '17:00', program: 'Hope', host: 'Jeff Esterline' },
  { time: '17:30', program: 'Changed by Love', host: 'Jim Keavney' },
  { time: '18:00', program: 'Bridging the Gap', host: 'Lloyd Pulley' },
  { time: '18:30', program: 'Thru the Bible', host: 'J. Vernon McGee' },
  { time: '19:00', program: 'Turning Point', host: 'David Jeremiah' },
  { time: '19:30', program: 'Love Worth Finding', host: 'Adrian Rogers' },
  { time: '20:00', program: 'Cover to Cover', host: 'Dallas Sandoval' },
  { time: '20:30', program: 'The Word for Today (Spanish)', host: '' },
  { time: '21:00', program: 'Christian Hip Hop', host: '' },
];

const SATURDAY_SCHEDULE = [
  { time: '00:00', program: 'Hope', host: 'Jeff Esterline' },
  { time: '00:30', program: 'The Word for Today', host: 'Chuck Smith' },
  { time: '01:00', program: 'Music', host: '' },
  { time: '03:00', program: 'God Sword', host: 'Ken Graves' },
  { time: '04:00', program: 'Bridging the Gap', host: 'Lloyd Pulley' },
  { time: '04:30', program: 'Thru the Bible Q&A', host: 'J. Vernon McGee' },
  { time: '05:00', program: 'Music', host: '' },
  { time: '05:30', program: 'Search the Scriptures', host: 'Berean Call' },
  { time: '06:00', program: 'According to the Scriptures', host: 'Damian Kyle' },
  { time: '07:00', program: 'The Word for Today', host: 'Chuck Smith' },
  { time: '07:30', program: 'Truth for Life', host: 'Alistair Begg' },
  { time: '08:00', program: 'Church History', host: 'Lance Ralston' },
  { time: '08:30', program: 'Science Scripture and Salvation', host: 'ICR' },
  { time: '09:30', program: 'Music', host: '' },
  { time: '11:30', program: 'Voice of the Martyrs', host: '' },
  { time: '12:00', program: 'Love Worth Finding', host: 'Adrian Rogers' },
  { time: '13:00', program: 'Search the Scriptures', host: 'Berean Call' },
  { time: '14:00', program: 'Adventures in Odyssey', host: '' },
  { time: '15:00', program: 'Science Scripture and Salvation', host: 'ICR' },
  { time: '16:30', program: 'Turning Point', host: 'David Jeremiah' },
  { time: '17:00', program: 'Church History', host: 'Lance Ralston' },
  { time: '18:00', program: 'Music', host: '' },
  { time: '19:30', program: 'The Word for Today', host: 'Chuck Smith' },
  { time: '20:00', program: 'Thru the Bible Weekend', host: 'J. Vernon McGee' },
  { time: '21:00', program: 'Bridging the Gap', host: 'Lloyd Pulley' },
  { time: '21:30', program: 'God Sword', host: 'Ken Graves' },
  { time: '22:00', program: 'Search the Scriptures', host: 'Berean Call' },
  { time: '23:00', program: 'Voice of the Martyrs', host: '' },
];

const SUNDAY_SCHEDULE = [
  { time: '00:00', program: 'Hope', host: 'Jeff Esterline' },
  { time: '00:30', program: 'The Word for Today', host: 'Chuck Smith' },
  { time: '01:00', program: 'Music', host: '' },
  { time: '03:00', program: 'God Sword', host: 'Ken Graves' },
  { time: '04:00', program: 'Bridging the Gap', host: 'Lloyd Pulley' },
  { time: '04:30', program: 'Thru the Bible Q&A', host: 'J. Vernon McGee' },
  { time: '05:00', program: 'Music', host: '' },
  { time: '05:30', program: 'Search the Scriptures', host: 'Berean Call' },
  { time: '06:00', program: 'According to the Scriptures', host: 'Damian Kyle' },
  { time: '07:00', program: 'The Word for Today', host: 'Chuck Smith' },
  { time: '07:30', program: 'Truth for Life', host: 'Alistair Begg' },
  { time: '08:00', program: 'Church History', host: 'Lance Ralston' },
  { time: '08:30', program: 'Science Scripture and Salvation', host: 'ICR' },
  // Source: "Sat. Music / Sun. Live Service CCY" - Sunday's own half of
  // this combined slot, "CCY" = Calvary Chapel Yakima.
  { time: '09:30', program: 'Live Service', host: 'Calvary Chapel Yakima' },
  { time: '11:30', program: 'Voice of the Martyrs', host: '' },
  { time: '12:00', program: 'Love Worth Finding', host: 'Adrian Rogers' },
  { time: '13:00', program: 'Search the Scriptures', host: 'Berean Call' },
  { time: '14:00', program: 'Adventures in Odyssey', host: '' },
  { time: '15:00', program: 'Science Scripture and Salvation', host: 'ICR' },
  { time: '16:30', program: 'Turning Point', host: 'David Jeremiah' },
  { time: '17:00', program: 'Church History', host: 'Lance Ralston' },
  // Source: "Sat. Music / Sun. Live Service" - presumed the same Sunday
  // live service continuing/repeating, not a distinct second program.
  { time: '18:00', program: 'Live Service', host: 'Calvary Chapel Yakima' },
  { time: '19:30', program: 'The Word for Today', host: 'Chuck Smith' },
  { time: '20:00', program: 'Thru the Bible Weekend', host: 'J. Vernon McGee' },
  { time: '21:00', program: 'Bridging the Gap', host: 'Lloyd Pulley' },
  { time: '21:30', program: 'God Sword', host: 'Ken Graves' },
  { time: '22:00', program: 'Search the Scriptures', host: 'Berean Call' },
  { time: '23:00', program: 'Voice of the Martyrs', host: '' },
];

export const KYYR_SCHEDULE = {
  timezone: 'America/Los_Angeles',
  weekday: WEEKDAY_SCHEDULE,
  saturday: SATURDAY_SCHEDULE,
  sunday: SUNDAY_SCHEDULE,
};
