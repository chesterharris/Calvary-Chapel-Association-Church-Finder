// Hand-transcribed from Crossway Radio's own schedule pages -
// https://www.crosswayradio.com/monday-friday-broadcast,
// /saturday-broadcast-schedule, and /sunday-broadcast-schedule - on
// 2026-09-22. Plain HTML text (one "H:MMAM/PM - H:MMAM/PM  Program
// Pastor/Teacher" row per slot), same easy shape as WXMB's pages - a
// direct read, no images or repeat-column puzzles.
//
// **The two-frequencies mystery, resolved.** Crossway broadcasts the same
// programming on two physically separate FM signals - 88.9 (Morris County
// and Central NJ) and 89.1 (Western Warren County, NJ and Northampton
// County, PA) - and Larry initially heard what sounded like two different
// programs when listening to both. Not a timezone thing (both are
// America/New_York) and not actually different content: each frequency's
// "Listen Live" page on crosswayradio.com embeds its own separate Live365
// station (88.9 = mount `a63431`, 89.1 = mount `a62921` - confirmed via
// each page's embedded iframe src), so at first glance they looked like
// two independently-run feeds. Larry re-listened and confirmed they're
// actually the same underlying stream, just not perfectly synced with
// each other (~10+ seconds of drift between the two independent
// encodes/relays) - close enough that a casual listen catches two
// different-sounding air checks, far enough that they're not literally
// simultaneous. One schedule covers both; only one station entry is
// needed here. `streamUrl` below uses the 88.9 mount (`a63431`), matching
// the logo Larry supplied (which reads "88.9 FM"), but either mount would
// carry the identical program at any given moment, modulo that same
// ~10-second drift.
//
// 89.1 (`a62921`) was actually investigated once before, under the
// `live365json`/rejected-providers section of
// radio-station-providers-notes-consolidated.md - its now-playing
// metadata was rejected because Live365's `/metadata` SSE endpoint only
// answers requests that spoof an Origin/Referer claiming to be Live365's
// own embedded player, a deliberate "not worth doing" call at the time.
// Irrelevant here since this goes straight to the published schedule
// instead, same as every other publishedschedule station - not chasing
// live metadata at all.
//
// High quality vs. low quality stream question: moot for this provider.
// Live365's own station JSON (`https://api.live365.com/station/{mountId}`)
// lists `high_quality` and `low_quality` as the literal same URL
// (`https://streaming.live365.com/{mountId}`) - there's only one plain
// MP3 address, matching the existing `live365json` provider convention
// (see radio-station-providers-notes-consolidated.md) of using that plain
// URL rather than the separate `.m3u8` HLS variant.
//
// Every slot is transcribed as its own entry, half-hour blocks throughout
// except for two intentional exceptions, confirmed as real (not
// transcription slips) by checking that each day still sums to exactly
// 1440 minutes with zero duplicate start times: the weekday grid splits
// 1:00-1:30 PM into two genuine 15-minute slots (Main Thing Radio, then
// Key Life); Sunday's 5:00 PM slot ("Cross Examined") runs a full hour,
// with no 5:30 PM marker on the page at all.
//
// One correction, backed by outside knowledge, not a guess: "Alistair
// Begg" is a well-known, consistently-spelled radio Bible teacher: the
// weekday page and both weekend pages' *own first* "Truth For Life"
// airing spell it correctly, but the weekend pages' *second* airing of
// the same program (7:00 AM Saturday and Sunday) spells it "Alistar
// Begg", missing the second i. Corrected to "Alistair Begg" in both
// places for consistency.
//
// Left as literally transcribed, not reconciled, because the pages
// disagree and neither reads as the obvious typo: "Clarke Lauffer"
// (weekday's "Living Waters of Grace" host) vs "Claude Lauffer" (both
// weekend pages, consistently with each other) - kept exactly as each
// page spells it.
//
// Timezone: America/New_York (Morris County / Warren County, NJ and
// Northampton County, PA are all Eastern).
//
// Logo: staticCoverUrl '/crossway-icon.png' / staticCoverThumbUrl
// '/crossway-icon-128.png' - Larry's "Crossway Radio 88.9 FM" badge.
// Already a complete, finished, perfectly square (225x225) rounded-badge
// design with its own full-bleed blue gradient background - no white
// field to remove, no frame to add, no padding needed. Only processing:
// straight resize to 512x512 and 128x128 via LANCZOS.

const WEEKDAY_SCHEDULE = [
  { time: '00:00', program: 'Truth For A Change', host: 'Robert Bigouette' },
  { time: '00:30', program: 'Verse by Verse', host: 'John Reed' },
  { time: '01:00', program: 'The Transforming Word', host: 'Dr. Mike Spaulding' },
  { time: '01:30', program: 'Calvary Talk', host: 'Pat Sieler' },
  { time: '02:00', program: 'Changed By Love', host: 'Jim Keavney' },
  { time: '02:30', program: 'Straight From The Heart', host: 'Joe Focht' },
  { time: '03:00', program: 'The Word For Today', host: 'Chuck Smith' },
  { time: '03:30', program: 'Sandy Adams Radio', host: 'Sandy Adams' },
  { time: '04:00', program: 'Living Waters of Grace', host: 'Clarke Lauffer' },
  { time: '04:30', program: 'Enduring Word', host: 'David Guzik' },
  { time: '05:00', program: 'Hope From The Word', host: 'Bill Luebkemann' },
  { time: '05:30', program: 'Love Worth Finding', host: 'Adrian Rogers' },
  { time: '06:00', program: 'Insight For Living', host: 'Chuck Swindoll' },
  { time: '06:30', program: 'Power Point', host: 'Jack Graham' },
  { time: '07:00', program: 'Truth For Life', host: 'Alistair Begg' },
  { time: '07:30', program: 'Changed By Love', host: 'Jim Keavney' },
  { time: '08:00', program: 'Straight From The Heart', host: 'Joe Focht' },
  { time: '08:30', program: 'According To The Scriptures', host: 'Damian Kyle' },
  { time: '09:00', program: 'Come to the Table', host: 'Mark Kirk' },
  { time: '09:30', program: 'The Word For Today', host: 'Chuck Smith' },
  { time: '10:00', program: 'Larger Than Life', host: 'Ron Hindt' },
  { time: '10:30', program: 'The Implanted Word', host: 'Bill Gehm' },
  { time: '11:00', program: 'Sustaining Truth', host: 'Paul Stockinger' },
  { time: '11:30', program: 'Turning Point', host: 'David Jeremiah' },
  { time: '12:00', program: 'New Beginning', host: 'Greg Laurie' },
  { time: '12:30', program: 'Changed By Love', host: 'Jim Keavney' },
  // Genuine 15-minute slots, not a typo - see header comment.
  { time: '13:00', program: 'Main Thing Radio', host: 'Robert Fountain' },
  { time: '13:15', program: 'Key Life', host: 'Steve Brown' },
  { time: '13:30', program: 'Family Life Today', host: 'Dave and Ann Wilson' },
  { time: '14:00', program: 'Time In The Word', host: 'Troy Warner' },
  { time: '14:30', program: 'Living On The Edge', host: 'Chip Ingram' },
  { time: '15:00', program: 'Study The Word', host: 'Thom Keller' },
  { time: '15:30', program: 'Abounding Grace', host: 'Ed Taylor' },
  { time: '16:00', program: 'Focal Point', host: 'Mike Fabarez' },
  { time: '16:30', program: 'The Connection', host: 'Skip Heitzig' },
  { time: '17:00', program: 'Changed By Love', host: 'Jim Keavney' },
  { time: '17:30', program: 'Grace To You', host: 'John MacArthur' },
  { time: '18:00', program: 'Summit Life', host: 'J.D. Greear' },
  { time: '18:30', program: 'Real Life', host: 'Jack Hibbs' },
  { time: '19:00', program: 'Boldly Speaking', host: 'Ron Dozler' },
  { time: '19:30', program: 'Anchored In The Word', host: 'Bill Beckelman' },
  { time: '20:00', program: 'A Daily Walk', host: 'John Randall' },
  { time: '20:30', program: 'Anchored Deep', host: 'Jeremy Higgins' },
  { time: '21:00', program: 'Life From The Word', host: 'Chris Swansen' },
  { time: '21:30', program: 'Living Hope', host: 'Claude A. Stauffer' },
  { time: '22:00', program: 'Faith & Finance with Rob West', host: 'Rob West' },
  { time: '22:30', program: 'Hope', host: 'Jeff Esterline' },
  { time: '23:00', program: 'Somebody Loves You', host: 'Raul Ries' },
  { time: '23:30', program: 'Jesus In Our Time', host: 'Doug Kinney' },
];

const SATURDAY_SCHEDULE = [
  { time: '00:00', program: 'Truth For A Change', host: 'Robert Bigouette' },
  { time: '00:30', program: 'Verse by Verse', host: 'John Reed' },
  { time: '01:00', program: 'The Transforming Word', host: 'Dr. Mike Spaulding' },
  { time: '01:30', program: 'Truth For Life', host: 'Alistair Begg' },
  { time: '02:00', program: 'Changed By Love', host: 'Jim Keavney' },
  { time: '02:30', program: 'Turning Point', host: 'David Jeremiah' },
  { time: '03:00', program: 'The Word For Today', host: 'Chuck Smith' },
  { time: '03:30', program: 'Sandy Adams Radio', host: 'Sandy Adams' },
  { time: '04:00', program: 'Living Waters of Grace', host: 'Claude Lauffer' },
  { time: '04:30', program: 'Study The Word', host: 'Thom Keller' },
  { time: '05:00', program: 'Hope From The Word', host: 'Bill Luebkemann' },
  { time: '05:30', program: 'Love Worth Finding', host: 'Adrian Rogers' },
  { time: '06:00', program: 'Insight For Living', host: 'Chuck Swindoll' },
  { time: '06:30', program: 'Power Point', host: 'Jack Graham' },
  // Corrected from the page's "Alistar Begg" - see header comment.
  { time: '07:00', program: 'Truth For Life', host: 'Alistair Begg' },
  { time: '07:30', program: 'Changed By Love', host: 'Jim Keavney' },
  { time: '08:00', program: 'Straight From The Heart', host: 'Joe Focht' },
  { time: '08:30', program: 'According To The Scriptures', host: 'Damian Kyle' },
  { time: '09:00', program: "Parenting Today's Teens", host: 'Mark Gregston' },
  { time: '09:30', program: 'Family Life This Week', host: 'Michelle Hill' },
  { time: '10:00', program: 'Focus On The Family', host: 'Jim Daly & John Fuller' },
  { time: '10:30', program: 'Focus On The Family', host: 'Jim Daly & John Fuller' },
  { time: '11:00', program: 'Sustaining Truth', host: 'Paul Stockinger' },
  { time: '11:30', program: 'A New Beginning', host: 'Greg Laurie' },
  { time: '12:00', program: 'At His Feet', host: 'Tom Dickerson' },
  { time: '12:30', program: 'Changed By Love', host: 'Jim Keavney' },
  { time: '13:00', program: 'Turning Point', host: 'David Jeremiah' },
  { time: '13:30', program: 'On The Level', host: 'Pancho Juarez' },
  { time: '14:00', program: 'Break Point', host: 'John Stonestreet & Warren Cole Smith' },
  { time: '14:30', program: 'Living on The Edge', host: 'Chip Ingram' },
  { time: '15:00', program: 'Enduring Word', host: 'David Guzik' },
  { time: '15:30', program: 'Abounding Grace', host: 'Ed Taylor' },
  { time: '16:00', program: 'The Balanced Word', host: 'Dave Rolph' },
  { time: '16:30', program: 'Walking In Truth', host: 'Johnny Zacchio' },
  { time: '17:00', program: 'Changed By Love', host: 'Jim Keavney' },
  { time: '17:30', program: 'Boldly Speaking', host: 'Ron Dozler' },
  { time: '18:00', program: 'Stand To Reason', host: 'Greg Koukl' },
  { time: '18:30', program: 'Stand To Reason', host: 'Greg Koukl' },
  { time: '19:00', program: '30 Min Q & A', host: 'J. Vernon McGee' },
  { time: '19:30', program: 'Anchored In The Word', host: 'Bill Beckelman' },
  { time: '20:00', program: 'A Daily Walk', host: 'John Randall' },
  { time: '20:30', program: 'Anchored Deep', host: 'Jeremy Higgins' },
  { time: '21:00', program: 'Straight From The Heart', host: 'Joe Focht' },
  { time: '21:30', program: 'Break Point', host: 'John Stonestreet & Warren Cole Smith' },
  { time: '22:00', program: 'Abounding Grace', host: 'Ed Taylor' },
  { time: '22:30', program: 'Hope', host: 'Jeff Esterline' },
  { time: '23:00', program: 'Love Worth Finding', host: 'Adrian Rogers' },
  { time: '23:30', program: 'Living On The Edge', host: 'Chip Ingram' },
];

const SUNDAY_SCHEDULE = [
  { time: '00:00', program: 'Truth For A Change', host: 'Robert Bigouette' },
  { time: '00:30', program: 'Verse by Verse', host: 'John Reed' },
  { time: '01:00', program: 'The Transforming Word', host: 'Dr. Mike Spaulding' },
  { time: '01:30', program: 'Truth For Life', host: 'Alistair Begg' },
  { time: '02:00', program: 'Changed By Love', host: 'Jim Keavney' },
  { time: '02:30', program: 'Turning Point', host: 'David Jeremiah' },
  { time: '03:00', program: 'The Word For Today', host: 'Chuck Smith' },
  { time: '03:30', program: 'Sandy Adams Radio', host: 'Sandy Adams' },
  { time: '04:00', program: 'Living Waters of Grace', host: 'Claude Lauffer' },
  { time: '04:30', program: 'Study The Word', host: 'Thom Keller' },
  { time: '05:00', program: 'Hope From The Word', host: 'Bill Luebkemann' },
  { time: '05:30', program: 'Love Worth Finding', host: 'Adrian Rogers' },
  { time: '06:00', program: 'Insight For Living', host: 'Chuck Swindoll' },
  { time: '06:30', program: 'Power Point', host: 'Jack Graham' },
  // Corrected from the page's "Alistar Begg" - see header comment.
  { time: '07:00', program: 'Truth For Life', host: 'Alistair Begg' },
  { time: '07:30', program: 'Changed By Love', host: 'Jim Keavney' },
  { time: '08:00', program: 'According To The Scriptures', host: 'Damian Kyle' },
  { time: '08:30', program: 'Straight From The Heart', host: 'Joe Focht' },
  { time: '09:00', program: 'Come To The Table', host: 'Mark Kirk' },
  { time: '09:30', program: 'The Word For Today', host: 'Chuck Smith' },
  { time: '10:00', program: 'Larger Than Life', host: 'Ron Hindt' },
  { time: '10:30', program: 'The Implanted Word', host: 'Bill Gehm' },
  { time: '11:00', program: 'Sustaining Truth', host: 'Paul Stockinger' },
  { time: '11:30', program: 'A New Beginning', host: 'Greg Laurie' },
  { time: '12:00', program: 'At His Feet', host: 'Tom Dickerson' },
  { time: '12:30', program: 'Changed By Love', host: 'Jim Keavney' },
  { time: '13:00', program: 'Grace To You', host: 'John MacArthur' },
  { time: '13:30', program: 'In Perspective', host: 'Dr. Harry Reeder' },
  { time: '14:00', program: 'Insight For Living', host: 'Chuck Swindoll' },
  { time: '14:30', program: 'Focal Point', host: 'Mike Fabarez' },
  { time: '15:00', program: 'Living A Legacy', host: 'Crawford Loritts' },
  { time: '15:30', program: 'Open the Bible', host: 'Colin Smith' },
  { time: '16:00', program: 'Abounding Grace', host: 'Ed Taylor' },
  { time: '16:30', program: 'The Dacus Report', host: 'Brad Dacus' },
  // Genuinely hour-long - no 5:30 PM marker on the page at all.
  { time: '17:00', program: 'Cross Examined', host: 'Frank Turek' },
  { time: '18:00', program: 'Worship Generation', host: 'Joey Buran' },
  { time: '18:30', program: 'Changed By Love', host: 'Jim Keavney' },
  { time: '19:00', program: 'Real Life', host: 'Jack Hibbs' },
  { time: '19:30', program: 'Anchored In The Word', host: 'Bill Beckelman' },
  { time: '20:00', program: 'The Connection', host: 'Skip Heitzig' },
  { time: '20:30', program: 'Insight For Living', host: 'Chuck Swindoll' },
  { time: '21:00', program: 'Straight From The Heart', host: 'Joe Focht' },
  { time: '21:30', program: 'Life From The Word', host: 'Chris Swansen' },
  { time: '22:00', program: 'Steve Brown Etc', host: 'Steve Brown' },
  { time: '22:30', program: 'Steve Brown Etc', host: 'Steve Brown' },
  { time: '23:00', program: 'Somebody Loves You', host: 'Raul Ries' },
  { time: '23:30', program: 'Jesus In Our Time', host: 'Doug Kinney' },
];

export const CROSSWAY_SCHEDULE = {
  timezone: 'America/New_York',
  weekday: WEEKDAY_SCHEDULE,
  saturday: SATURDAY_SCHEDULE,
  sunday: SUNDAY_SCHEDULE,
};
