// Hand-transcribed from Calvary Chapel Minot's published schedule page,
// https://calvarychapelminot.org/schedule-about, on 2026-09-21. Unlike every
// other station on this provider, the schedule isn't a table or rich-text
// block - it's three embedded images (Monday-Friday, Saturday, Sunday), each
// a grid of half-hour slots with up to three separate time columns ("1st
// Play" / "2nd Play" / "3rd Play") showing every time that same program
// airs that day, rather than one row per airing. Fetched the underlying
// JPEGs directly (a `_500`-suffixed thumbnail URL upgrades to `_1000` for a
// legible width - every other size variant 403s) and read them as images
// rather than guessing from alt text, since there's no text to scrape at
// all here.
//
// KFLK was investigated once before and actually added, then removed days
// later - see radio-station-providers-notes-consolidated.md's `streamingradio`
// section. The stream itself was never the problem: `streamUrl`
// (`https://server02.streamingrad.io:8443/listen/kflk_the_flock_95.9_fm/radio`)
// re-confirmed live/playable 2026-09-21, byte-for-byte the same URL
// documented from the original investigation. The now-playing endpoint
// (`https://streamingrad.io/streaming-audio/live.php?action=metadata&id_player=9`)
// is the genuinely dead part - Larry independently re-checked it 2026-09-21
// and got back the exact same hardcoded "Sweater Weather" response (down to
// the same `trackViewUrl`) that got this station pulled the first time.
// Same dead-metadata situation as every other publishedschedule station, so
// this goes straight to a published-schedule transcription rather than
// waiting on a pipeline that's shown no sign of ever being fixed.
//
// **The "repeat = separate entries" convention (see
// radio-station-published-schedule-notes.md's "Transcription format")
// turned out to fit this source perfectly**, despite its 1st/2nd/3rd Play
// columns looking unusual at first glance - each column is just another
// airing of the same program, exactly like WJWD's multi-row repeats or
// GraceFM's "7:00AM + 4:30PM" combined-line repeats. Flattening every column
// into its own { time, program, host } entry and letting the existing
// lookup sort them all together produces a complete, gap-free 24-hour cycle
// on all three days - confirmed by summing every entry's covered span to
// exactly 1440 minutes for weekday/saturday/sunday alike (see the header
// note on WEEKDAY_SCHEDULE below for the one place that arithmetic depended
// on a corrected typo, not just addition).
//
// One correction, not a judgment call: the Monday-Friday grid pairs every
// "1st Play" half-hour slot with a "2nd Play" time exactly 12 hours later,
// with a single exception - the 1:00 AM slot ("According to the
// Scriptures") lists its 2nd Play as 16:00 instead of the 13:00 every other
// row's pattern would predict. Taking that 16:00 literally would both leave
// a real 13:00 hole in the PM grid AND double-book 16:00 against 4:00 AM's
// own repeat ("Breath of God") - corrected to 13:00, which is the only
// reading that makes the PM half of the grid land on a perfect, gap-free,
// non-overlapping half-hour sequence from 12:00 to 23:30. Kept the
// 16:00 -> 13:00 correction narrowly scoped to this one cell rather than as
// a general "always trust the pattern over the source" rule.
//
// A handful of small spelling/title fixes, all confirmed by cross-checking
// the same program against the other two days' images rather than guessed
// in isolation: "Calvar Chapel Castle Rock" -> Calvary Chapel Castle Rock
// (Abiding in the Word, all three days); "The Blanaced Word" -> The Balanced
// Word (Sunday); "Here's the Truth Weekend Edition" (Sunday, missing
// "Radio") -> Here's the Truth Radio Weekend Edition, matching Saturday's
// fuller title for the same host/church; "Unashamed of the Gospel Grace
// Baptist" (Saturday's title cell) -> Unashamed of the Gospel, matching
// Sunday's cleaner title and leaving the church name where it already lives,
// in the host/affiliated-ministry column.
//
// Two Saturday/Sunday slots ("Prophesy Today" on both days, "The Balanced
// Word" on Sunday) get an hour-long block rather than the usual half hour -
// the grid simply has no half-hour marker between their start time and the
// next explicit one, on both the AM original and every later repeat,
// consistently. Not a gap needing an "Unknown Programming" filler
// (contrast WJWD's real 4-hour hole) - every minute of the day is still
// accounted for by some entry, this one just happens to run twice as long
// as its neighbors.
//
// Timezone: America/Chicago (Minot, ND is Central Time).
//
// Logo: staticCoverUrl '/kflk-icon.png' / staticCoverThumbUrl
// '/kflk-icon-128.png' - Larry's own "The Flock 88.1 FM" badge (circular
// line-art mark: station name, a sheep silhouette, "88.1 FM"). Like KKJC's
// badge, this is already a complete circular design rather than a bare
// mark, so no extra rounded-square frame was built around it - only the
// flat white background was removed (plain border-connected flood fill;
// the source image was 500x458, not square, so it was padded onto a
// transparent 500x500 canvas before the white removal and the 512x512 /
// 128x128 resize, to avoid squashing the circle into an oval).

const WEEKDAY_SCHEDULE = [
  { time: '00:00', program: 'Straight from the Heart', host: 'Joe Focht' },
  { time: '00:30', program: 'GodSword', host: 'Ken Graves' },
  { time: '01:00', program: 'According to the Scriptures', host: 'Damien Kyle' },
  { time: '01:30', program: 'Practical Christian Living', host: 'Robert Furrow' },
  { time: '02:00', program: 'On the Level', host: 'Pancho Juarez' },
  { time: '02:30', program: 'The Word Remains', host: 'George Small' },
  { time: '03:00', program: 'Come Drink the Water', host: 'Ben Garate' },
  { time: '03:30', program: 'Abiding in the Word', host: 'Dave Love' },
  { time: '04:00', program: 'Breath of God', host: 'Ron Hodson' },
  { time: '04:30', program: 'A Daily Walk', host: 'John Randall' },
  { time: '05:00', program: 'Sandy Adams Radio', host: 'Sandy Adams' },
  { time: '05:30', program: 'Sound Truth', host: 'Malcolm Wilde' },
  { time: '06:00', program: 'The Word for Today', host: 'Chuck Smith' },
  { time: '06:30', program: 'Searchlight', host: 'Jon Courson' },
  { time: '07:00', program: 'A New Beginning', host: 'Greg Laurie' },
  { time: '07:30', program: 'Here’s the Truth Radio', host: 'Bill Smith' },
  { time: '08:00', program: 'Turning Point', host: 'Dr David Jeremiah' },
  { time: '08:30', program: 'The Dwelling Place', host: 'Al Pittman' },
  { time: '09:00', program: 'The Connection', host: 'Skip Heitzig' },
  { time: '09:30', program: 'Bridging the Gap', host: 'Lloyd Pulley' },
  { time: '10:00', program: 'Truth for Life', host: 'Alistair Begg' },
  { time: '10:30', program: 'Real Life', host: 'Jack Hibbs' },
  { time: '11:00', program: 'Enduring Word', host: 'David Guzik' },
  { time: '11:30', program: 'The Balanced Word', host: 'Dave Rolph' },
  // 12:00-23:30 below is every AM program's 2nd Play repeat (exactly 12h
  // later), except where noted, interleaved with six PM-only programs the
  // grid never airs in the morning at all.
  { time: '12:00', program: 'Straight from the Heart', host: 'Joe Focht' },
  { time: '12:30', program: 'GodSword', host: 'Ken Graves' },
  // Corrected from the source's literal "16:00" - see header comment.
  { time: '13:00', program: 'According to the Scriptures', host: 'Damien Kyle' },
  { time: '13:30', program: 'Practical Christian Living', host: 'Robert Furrow' },
  { time: '14:00', program: 'On the Level', host: 'Pancho Juarez' },
  { time: '14:30', program: 'The Word Remains', host: 'George Small' },
  { time: '15:00', program: 'Come Drink the Water', host: 'Ben Garate' },
  { time: '15:30', program: 'Abiding in the Word', host: 'Dave Love' },
  { time: '16:00', program: 'Breath of God', host: 'Ron Hodson' },
  { time: '16:30', program: 'A Daily Walk', host: 'John Randall' },
  // PM-only, no AM airing.
  { time: '17:00', program: 'Chapter and Verse', host: 'Mike MacIntosh' },
  { time: '17:30', program: 'Sound Truth', host: 'Malcolm Wilde' },
  { time: '18:00', program: 'The Word for Today', host: 'Chuck Smith' },
  // PM-only, no AM airing.
  { time: '18:30', program: '66/40', host: 'Chuck Missler' },
  { time: '19:00', program: 'A New Beginning', host: 'Greg Laurie' },
  { time: '19:30', program: 'Here’s the Truth Radio', host: 'Bill Smith' },
  { time: '20:00', program: 'Turning Point', host: 'Dr David Jeremiah' },
  { time: '20:30', program: 'The Dwelling Place', host: 'Al Pittman' },
  { time: '21:00', program: 'The Connection', host: 'Skip Heitzig' },
  // PM-only, no AM airing.
  { time: '21:30', program: 'Thru the Bible', host: 'J. Vernon McGee' },
  { time: '22:00', program: 'Abounding Grace', host: 'Ed Taylor' },
  { time: '22:30', program: 'Grow in Grace', host: 'Ed Rea' },
  { time: '23:00', program: 'A Sure Foundation', host: 'David Rosales' },
  { time: '23:30', program: 'The Balanced Word', host: 'Dave Rolph' },
];

const SATURDAY_SCHEDULE = [
  { time: '00:00', program: 'Straight from the Heart', host: 'Joe Focht' },
  { time: '00:30', program: 'Bridging the Gap Weekend Edition', host: 'Lloyd Pulley' },
  { time: '01:00', program: 'According to the Scriptures Weekend Edition', host: 'Damien Kyle' },
  { time: '01:30', program: 'Unshackled', host: 'Pacific Garden Mission' },
  { time: '02:00', program: 'GodSword', host: 'Ken Graves' },
  { time: '02:30', program: 'Voice of the Martyrs', host: 'Todd Nettleton' },
  { time: '03:00', program: 'Simple Faith', host: 'Bill Henry' },
  { time: '03:30', program: 'Abiding in the Word', host: 'Dave Love' },
  { time: '04:00', program: 'Breath of God', host: 'Ron Hodson' },
  { time: '04:30', program: 'A Daily Walk', host: 'John Randall' },
  // Genuinely hour-long - see header comment, no 5:30 marker on either the
  // original or the repeat.
  { time: '05:00', program: 'Prophesy Today', host: 'Shofar Communications' },
  { time: '06:00', program: 'The Word for Today Weekend Edition', host: 'Chuck Smith' },
  { time: '06:30', program: 'The Dacus Report', host: 'Brad Dacus' },
  { time: '07:00', program: 'A New Beginning', host: 'Greg Laurie' },
  { time: '07:30', program: 'Here’s the Truth Radio Weekend Edition', host: 'Bill Smith' },
  { time: '08:00', program: 'Turning Point', host: 'Dr David Jeremiah' },
  { time: '08:30', program: 'Unashamed of the Gospel', host: 'Greg Demme' },
  { time: '09:00', program: 'Adventures in Odyssey', host: 'Focus on the Family' },
  { time: '09:30', program: 'Down Gilead Lane', host: 'Keys for Kids' },
  { time: '10:00', program: 'Paws and Tales', host: 'Insight for Living Ministries' },
  { time: '10:30', program: 'Kid’s Corner', host: 'Reframe Ministries' },
  { time: '11:00', program: 'Lamplighter Theater', host: 'Lamplighter Ministries' },
  { time: '11:30', program: 'Awesome Science', host: 'Kyle Justice' },
  { time: '12:00', program: 'The Friends of Israel Today', host: '' },
  { time: '12:30', program: 'Chosen People Ministries', host: 'Glaser/Walter' },
  // 13:00-21:30 is the 2nd Play repeat of every AM slot above that has one
  // (0:00/0:30/9:00-11:30 don't repeat).
  { time: '13:00', program: 'According to the Scriptures Weekend Edition', host: 'Damien Kyle' },
  { time: '13:30', program: 'Unshackled', host: 'Pacific Garden Mission' },
  { time: '14:00', program: 'GodSword', host: 'Ken Graves' },
  { time: '14:30', program: 'Voice of the Martyrs', host: 'Todd Nettleton' },
  { time: '15:00', program: 'Simple Faith', host: 'Bill Henry' },
  { time: '15:30', program: 'Abiding in the Word', host: 'Dave Love' },
  { time: '16:00', program: 'Breath of God', host: 'Ron Hodson' },
  { time: '16:30', program: 'A Daily Walk', host: 'John Randall' },
  { time: '17:00', program: 'Prophesy Today', host: 'Shofar Communications' },
  { time: '18:00', program: 'The Word for Today Weekend Edition', host: 'Chuck Smith' },
  { time: '18:30', program: 'The Dacus Report', host: 'Brad Dacus' },
  { time: '19:00', program: 'A New Beginning', host: 'Greg Laurie' },
  { time: '19:30', program: 'Here’s the Truth Radio Weekend Edition', host: 'Bill Smith' },
  { time: '20:00', program: 'Turning Point', host: 'Dr David Jeremiah' },
  { time: '20:30', program: 'Unashamed of the Gospel', host: 'Greg Demme' },
  { time: '21:00', program: 'The Friends of Israel Today', host: '' },
  { time: '21:30', program: 'Chosen People Ministries', host: 'Glaser/Walter' },
  // Tail: not a repeat of anything earlier, and not repeated again later.
  { time: '22:00', program: 'Truth for Life Weekend Edition', host: 'Alistair Begg' },
  { time: '22:30', program: 'Abounding Grace', host: 'Ed Taylor' },
  { time: '23:00', program: 'Grow in Grace', host: 'Ed Rea' },
  // 3rd Play of the 7:30/19:30 slot above.
  { time: '23:30', program: 'Here’s the Truth Radio Weekend Edition', host: 'Bill Smith' },
];

const SUNDAY_SCHEDULE = [
  { time: '00:00', program: 'Straight from the Heart', host: 'Joe Focht' },
  { time: '00:30', program: 'Real Life', host: 'Jack Hibbs' },
  { time: '01:00', program: 'According to the Scriptures Weekend Edition', host: 'Damien Kyle' },
  { time: '01:30', program: 'Unshackled', host: 'Pacific Garden Mission' },
  { time: '02:00', program: 'GodSword', host: 'Ken Graves' },
  { time: '02:30', program: 'Voice of the Martyrs', host: 'Todd Nettleton' },
  { time: '03:00', program: 'Simple Faith', host: 'Bill Henry' },
  { time: '03:30', program: 'Abiding in the Word', host: 'Dave Love' },
  { time: '04:00', program: 'Breath of God', host: 'Ron Hodson' },
  { time: '04:30', program: 'A Daily Walk', host: 'John Randall' },
  // Genuinely hour-long, same as Saturday's - no half-past marker on the
  // original or either repeat.
  { time: '05:00', program: 'Prophesy Today', host: 'Shofar Communications' },
  { time: '05:30', program: 'The Balanced Word', host: 'Dave Rolph' },
  { time: '06:00', program: 'The Word for Today Weekend Edition', host: 'Chuck Smith' },
  { time: '06:30', program: 'The Dacus Report', host: 'Brad Dacus' },
  { time: '07:00', program: 'A New Beginning', host: 'Greg Laurie' },
  { time: '07:30', program: 'Here’s the Truth Radio Weekend Edition', host: 'Bill Smith' },
  { time: '08:00', program: 'Turning Point', host: 'Dr David Jeremiah' },
  { time: '08:30', program: 'Unashamed of the Gospel', host: 'Greg Demme' },
  // 9:00/9:30 are the 2nd Play repeat of 5:00/5:30 above - no base row of
  // their own (the grid jumps straight from 8:30 to 10:00).
  { time: '09:00', program: 'Prophesy Today', host: 'Shofar Communications' },
  { time: '09:30', program: 'The Balanced Word', host: 'Dave Rolph' },
  { time: '10:00', program: 'Truth for Life Weekend Edition', host: 'Alistair Begg' },
  // Genuinely hour-long - no 11:00 marker anywhere (base or repeat).
  { time: '10:30', program: 'Calvary Chapel Minot Live!', host: 'Bill Smith' },
  { time: '11:30', program: 'Grow in Grace', host: 'Ed Rea' },
  { time: '12:00', program: 'The Friends of Israel Today', host: '' },
  { time: '12:30', program: 'Chosen People Ministries', host: 'Glaser/Walter' },
  // 13:00-20:30 is the 2nd Play repeat of the AM programs above that have
  // one (0:00/0:30/10:30 don't repeat).
  { time: '13:00', program: 'According to the Scriptures Weekend Edition', host: 'Damien Kyle' },
  { time: '13:30', program: 'Unshackled', host: 'Pacific Garden Mission' },
  { time: '14:00', program: 'GodSword', host: 'Ken Graves' },
  { time: '14:30', program: 'Voice of the Martyrs', host: 'Todd Nettleton' },
  { time: '15:00', program: 'Simple Faith', host: 'Bill Henry' },
  { time: '15:30', program: 'Abiding in the Word', host: 'Dave Love' },
  { time: '16:00', program: 'Breath of God', host: 'Ron Hodson' },
  { time: '16:30', program: 'A Daily Walk', host: 'John Randall' },
  // 3rd Play of the 5:00/5:30 (and 9:00/9:30) slot above.
  { time: '17:00', program: 'Prophesy Today', host: 'Shofar Communications' },
  { time: '17:30', program: 'The Balanced Word', host: 'Dave Rolph' },
  { time: '18:00', program: 'The Word for Today Weekend Edition', host: 'Chuck Smith' },
  { time: '18:30', program: 'The Dacus Report', host: 'Brad Dacus' },
  { time: '19:00', program: 'A New Beginning', host: 'Greg Laurie' },
  { time: '19:30', program: 'Here’s the Truth Radio Weekend Edition', host: 'Bill Smith' },
  { time: '20:00', program: 'Turning Point', host: 'Dr David Jeremiah' },
  { time: '20:30', program: 'Unashamed of the Gospel', host: 'Greg Demme' },
  { time: '21:00', program: 'The Friends of Israel Today', host: '' },
  { time: '21:30', program: 'Chosen People Ministries', host: 'Glaser/Walter' },
  { time: '22:00', program: 'Truth for Life Weekend Edition', host: 'Alistair Begg' },
  // Tail: not a repeat of anything earlier, and not repeated again later.
  { time: '22:30', program: 'Abounding Grace', host: 'Ed Taylor' },
  // 2nd Play of the 11:30 slot above.
  { time: '23:00', program: 'Grow in Grace', host: 'Ed Rea' },
  // 3rd Play of the 7:30/19:30 slot above.
  { time: '23:30', program: 'Here’s the Truth Radio Weekend Edition', host: 'Bill Smith' },
];

export const KFLK_SCHEDULE = {
  timezone: 'America/Chicago',
  weekday: WEEKDAY_SCHEDULE,
  saturday: SATURDAY_SCHEDULE,
  sunday: SUNDAY_SCHEDULE,
};
