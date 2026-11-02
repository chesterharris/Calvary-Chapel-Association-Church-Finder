// Hand-transcribed from KRTM's published Program Schedule page
// (http://www.krtmradio.org/schedule.shtml) on 2026-11-01. KRTM (Aledo, TX)
// is a Live365 internet station; KTWD (Wallace, ID, 103.5 FM) simulcasts it,
// so one schedule serves the KTWD station entry. See
// radio-station-published-schedule-notes.md for the format and the lookup.
//
// Why a schedule at all: KRTM's own now-playing feeds are meaningless (its
// nowplaying.json is a frozen filler entry and the Live365 API loops a
// station-ID bumper) - see radio-station-providers-notes-consolidated.md.
//
// How the source page stores times: every row has a data-utc epoch for the
// SAME reference day (2026-10-05, a Monday) and the page's script converts it
// to the viewer's local time. 07:00 UTC on that day is 12:00 AM Pacific
// (PDT), so the rows below are those instants shown in America/Los_Angeles.
// Pacific is an ASSUMPTION about the station's own clock (Larry is in Pacific
// time and asked to try it); nothing on the page names a zone. If the on-air
// program ever runs an hour off from this table, change `timezone` below
// (the schedule is DST-aware, so a Pacific wall clock stays correct all year).
//
// Judgment calls made while transcribing:
// 1) Monday-Friday are byte-for-byte identical on the source page, so there
//    is one `weekday` list and no weekdayOverridesByDay.
// 2) The source lists "To Every Man an Answer - Live Broadcast Live Call-In:
//    (phone number)" on both the 3:00 and 3:30 PM rows. Shortened to "To
//    Every Man an Answer (Live)" and kept as ONE entry at 3:00 PM (a program
//    airs until the next start marker, so the 3:30 row is redundant).
// 3) A program airs until the next start marker. Where the source skips a
//    half hour (e.g. weekday 3:00 AM, 7:00 PM; Saturday 8:00 AM, 3:00 PM;
//    Sunday 6:00 PM) the earlier program is simply shown through the gap.
//    Not confirmed, same convention as every other schedule here.
// 4) "Mike Macintosh" on the source is spelled "Mike MacIntosh" here, the
//    same spelling WJWD uses for the same Chapter & Verse host.
export const KRTM_SCHEDULE = {
  timezone: 'America/Los_Angeles',

  weekday: [
    { time: '00:00', program: 'The Word For Today', host: 'Chuck Smith' },
    { time: '00:30', program: 'Somebody Loves You', host: 'Raul Ries' },
    { time: '01:00', program: 'A Daily Walk', host: 'John Randall' },
    { time: '01:30', program: 'Turning Point', host: 'David Jeremiah' },
    { time: '02:00', program: 'Chapter & Verse', host: 'Mike MacIntosh' },
    { time: '02:30', program: 'A New Beginning', host: 'Greg Laurie' },
    { time: '03:30', program: 'Lasting Truth', host: 'Ryan Houssein' },
    { time: '04:00', program: 'Real Radio', host: 'Jack Hibbs' },
    { time: '04:30', program: 'Cross Walk', host: 'Steve Whinery' },
    { time: '05:00', program: 'Running To Win', host: 'Erwin Lutzer' },
    { time: '05:30', program: 'Family Talk', host: 'Dr. James Dobson' },
    { time: '06:00', program: 'Turning Point', host: 'David Jeremiah' },
    { time: '06:30', program: 'Somebody Loves You', host: 'Raul Ries' },
    { time: '07:00', program: 'Apply Within', host: 'Bob Davis' },
    { time: '07:30', program: 'The Word For Today', host: 'Chuck Smith' },
    { time: '08:00', program: 'Nourish Your Biblical Roots', host: 'Yael Eckstein' },
    { time: '08:30', program: 'A New Beginning', host: 'Greg Laurie' },
    { time: '09:00', program: 'Truth For Life', host: 'Alistair Begg' },
    { time: '09:30', program: 'A Daily Walk', host: 'John Randall' },
    { time: '10:00', program: '66/40', host: 'Chuck Missler' },
    { time: '10:30', program: 'Light on the Hill', host: 'James Kaddis' },
    { time: '11:00', program: 'Ask Pastor Mike Live', host: 'Mike Fabarez' },
    { time: '11:30', program: 'Cross Examined', host: 'Frank Turek' },
    { time: '12:00', program: 'The Word For Today', host: 'Chuck Smith' },
    { time: '12:30', program: 'The Power of Hope', host: 'Shane Gray' },
    { time: '13:00', program: 'Experiencing Real Life', host: 'Troy Brewer' },
    { time: '13:30', program: 'Family Talk', host: 'Dr. James Dobson' },
    { time: '14:00', program: 'Destined For Victory', host: 'Paul Sheppard' },
    { time: '14:30', program: 'Running To Win', host: 'Erwin Lutzer' },
    { time: '15:00', program: 'To Every Man an Answer (Live)', host: 'Mike Kestler' },
    { time: '16:00', program: 'Real Radio', host: 'Jack Hibbs' },
    { time: '16:30', program: 'Lasting Truth', host: 'Ryan Houssein' },
    { time: '17:00', program: 'Somebody Loves You', host: 'Raul Ries' },
    { time: '17:30', program: 'A New Beginning', host: 'Greg Laurie' },
    { time: '18:00', program: 'The Word For Today', host: 'Chuck Smith' },
    { time: '18:30', program: 'Chapter & Verse', host: 'Mike MacIntosh' },
    { time: '19:30', program: 'Focal Point', host: 'Mike Fabarez' },
    { time: '20:00', program: 'Destined For Victory', host: 'Paul Sheppard' },
    { time: '20:30', program: 'Cross Walk', host: 'Steve Whinery' },
    { time: '21:00', program: 'The Word For Today', host: 'Chuck Smith' },
    { time: '21:30', program: 'Nourish Your Biblical Roots', host: 'Yael Eckstein' },
    { time: '22:00', program: 'Apply Within', host: 'Bob Davis' },
    { time: '22:30', program: 'A New Beginning', host: 'Greg Laurie' },
    { time: '23:00', program: 'Daily Devotional', host: 'Dorothy Bennett' },
    { time: '23:15', program: 'Quest for God', host: 'Richard Bennett' },
    { time: '23:30', program: '66/40', host: 'Chuck Missler' }
  ],

  saturday: [
    { time: '00:00', program: 'The Word For Today Sunday Services', host: 'Chuck Smith' },
    { time: '01:00', program: 'A Daily Walk', host: 'John Randall' },
    { time: '01:30', program: 'Turning Point', host: 'David Jeremiah' },
    { time: '02:00', program: 'Dwight Thompson Ministries', host: 'Dwight Thompson' },
    { time: '02:30', program: 'A New Beginning', host: 'Greg Laurie' },
    { time: '03:00', program: 'Understanding the Times', host: 'Jan Markell' },
    { time: '04:00', program: 'The Invisible War', host: 'Rob Randall' },
    { time: '04:30', program: 'Focal Point', host: 'Mike Fabarez' },
    { time: '05:00', program: 'Crossover Radio', host: 'Erik Tribble' },
    { time: '05:30', program: 'Issues in Education', host: 'Bob & Geri Boyd' },
    { time: '06:00', program: 'Choose Life', host: 'Dr. Sharon May' },
    { time: '06:30', program: 'The Power of Hope', host: 'Shane Gray' },
    { time: '07:00', program: 'The Word For Today', host: 'Chuck Smith' },
    { time: '07:30', program: 'Real Radio', host: 'Jack Hibbs' },
    { time: '09:30', program: 'A Daily Walk', host: 'John Randall' },
    { time: '10:00', program: 'Understanding the Times', host: 'Jan Markell' },
    { time: '11:00', program: 'Cross Examined', host: 'Frank Turek' },
    { time: '11:30', program: 'Choose Life', host: 'Dr. Sharon May' },
    { time: '12:00', program: 'The Word For Today', host: 'Chuck Smith' },
    { time: '12:30', program: 'Crossover Radio', host: 'Erik Tribble' },
    { time: '13:00', program: 'Remnant Wire Radio', host: 'Shannon Scholten Adams' },
    { time: '14:00', program: 'All Things Possible', host: 'Victor Marx' },
    { time: '14:30', program: 'Issues in Education', host: 'Bob & Geri Boyd' },
    { time: '16:00', program: 'Experiencing Real Life', host: 'Troy Brewer' },
    { time: '16:30', program: 'Family Talk', host: 'Dr. James Dobson' },
    { time: '17:00', program: 'The Word For Today', host: 'Chuck Smith' },
    { time: '18:00', program: 'Answers for Today', host: 'Terry Reynolds' },
    { time: '18:30', program: 'Agape Radio', host: 'Terry Reynolds' },
    { time: '19:00', program: 'The Invisible War', host: 'Rob Randall' },
    { time: '19:30', program: 'Focal Point', host: 'Mike Fabarez' },
    { time: '20:30', program: 'A New Beginning', host: 'Greg Laurie' },
    { time: '21:00', program: 'The Word For Today Sunday Services', host: 'Chuck Smith' },
    { time: '22:00', program: 'Understanding the Times', host: 'Jan Markell' },
    { time: '23:00', program: 'Light on the Hill', host: 'James Kaddis' },
    { time: '23:30', program: 'Somebody Loves You', host: 'Raul Ries' }
  ],

  sunday: [
    { time: '00:00', program: 'The Word For Today', host: 'Chuck Smith' },
    { time: '00:30', program: 'The Power of Hope', host: 'Shane Gray' },
    { time: '01:00', program: 'A Daily Walk', host: 'John Randall' },
    { time: '01:30', program: 'Worship Life Today', host: 'Holland Davis' },
    { time: '02:30', program: 'A New Beginning', host: 'Greg Laurie' },
    { time: '03:00', program: 'The Dacus Report', host: 'Brad Dacus' },
    { time: '03:30', program: 'Destined For Victory', host: 'Paul Sheppard' },
    { time: '04:30', program: 'Real Radio', host: 'Jack Hibbs' },
    { time: '05:00', program: 'All Things Possible', host: 'Victor Marx' },
    { time: '05:30', program: 'Bless Israel', host: 'Yael Eckstein' },
    { time: '06:30', program: 'Crossover Radio', host: 'Erik Tribble' },
    { time: '07:00', program: 'The Word For Today', host: 'Chuck Smith' },
    { time: '07:30', program: 'Somebody Loves You', host: 'Raul Ries' },
    { time: '08:00', program: 'The Moody Church Hour', host: 'Philip Miller' },
    { time: '09:30', program: 'Focal Point', host: 'Mike Fabarez' },
    { time: '10:00', program: 'Answers for Today', host: 'Terry Reynolds' },
    { time: '10:30', program: 'Truth For Life', host: 'Alistair Begg' },
    { time: '11:00', program: 'The Word For Today Sunday Services', host: 'Chuck Smith' },
    { time: '12:00', program: 'All Things Possible', host: 'Victor Marx' },
    { time: '12:30', program: 'Pleasing God', host: 'Kay Smith' },
    { time: '13:30', program: 'Remnant Wire Radio', host: 'Shannon Scholten Adams' },
    { time: '14:00', program: 'Destined For Victory', host: 'Paul Sheppard' },
    { time: '14:30', program: 'A New Beginning', host: 'Greg Laurie' },
    { time: '15:00', program: 'Real Radio', host: 'Jack Hibbs' },
    { time: '16:00', program: 'Choose Life', host: 'Dr. Sharon May' },
    { time: '16:30', program: 'Issues in Education', host: 'Bob & Geri Boyd' },
    { time: '17:00', program: 'The Word For Today', host: 'Chuck Smith' },
    { time: '19:00', program: 'The Word For Today Sunday Services', host: 'Chuck Smith' },
    { time: '20:00', program: 'The Dacus Report', host: 'Brad Dacus' },
    { time: '20:30', program: 'All Things Possible', host: 'Victor Marx' },
    { time: '21:00', program: 'The Invisible War', host: 'Rob Randall' },
    { time: '22:00', program: 'Understanding the Times', host: 'Jan Markell' },
    { time: '23:00', program: 'Answers for Today', host: 'Terry Reynolds' }
  ]
};
