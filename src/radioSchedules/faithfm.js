// Hand-transcribed from Faith FM's own schedule pages (Hamptons Christian
// Fellowship, Eastern Long Island, NY) - 2026-09-22:
// https://hamptonschristian.com/faithfm/faith-fm-weekly-program-schedule-m-f-2/,
// /faith-fm-saturday-program-schedule/, /faith-fm-sunday-program-schedule/.
//
// Larry supplied the player's page source (streamdb-style aio-radio player
// at https://us7.maindigitalstream.com/2754/) rather than a prior
// investigation write-up - this station has never been looked at before,
// so there's no removal history to reconcile, unlike the last several
// additions. The player's own config endpoint
// (`?c=all&t=sp-future`) resolves to a single real stream, no quality
// choice to make: `https://us2.streamingpulse.com/ssl/7176` - confirmed
// actually playing by inspecting the page's live <audio> element
// (`paused: false`, `readyState: 4`, matching `currentSrc`). The
// player's now-playing polling call (`?c=Faith%20FM&_=<timestamp>`)
// returns nothing but a bare `{"cache-time":14}` heartbeat - no title/
// artist field at all - so this goes straight to the published schedule
// instead, same dead-metadata pattern as every other publishedschedule
// station here.
//
// Source is plain HTML text (three parallel Time/Program/Host columns as
// sibling <p> lists, not a single combined table), and needed careful
// positional re-alignment rather than a straight top-to-bottom read:
//
// 1) **The weekday grid has three slots (10:00 AM, 11:00 AM, 3:00 PM)
//    that expand into six rows each** - the slot's own bare time entry
//    (paired with a literal "Various Programs" / "Various Hosts"
//    placeholder, confirmed by screenshot to be a real row of its own,
//    not a section heading) followed by five real "Monday:"/"Tuesday:"/
//    etc. rows with the actual per-day programming. Modeled as the
//    existing weekdayOverridesByDay mechanism (see
//    radio-station-published-schedule-notes.md's "Transcription format",
//    used previously for GraceFM's single Wednesday override) - here
//    used for all five weekday codes at once, since all five actually
//    differ from each other. The "Various Programs" placeholder never
//    actually surfaces on any real day once all five overrides are
//    present, but it's kept as the base `weekday` entry anyway since it's
//    literally what the source page shows as that slot's own row.
// 2) **The Saturday page's Host column is missing one row** relative to
//    its own Time/Program columns (34 rows in each of those, only 33
//    hosts) - not a copy error here, confirmed by counting the raw HTML
//    <p> tags directly. Resolved by cross-checking which pairing makes
//    every other row's program/host match already-established patterns
//    from the weekday and Sunday pages (e.g. "A New Beginning" is always
//    Greg Laurie, "Inside the Epicenter" is always Joel Rosenberg, "Haven
//    Today" is always David Wollen) - the one row left with no host after
//    that reconciliation is 6:00 PM's "Jesus In Our Time", transcribed
//    with an empty host rather than guessed.
//
// A few source-side oddities transcribed literally, not corrected, since
// there's no prior investigation to compare against and nothing here
// reads as an obvious typo: 3:30 AM's host field on the weekday page
// literally repeats "Truth with Grace" (the program's own name) instead
// of a person; "6640" appears twice as a program name (1:30 PM and 11:00
// PM), both times paired with Chuck Missler, consistently enough that
// it's kept as transcribed rather than assumed to be a scraping error;
// Saturday's "Christian Music Mix" pairs with host "Eugene McGee" even
// though every other "Christian Music Mix" slot elsewhere on this station
// pairs with "Various Artists" - kept as the page states it since it's
// only Saturday's own data being inconsistent with itself, not obviously
// wrong.
//
// Every day verified by script to have zero duplicate start times and to
// sum to exactly 1440 minutes - for the weekday grid, this was checked
// five separate times, once per fully-resolved Monday..Friday combination
// (base entries merged with that day's overrides), not just against the
// placeholder base array.
//
// Timezone: America/New_York (Eastern Long Island, NY).
//
// Logo: staticCoverUrl '/faithfm-icon.png' / staticCoverThumbUrl
// '/faithfm-icon-128.png' - Larry's "Faith FM" lighthouse badge. Source
// image (324x259) was a rectangular mark on a plain white background, not
// a pre-finished circular badge like the last few stations' logos - given
// the usual border-connected white-flood-fill treatment (KFLK/KKJC
// precedent), then padded onto a transparent square canvas before the
// 512x512 / 128x128 resize, same reasoning as those two (the source
// wasn't square, and resizing directly would have squashed the mark).

const WEEKDAY_SCHEDULE = [
  { time: '00:00', program: 'Midnight Worship Mix', host: 'Various Artists' },
  { time: '01:00', program: 'A New Beginning', host: 'Greg Laurie' },
  { time: '01:30', program: 'Jesus In Our Time', host: 'Douglas Kinney' },
  { time: '02:00', program: 'Abounding Grace', host: 'Ed Taylor' },
  { time: '02:30', program: 'Bridging the Gap', host: 'Lloyd Pulley' },
  { time: '03:00', program: 'Sound Truth', host: 'Malcolm Wild' },
  // Host field literally repeats the program's own name on the source
  // page - see header comment.
  { time: '03:30', program: 'Truth with Grace', host: 'Truth with Grace' },
  { time: '04:00', program: 'Main Thing Radio', host: 'Robert Fountain' },
  { time: '04:30', program: 'Running to Win', host: 'Erwin Lutzer' },
  { time: '05:00', program: 'Light On The Hill', host: 'James Kaddis' },
  { time: '05:30', program: 'A New Beginning', host: 'Greg Laurie' },
  { time: '06:00', program: 'The Word For Today', host: 'Chuck Smith' },
  { time: '06:30', program: 'A Daily Walk', host: 'John Randall' },
  { time: '07:00', program: 'Bridging the Gap', host: 'Lloyd Pulley' },
  { time: '07:30', program: 'Truth For Life', host: 'Alistair Begg' },
  { time: '08:00', program: 'Jesus In Our Time', host: 'Douglas Kinney' },
  { time: '08:30', program: 'Abounding Grace', host: 'Ed Taylor' },
  { time: '09:00', program: 'Truth with Grace', host: 'David Ochoa' },
  { time: '09:30', program: 'Sound Truth', host: 'Malcolm Wild' },
  // Placeholder base row - see header comment note (1). Superseded on
  // every real weekday by weekdayOverridesByDay below.
  { time: '10:00', program: 'Various Programs', host: 'Various Hosts' },
  { time: '11:00', program: 'Various Programs', host: 'Various Hosts' },
  { time: '12:00', program: 'Grace Infusion', host: 'Mike Nimer' },
  { time: '12:30', program: 'Real Life Radio', host: 'Jack Hibbs' },
  { time: '13:00', program: 'Hope From the Word', host: 'Bill Luebkemann' },
  // "6640" as transcribed - see header comment.
  { time: '13:30', program: '6640', host: 'Chuck Missler' },
  { time: '14:00', program: 'A Sure Foundation', host: 'David Rosales' },
  { time: '14:30', program: 'The Balanced Word', host: 'Dave Rolph' },
  // Placeholder base row - see header comment note (1).
  { time: '15:00', program: 'Various Programs', host: 'Various Artists' },
  { time: '16:00', program: 'Turning Point', host: 'David Jeremiah' },
  { time: '16:30', program: 'Changed By Love', host: 'Jim Keavney' },
  { time: '17:00', program: 'The Cornerstone Connection', host: 'Gary Hamrick' },
  { time: '17:30', program: 'Jesus In Our Time', host: 'Douglas Kinney' },
  { time: '18:00', program: 'Boldly Speaking', host: 'Ron Dozler' },
  { time: '18:30', program: 'Back to Basics', host: 'Brian Brodersen' },
  { time: '19:00', program: 'Living Hope', host: 'Claude Stauffer' },
  { time: '19:30', program: 'Main Thing Radio', host: 'Robert Fountain' },
  { time: '20:00', program: 'The Word For Today', host: 'Chuck Smith' },
  { time: '20:30', program: 'Adventures in Odyssey', host: 'Focus on the Family' },
  { time: '21:00', program: 'Running to Win', host: 'Erwin Lutzer' },
  { time: '21:30', program: 'Light On The Hill', host: 'James Kaddis' },
  { time: '22:00', program: 'According to the Scriptures', host: 'Greg Laurie' },
  { time: '22:30', program: 'Searchlight', host: 'Jon Courson' },
  // "6640" as transcribed - see header comment.
  { time: '23:00', program: '6640', host: 'Chuck Missler' },
  { time: '23:30', program: 'Changed By Love', host: 'Jim Keavney' },
];

// See header comment note (1) - each of these overrides exactly the
// 10:00/11:00/15:00 placeholder rows above, for that one weekday only.
const WEEKDAY_OVERRIDES_BY_DAY = {
  MON: [
    { time: '10:00', program: 'Faith FM Top Ten', host: 'Douglas Kinney' },
    { time: '11:00', program: 'The Message You Might Have Missed', host: 'Douglas Kinney' },
    { time: '15:00', program: 'The Gospel Reggae Hour', host: 'Douglas Kinney' },
  ],
  TUE: [
    { time: '10:00', program: 'The Message You Might Have Missed', host: 'Douglas Kinney' },
    { time: '11:00', program: 'Christian Music Mix', host: 'Various Artists' },
    { time: '15:00', program: 'The Message You May Have Missed', host: 'Douglas Kinney' },
  ],
  WED: [
    { time: '10:00', program: 'A Sermon Worth Sharing', host: 'Douglas Kinney' },
    { time: '11:00', program: 'Christian Music Mix', host: 'Various Artists' },
    { time: '15:00', program: 'Road to Calvary', host: 'Dave Cooke' },
  ],
  THU: [
    { time: '10:00', program: 'Open Up the Doors', host: 'Andy White' },
    { time: '11:00', program: 'Open Up the Doors', host: 'Andy White' },
    { time: '15:00', program: 'Open Up the Doors', host: 'Andy White' },
  ],
  FRI: [
    { time: '10:00', program: 'The Gospel Reggae Hour', host: 'Douglas Kinney' },
    { time: '11:00', program: 'Faith FM Top Ten', host: 'Douglas Kinney' },
    { time: '15:00', program: 'Faith FM Top Ten', host: 'Douglas Kinney' },
  ],
};

const SATURDAY_SCHEDULE = [
  { time: '00:00', program: 'Midnight Worship Mix', host: 'Various Artists' },
  { time: '01:00', program: 'The Gospel Reggae Hour', host: 'Douglas Kinney' },
  { time: '02:00', program: 'The Faith FM Top Ten', host: 'Douglas Kinney' },
  { time: '03:00', program: 'Hamptons Christian Fellowship', host: 'Douglas Kinney' },
  { time: '04:00', program: 'The Message You Might Have Missed', host: 'Andy White' },
  { time: '05:00', program: 'Light On The Hill', host: 'James Kaddis' },
  { time: '05:30', program: 'A New Beginning', host: 'Greg Laurie' },
  { time: '06:00', program: 'The Word For Today', host: 'Chuck Smith' },
  { time: '06:30', program: 'A Daily Walk', host: 'John Randall' },
  { time: '07:00', program: 'Bridging the Gap', host: 'Lloyd Pulley' },
  { time: '07:30', program: 'Truth For Life', host: 'Alistair Begg' },
  { time: '08:00', program: 'Inside the Epicenter', host: 'Joel Rosenberg' },
  { time: '08:30', program: 'Grace For the Journey', host: 'Michelle Randall' },
  { time: '09:00', program: 'We Would See Jesus', host: 'Karen Pulley' },
  { time: '09:30', program: 'The Road to Calvary', host: 'Dave Cooke' },
  { time: '10:00', program: 'Weekend Magazine', host: 'Focus on the Family' },
  { time: '11:00', program: 'LoveSavers Radio', host: 'Walter & Sandy Fox' },
  { time: '11:30', program: 'Jesus In Our Time', host: 'Douglas Kinney' },
  { time: '12:00', program: 'Washington Watch Weekly', host: 'Tony Perkins / FRC' },
  { time: '12:30', program: 'Haven Today', host: 'David Wollen' },
  { time: '13:00', program: 'Open Up the Doors', host: 'Andy White' },
  { time: '14:00', program: 'The Message You Might Have Missed', host: 'Douglas Kinney' },
  { time: '15:00', program: 'Hamptons Christian Radio', host: 'Douglas Kinney' },
  { time: '16:00', program: 'The Gospel Reggae Hour', host: 'Douglas Kinney' },
  { time: '17:00', program: 'The Faith FM Top Ten', host: 'Douglas Kinney' },
  // Host missing on the source page itself - see header comment note (2).
  { time: '18:00', program: 'Jesus In Our Time', host: '' },
  { time: '18:30', program: 'A New Beginning', host: 'Greg Laurie' },
  { time: '19:00', program: 'Christian Music Mix', host: 'Various Artists' },
  { time: '19:30', program: 'Watching & Waiting', host: 'Eugene McGee' },
  { time: '20:00', program: 'Inside the Epicenter', host: 'Joel Rosenberg' },
  { time: '20:30', program: 'Haven Today', host: 'David Wollen' },
  { time: '21:00', program: 'Hamptons Christian Fellowship', host: 'Douglas Kinney' },
  { time: '22:00', program: 'The Message You Might Have Missed', host: 'Douglas Kinney' },
  { time: '23:00', program: 'The Gospel Reggae Hour', host: 'Douglas Kinney' },
];

const SUNDAY_SCHEDULE = [
  { time: '00:00', program: 'Midnight Worship Mix', host: 'Various Artists' },
  { time: '01:00', program: 'A New Beginning', host: 'Greg Laurie' },
  { time: '01:30', program: 'Jesus In Our Time', host: 'Douglas Kinney' },
  { time: '02:00', program: 'Truth For Life', host: 'Alistair Begg' },
  { time: '02:30', program: 'Bridging the Gap', host: 'Lloyd Pulley' },
  { time: '03:00', program: 'The Road to Calvary', host: 'Dave Cooke' },
  { time: '03:30', program: 'The Word For Today', host: 'Chuck Smith' },
  { time: '04:00', program: 'The Gospel Reggae Hour', host: 'Douglas Kinney' },
  // Genuinely two hours long - no half-hour marker until 7:00 AM.
  { time: '05:00', program: 'Worship Music Mix', host: 'Various Artists' },
  { time: '07:00', program: 'Haven Today', host: 'David Wollen' },
  { time: '07:30', program: 'Worship Music Mix', host: 'Various Artists' },
  { time: '08:00', program: 'Worship Music Mix', host: 'Various Artists' },
  { time: '08:30', program: 'Abounding Grace', host: 'Ed Taylor' },
  { time: '09:00', program: 'Truth For Life', host: 'Alistair Begg' },
  { time: '09:30', program: 'Worship Music Mix', host: 'Various Artists' },
  { time: '10:00', program: 'The Message You Might Have Missed', host: 'Douglas Kinney' },
  // Genuinely one hour long - no half-hour marker until noon.
  { time: '11:00', program: 'Worship Music Mix', host: 'Various Artists' },
  { time: '12:00', program: 'Inside the Epicenter', host: 'Joel Rosenberg' },
  { time: '12:30', program: 'Grace For the Journey', host: 'Michelle Randall' },
  { time: '13:00', program: 'Watching & Waiting', host: 'Eugene McGee' },
  { time: '13:30', program: 'The Dacus Report', host: 'Brad Dacus' },
  { time: '14:00', program: 'Christian Music Mix', host: 'Various Artists' },
  { time: '14:30', program: 'The Balanced Word', host: 'Dave Rolph' },
  { time: '15:00', program: 'Bridging the Gap', host: 'Lloyd Pulley' },
  { time: '15:30', program: 'We Would See Jesus', host: 'Karen Pulley' },
  { time: '16:00', program: 'Truth For Life', host: 'Alistair Begg' },
  { time: '16:30', program: 'Changed By Love', host: 'Jim Keavney' },
  { time: '17:00', program: 'Jesus In Our Time', host: 'Douglas Kinney' },
  { time: '17:30', program: 'The Road to Calvary', host: 'Dave Cooke' },
  { time: '18:00', program: 'A Daily Walk', host: 'John Randall' },
  { time: '18:30', program: 'The Word For Today', host: 'Chuck Smith' },
  // Genuinely one hour long - no half-hour marker until 8:00 PM.
  { time: '19:00', program: 'The Message You May Have Missed', host: 'Douglas Kinney' },
  { time: '20:00', program: 'The Faith FM Top Ten', host: 'Douglas Kinney' },
  { time: '21:00', program: 'The Gospel Reggae Hour', host: 'Douglas Kinney' },
  { time: '22:00', program: 'Inside the Epicenter', host: 'Joel Rosenberg' },
  { time: '22:30', program: 'Watching & Waiting', host: 'Eugene McGee' },
  { time: '23:00', program: 'Washington Watch Weekly', host: 'Tony Perkins' },
  { time: '23:30', program: 'Jesus In Our Time', host: 'Douglas Kinney' },
];

export const FAITHFM_SCHEDULE = {
  timezone: 'America/New_York',
  weekday: WEEKDAY_SCHEDULE,
  weekdayOverridesByDay: WEEKDAY_OVERRIDES_BY_DAY,
  saturday: SATURDAY_SCHEDULE,
  sunday: SUNDAY_SCHEDULE,
};
