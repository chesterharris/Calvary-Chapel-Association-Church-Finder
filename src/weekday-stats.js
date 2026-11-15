// Sunday / Wednesday "weekly stats" for the Live Now pane's Live Stream
// Activity section (see live-stream-detection-notes.md, "Weekly stats").
//
// Pure functions only - no KV, no fetch, no Date.now() - so every rule
// here can be tested with fake timestamps. src/index.js owns the KV
// reads/writes and calls into this file.
//
// THE RULES (all agreed with Larry):
//   * A "day" is a fixed Pacific-time day (America/Los_Angeles), NOT the
//     visitor's own local day, so every visitor sees the same Sunday.
//   * Only Pacific Sundays and Wednesdays are tracked. Nothing is recorded
//     on other days.
//   * Each tracked weekday keeps `current` (the most recent Sunday /
//     Wednesday: date, peak, 10-minute chart series) and `previous` (the
//     one before it: date + peak only, for the "Last Sunday" reference
//     line).
//   * "Zeroing out": the first sample that lands on a NEW Pacific Sunday
//     (or Wednesday) moves `current` into `previous` and starts `current`
//     empty. The visitor-facing view also treats "today is Sunday" as a
//     fresh empty day at 12:00 AM Pacific even before the first sample
//     arrives, so the old totals never linger into the new day.
//   * Peak = highest concurrent church count in a sample that day, ties
//     keep the earlier one (strict >, same rule as the all-time peak).
//   * Chart series = one point per 10-minute slice of the Pacific clock
//     (the highest count seen in that slice, plus the viewers at that
//     moment) - small enough to store forever, fine enough to chart.
//   * Backfill: if no records exist yet (first deploy) the same rules are
//     replayed over the 7-day samples already stored, so last Sunday and
//     Wednesday show up immediately. A day whose first stored sample is
//     well after Pacific midnight is flagged `partial` so the page can say
//     "partial day" instead of presenting it as a full day.
//
// Chart x-values are "minutes since Pacific midnight, by the Pacific wall
// clock" (0-1439). On the two DST-change days the repeated/skipped hour
// simply lands in the same/adjacent slice - never a crash, and Sundays are
// the day the change happens (first Sunday of November / second Sunday of
// March), so this is tested explicitly.

export const WEEKDAY_STATS_TZ = 'America/Los_Angeles';
export const WEEKDAY_STATS_DAYS = { sunday: 0, wednesday: 3 };
export const WEEKDAY_STATS_BUCKET_MIN = 10;
// A day whose first recorded sample is later than this many minutes after
// Pacific midnight is flagged `partial`.
export const WEEKDAY_STATS_PARTIAL_AFTER_MIN = 30;

const PACIFIC_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: WEEKDAY_STATS_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hourCycle: 'h23'
});
const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// ms-epoch -> { date: 'YYYY-MM-DD' (Pacific), weekday: 0-6 (0 = Sunday),
// minutes: 0-1439 on the Pacific wall clock }.
export function pacificParts(ms) {
  const parts = {};
  PACIFIC_FORMAT.formatToParts(new Date(ms)).forEach(function(p) { parts[p.type] = p.value; });
  let hour = parseInt(parts.hour, 10);
  if (hour === 24) hour = 0; // some engines report midnight as 24
  return {
    date: parts.year + '-' + parts.month + '-' + parts.day,
    weekday: WEEKDAY_INDEX[parts.weekday],
    minutes: hour * 60 + parseInt(parts.minute, 10)
  };
}

function keyForWeekday(weekday) {
  const keys = Object.keys(WEEKDAY_STATS_DAYS);
  for (let i = 0; i < keys.length; i++) {
    if (WEEKDAY_STATS_DAYS[keys[i]] === weekday) return keys[i];
  }
  return null;
}

// Folds ONE sample ({t, count, viewers}) into the records object and
// returns it (mutates and returns the same object; pass a parsed copy).
// Samples must arrive in chronological order; a sample dated before the
// stored `current` day (clock skew) is ignored rather than corrupting it.
export function updateWeekdayRecords(records, sample) {
  const out = (records && typeof records === 'object') ? records : {};
  if (!sample) return out;
  const ms = Date.parse(sample.t);
  if (isNaN(ms)) return out;
  const pp = pacificParts(ms);
  const key = keyForWeekday(pp.weekday);
  if (!key) return out;

  const count = typeof sample.count === 'number' && !isNaN(sample.count) ? sample.count : 0;
  const viewers = typeof sample.viewers === 'number' && !isNaN(sample.viewers) ? sample.viewers : 0;

  const rec = out[key] || (out[key] = { current: null, previous: null });
  if (rec.current && rec.current.date > pp.date) return out;

  if (!rec.current || rec.current.date !== pp.date) {
    // First sample of a new Sunday/Wednesday: last one becomes "previous",
    // this one's totals start from zero.
    if (rec.current && rec.current.peak) {
      rec.previous = {
        date: rec.current.date,
        peak: rec.current.peak,
        partial: !!rec.current.partial
      };
    }
    rec.current = {
      date: pp.date,
      peak: null,
      partial: pp.minutes > WEEKDAY_STATS_PARTIAL_AFTER_MIN,
      buckets: {}
    };
  }

  const cur = rec.current;
  if (!cur.peak || count > cur.peak.count) {
    cur.peak = { count: count, viewers: viewers, t: sample.t };
  }
  const idx = String(Math.floor(pp.minutes / WEEKDAY_STATS_BUCKET_MIN));
  const existing = cur.buckets[idx];
  if (!existing || count > existing[0] || (count === existing[0] && viewers > existing[1])) {
    cur.buckets[idx] = [count, viewers];
  }
  return out;
}

// Replays stored samples (chronological) through the same rules - used for
// the first-deploy backfill and by the public view.
export function seedWeekdayRecords(samples) {
  const records = {};
  (Array.isArray(samples) ? samples : []).forEach(function(s) {
    updateWeekdayRecords(records, s);
  });
  return records;
}

// What the cron cycle stores. `samples` is the full (already trimmed)
// sample array with this cycle's sample LAST. No records yet -> backfill
// from all the samples; otherwise just fold in the newest one.
export function nextWeekdayRecords(existing, samples) {
  if (!existing || typeof existing !== 'object') return seedWeekdayRecords(samples);
  const list = Array.isArray(samples) ? samples : [];
  if (!list.length) return existing;
  return updateWeekdayRecords(existing, list[list.length - 1]);
}

// Builds what the page shows for each tracked weekday, as of `nowMs`:
//   { date, isToday, peak, partial, series: [{m, count, viewers}],
//     last: { date, peak, partial } | null }
// `records` is what the cron stored (may be null); `samples` are the
// stored 7-day samples, used to fill in anything the records don't have
// yet (so the page is right on the very first load after a deploy,
// before any cron cycle has written the records). Read-only.
export function buildWeekdayViews(records, samples, nowMs) {
  const today = pacificParts(nowMs);
  const seeded = seedWeekdayRecords(samples);
  const views = {};

  Object.keys(WEEKDAY_STATS_DAYS).forEach(function(key) {
    const byDate = {};
    function absorb(entry) {
      if (!entry || !entry.date) return;
      const prior = byDate[entry.date] || {};
      byDate[entry.date] = {
        date: entry.date,
        peak: entry.peak || prior.peak || null,
        partial: entry.peak ? !!entry.partial : !!prior.partial,
        buckets: entry.buckets || prior.buckets || null
      };
    }
    // Seeded first, stored records second - the stored ones win because
    // they've been accumulating for longer than the 7-day sample window.
    [seeded[key], records && records[key]].forEach(function(rec) {
      if (!rec) return;
      absorb(rec.previous);
      absorb(rec.current);
    });

    const dates = Object.keys(byDate).filter(function(d) { return d <= today.date; }).sort().reverse();
    const isTodayTracked = today.weekday === WEEKDAY_STATS_DAYS[key];
    let targetDate = null;
    if (isTodayTracked) targetDate = today.date;
    else if (dates.length) targetDate = dates[0];

    const target = targetDate ? byDate[targetDate] : null;
    let lastEntry = null;
    for (let i = 0; i < dates.length; i++) {
      if (targetDate === null || dates[i] < targetDate) { lastEntry = byDate[dates[i]]; break; }
    }

    const series = [];
    if (target && target.buckets) {
      Object.keys(target.buckets)
        .map(function(k) { return parseInt(k, 10); })
        .sort(function(a, b) { return a - b; })
        .forEach(function(idx) {
          const b = target.buckets[String(idx)];
          series.push({ m: idx * WEEKDAY_STATS_BUCKET_MIN, count: b[0], viewers: b[1] });
        });
    }

    views[key] = {
      date: targetDate,
      isToday: isTodayTracked,
      peak: target ? target.peak : null,
      partial: target ? !!target.partial : false,
      series: series,
      last: lastEntry ? { date: lastEntry.date, peak: lastEntry.peak, partial: !!lastEntry.partial } : null
    };
  });
  return views;
}
