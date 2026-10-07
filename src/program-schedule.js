// Weekly program schedule - recorder, time-zone handling and schedule builder.
//
// See weekly-program-schedule-notes.md for the full design. Short version:
//
//   1. Every cron cycle, each church seen live gets one "session" recorded
//      (keyed by church + the broadcast's real start time from YouTube, never
//      by when we happened to notice it - see recordProgramSessions).
//   2. When the admin opens the Weekly Schedule, buildProgramSchedule() groups
//      those sessions by church + weekday + start time, works out the pattern
//      (weekly / every other week / monthly "1st Saturday" / seen once), snaps
//      the typical start to a clean quarter hour, and works out the next
//      occurrence as a real UTC instant so the browser can show it in the
//      visitor's own time zone.
//
// Everything here is pure (no KV, no fetch) so it can be tested in Node with
// synthetic weeks of data. src/index.js owns the KV reads/writes.
//
// Sundays and Wednesdays (in the CHURCH's own local day) are deliberately never
// recorded - every church streams Sunday services and many stream Wednesday
// studies, so listing them would just be a wall of identical rows. The page
// shows a generic "Live Sunday Services" / "Live Midweek Services" line for
// those two days instead.

export const PROGRAM_SESSIONS_KV_KEY = 'program-sessions';
export const PROGRAM_OVERRIDES_KV_KEY = 'program-schedule-overrides';

// ~10 weeks, so a monthly program has at least two or three chances to repeat.
export const PROGRAM_SESSION_RETENTION_MS = 70 * 24 * 60 * 60 * 1000;
// A "program" that has been live longer than this is a 24/7 loop, a stuck
// broadcast or a multi-day conference, not a weekly study.
export const PROGRAM_MAX_SESSION_MS = 10 * 60 * 60 * 1000;
// If the first time we ever see a broadcast its start is already older than
// this, treat it as a long-running or stuck stream and ignore it.
export const PROGRAM_MAX_AGE_AT_FIRST_SIGHT_MS = 10 * 60 * 60 * 1000;
// Church-local weekdays never recorded: 0 = Sunday, 3 = Wednesday.
export const PROGRAM_SKIPPED_WEEKDAYS = [0, 3];
// Starts within this many minutes of each other (same church + weekday) are
// treated as the same program.
export const PROGRAM_CLUSTER_GAP_MIN = 30;
// Quarter-hour snapping: churches tend to go live a few minutes EARLY, rarely
// late, so the snap window around each quarter hour is skewed early.
// snapped = floor((minute + GRACE) / 15) * 15.  With 8, a stream that starts
// 6:52 to 7:06 reads as 7:00. Tunable once real start-time data is in.
export const PROGRAM_SNAP_EARLY_GRACE_MIN = 8;
// Used for "has this one lapsed?" (days since last seen), by pattern type.
const LAPSE_DAYS = { weekly: 21, biweekly: 35, monthly: 75, other: 21 };

// ---------------------------------------------------------------------------
// Time zone from a church's address / coordinates
// ---------------------------------------------------------------------------

const US_STATE_ZONE = {
  CT: 'America/New_York', DE: 'America/New_York', DC: 'America/New_York', GA: 'America/New_York',
  ME: 'America/New_York', MD: 'America/New_York', MA: 'America/New_York', NH: 'America/New_York',
  NJ: 'America/New_York', NY: 'America/New_York', NC: 'America/New_York', OH: 'America/New_York',
  PA: 'America/New_York', RI: 'America/New_York', SC: 'America/New_York', VT: 'America/New_York',
  VA: 'America/New_York', WV: 'America/New_York', FL: 'America/New_York', MI: 'America/Detroit',
  IN: 'America/Indiana/Indianapolis', KY: 'America/Kentucky/Louisville', TN: 'America/Chicago',
  AL: 'America/Chicago', AR: 'America/Chicago', IL: 'America/Chicago', IA: 'America/Chicago',
  LA: 'America/Chicago', MN: 'America/Chicago', MS: 'America/Chicago', MO: 'America/Chicago',
  OK: 'America/Chicago', WI: 'America/Chicago', KS: 'America/Chicago', NE: 'America/Chicago',
  ND: 'America/Chicago', SD: 'America/Chicago', TX: 'America/Chicago',
  CO: 'America/Denver', MT: 'America/Denver', NM: 'America/Denver', UT: 'America/Denver',
  WY: 'America/Denver', ID: 'America/Boise', AZ: 'America/Phoenix',
  CA: 'America/Los_Angeles', NV: 'America/Los_Angeles', OR: 'America/Los_Angeles',
  WA: 'America/Los_Angeles', AK: 'America/Anchorage', HI: 'Pacific/Honolulu',
  PR: 'America/Puerto_Rico', GU: 'Pacific/Guam'
};

const CA_PROVINCE_ZONE = {
  AB: 'America/Edmonton', BC: 'America/Vancouver', MB: 'America/Winnipeg', NB: 'America/Moncton',
  NL: 'America/St_Johns', NS: 'America/Halifax', NT: 'America/Yellowknife', NU: 'America/Iqaluit',
  ON: 'America/Toronto', PE: 'America/Halifax', QC: 'America/Toronto', SK: 'America/Regina',
  YT: 'America/Whitehorse'
};

// Single-zone countries (or the zone covering nearly all of the churches we
// have there). Multi-zone countries (Australia, Brazil, Mexico) are handled in
// zoneForCountryWithCoords below.
const COUNTRY_ZONES = [
  [/\b(united kingdom|england|scott?land|wales|northern ireland)\b|(^|[\s,])uk\b/i, 'Europe/London'],
  [/\bireland\b/i, 'Europe/Dublin'],
  [/\bgermany\b|deutschland/i, 'Europe/Berlin'],
  [/\bfrance\b/i, 'Europe/Paris'],
  [/\bitaly\b|italia/i, 'Europe/Rome'],
  [/\bspain\b|espa[nñ]a/i, 'Europe/Madrid'],
  [/\bportugal\b/i, 'Europe/Lisbon'],
  [/\bnetherlands\b|holland|\bnederland\b/i, 'Europe/Amsterdam'],
  [/\bbelgium\b|belgi[eë]/i, 'Europe/Brussels'],
  [/\bluxembourg\b/i, 'Europe/Luxembourg'],
  [/\bswitzerland\b/i, 'Europe/Zurich'],
  [/\baustria\b|[öo]sterreich/i, 'Europe/Vienna'],
  [/\bsweden\b/i, 'Europe/Stockholm'],
  [/\bnorway\b/i, 'Europe/Oslo'],
  [/\bdenmark\b/i, 'Europe/Copenhagen'],
  [/\bfinland\b|suomi/i, 'Europe/Helsinki'],
  [/\bpoland\b/i, 'Europe/Warsaw'],
  [/\bczech\b/i, 'Europe/Prague'],
  [/\bslovakia\b/i, 'Europe/Bratislava'],
  [/\bhungary\b|magyarorsz/i, 'Europe/Budapest'],
  [/\bromania\b/i, 'Europe/Bucharest'],
  [/\bbulgaria\b/i, 'Europe/Sofia'],
  [/\bgreece\b/i, 'Europe/Athens'],
  [/\bcyprus\b/i, 'Asia/Nicosia'],
  [/\bukraine\b/i, 'Europe/Kiev'],
  [/\bcroatia\b/i, 'Europe/Zagreb'],
  [/\bserbia\b/i, 'Europe/Belgrade'],
  [/\bturkey\b|t[üu]rkiye/i, 'Europe/Istanbul'],
  [/\bisrael\b/i, 'Asia/Jerusalem'],
  [/\blebanon\b/i, 'Asia/Beirut'],
  [/\bjordan\b/i, 'Asia/Amman'],
  [/\bjapan\b|\bprefecture\b|\b(okinawa|saitama)\b/i, 'Asia/Tokyo'],
  [/\bkorea\b/i, 'Asia/Seoul'],
  [/\bphilippines\b/i, 'Asia/Manila'],
  [/\bcambodia\b/i, 'Asia/Phnom_Penh'],
  [/\bthailand\b/i, 'Asia/Bangkok'],
  [/\bvietnam\b/i, 'Asia/Ho_Chi_Minh'],
  [/\bmalaysia\b/i, 'Asia/Kuala_Lumpur'],
  [/\bsingapore\b/i, 'Asia/Singapore'],
  [/\btaiwan\b/i, 'Asia/Taipei'],
  [/\bhong kong\b/i, 'Asia/Hong_Kong'],
  [/\bchina\b/i, 'Asia/Shanghai'],
  [/\bindia\b/i, 'Asia/Kolkata'],
  [/\bnepal\b/i, 'Asia/Kathmandu'],
  [/\bpakistan\b/i, 'Asia/Karachi'],
  [/\bbangladesh\b/i, 'Asia/Dhaka'],
  [/\bsri lanka\b/i, 'Asia/Colombo'],
  [/\bindonesia\b/i, 'Asia/Jakarta'],
  [/\bnew zealand\b/i, 'Pacific/Auckland'],
  [/\bkenya\b/i, 'Africa/Nairobi'],
  [/\buganda\b/i, 'Africa/Kampala'],
  [/\btanzania\b/i, 'Africa/Dar_es_Salaam'],
  [/\bethiopia\b/i, 'Africa/Addis_Ababa'],
  [/\brwanda\b/i, 'Africa/Kigali'],
  [/\bburundi\b/i, 'Africa/Bujumbura'],
  [/\bzambia\b/i, 'Africa/Lusaka'],
  [/\bzimbabwe\b/i, 'Africa/Harare'],
  [/\bmalawi\b/i, 'Africa/Blantyre'],
  [/\bmozambique\b/i, 'Africa/Maputo'],
  [/\bsouth africa\b/i, 'Africa/Johannesburg'],
  [/\bghana\b/i, 'Africa/Accra'],
  [/\bnigeria\b/i, 'Africa/Lagos'],
  [/\bliberia\b/i, 'Africa/Monrovia'],
  [/\bsierra leone\b/i, 'Africa/Freetown'],
  [/\bcameroon\b/i, 'Africa/Douala'],
  [/\begypt\b/i, 'Africa/Cairo'],
  [/\bmorocco\b/i, 'Africa/Casablanca'],
  [/\bcosta rica\b/i, 'America/Costa_Rica'],
  [/\bhonduras\b/i, 'America/Tegucigalpa'],
  [/\bbelize\b/i, 'America/Belize'],
  [/\bel salvador\b/i, 'America/El_Salvador'],
  [/\bguatemala\b/i, 'America/Guatemala'],
  [/\bnicaragua\b/i, 'America/Managua'],
  [/\bpanam[aá]\b/i, 'America/Panama'],
  [/\bcolombia\b/i, 'America/Bogota'],
  [/\becuador\b/i, 'America/Guayaquil'],
  [/\bperu\b/i, 'America/Lima'],
  [/\bbolivia\b/i, 'America/La_Paz'],
  [/\bvenezuela\b/i, 'America/Caracas'],
  [/\bchile\b/i, 'America/Santiago'],
  [/\bargentina\b/i, 'America/Argentina/Buenos_Aires'],
  [/\bparaguay\b/i, 'America/Asuncion'],
  [/\buruguay\b/i, 'America/Montevideo'],
  [/\bdominican republic\b/i, 'America/Santo_Domingo'],
  [/\bhaiti\b/i, 'America/Port-au-Prince'],
  [/\bjamaica\b/i, 'America/Jamaica'],
  [/\bcuba\b/i, 'America/Havana'],
  [/\bbahamas\b/i, 'America/Nassau']
];

function usStateFromText(raw) {
  const valid = US_STATE_ZONE;
  const mStrict = raw.match(/(?:^|[\s,])([A-Za-z]{2})\.?,?\s+\d{5}(?:-\d{4})?\??\s*$/);
  if (mStrict && valid[mStrict[1].toUpperCase()]) return mStrict[1].toUpperCase();
  const mZip = raw.match(/(?:^|[\s,])([A-Za-z]{2})\.?,?\s+\d{4,6}(?:-\d{4})?\??(?:,?\s*(?:usa|u\.s\.a\.?|united states))?\s*$/i);
  if (mZip && valid[mZip[1].toUpperCase()]) return mZip[1].toUpperCase();
  const mEnd = raw.match(/,\s*([A-Za-z]{2})\.?(?:,?\s*(?:usa|u\.s\.a\.?|united states))?\s*$/i);
  if (mEnd && valid[mEnd[1].toUpperCase()]) return mEnd[1].toUpperCase();
  if (/\bC\.A\.?\s+\d{5}/.test(raw)) return 'CA';
  return '';
}

function canadaProvinceFromText(raw) {
  const m = raw.match(/(?:^|[\s,])([A-Za-z]{2})\.?,?\s+[A-Za-z]\d[A-Za-z]\s?\d?[A-Za-z]?\d*\s*$/);
  if (m && CA_PROVINCE_ZONE[m[1].toUpperCase()]) return m[1].toUpperCase();
  // Province code followed by a postal code that isn't last ("Airdrie, AB
  // T4B 4H7, Canada"), or a bare province code next to the word Canada
  // ("Sidney, BC, Canada").
  const hasPostal = /[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d/.test(raw);
  if (hasPostal || /\bcanada\b/i.test(raw)) {
    const m2 = raw.match(/(?:^|[\s,])(AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)\b(?=[\s,.]|$)/);
    if (m2) return m2[1];
  }
  const names = [
    [/british columbia/i, 'BC'], [/alberta/i, 'AB'], [/saskatchewan/i, 'SK'], [/manitoba/i, 'MB'],
    [/ontario/i, 'ON'], [/qu[eé]bec/i, 'QC'], [/nova scotia/i, 'NS'], [/new brunswick/i, 'NB'],
    [/newfoundland/i, 'NL'], [/prince edward island/i, 'PE']
  ];
  for (const [re, code] of names) { if (re.test(raw)) return code; }
  return '';
}

// Splits inside a single US state, by coordinates. Only the handful of states
// that actually straddle a time-zone line need this; boundaries are approximate
// (county lines are ragged) but accurate for essentially every town.
function refineUsZone(state, lat, lng) {
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return US_STATE_ZONE[state];
  switch (state) {
    case 'TX': return lng < -104.9 ? 'America/Denver' : 'America/Chicago';
    case 'KS': return lng < -101.5 ? 'America/Denver' : 'America/Chicago';
    case 'NE': return lng < -101.0 ? 'America/Denver' : 'America/Chicago';
    case 'SD': return lng < -100.4 ? 'America/Denver' : 'America/Chicago';
    case 'ND': return (lng < -101.0 && lat < 47.7) ? 'America/Denver' : 'America/Chicago';
    case 'FL': return lng < -85.0 ? 'America/Chicago' : 'America/New_York';
    case 'IN':
      if ((lat > 41.3 && lng < -86.6) || (lat < 38.6 && lng < -86.7)) return 'America/Chicago';
      return 'America/New_York';
    case 'KY': return lng < -86.0 ? 'America/Chicago' : 'America/New_York';
    case 'TN': return (lng > -85.05 || (lat < 35.15 && lng > -85.4)) ? 'America/New_York' : 'America/Chicago';
    case 'MI': return (lat > 45.0 && lng < -87.55) ? 'America/Chicago' : 'America/New_York';
    case 'OR': return (lng > -117.3 && lat < 44.4) ? 'America/Denver' : 'America/Los_Angeles';
    case 'ID': return lat > 45.55 ? 'America/Los_Angeles' : 'America/Denver';
    case 'NV': return (lng > -114.3 && lat > 40.5) ? 'America/Denver' : 'America/Los_Angeles';
    default: return US_STATE_ZONE[state];
  }
}

function mexicoZone(raw, lat, lng) {
  if (/\b(baja california sur|b\.\s?c\.\s?s\.?|la paz|los cabos|cabo san lucas|san jos[eé] del cabo)\b/i.test(raw)) return 'America/Mazatlan';
  if (/\b(sonora|son\.|hermosillo|caborca|nogales|san luis r[ií]o colorado|guaymas)\b/i.test(raw)) return 'America/Hermosillo';
  if (/\b(b\.\s?c\.(?:c\.p\.)?|bcn|baja california|tijuana|mexicali|tecate|rosarito|ensenada|san felipe|san quint[ií]n|los algodones|vizcaino|primo tapia)\b/i.test(raw)) return 'America/Tijuana';
  if (/\b(ju[aá]rez)\b/i.test(raw)) return 'America/Ciudad_Juarez';
  if (/\b(quintana roo|canc[uú]n|playa del carmen|tulum|chetumal|cozumel)\b/i.test(raw)) return 'America/Cancun';
  return 'America/Mexico_City';
}

function australiaZone(lat, lng) {
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return 'Australia/Sydney';
  if (lng < 129) return 'Australia/Perth';
  if (lat > -26 && lng < 138) return 'Australia/Darwin';
  if (lng < 141 && lat < -26) return 'Australia/Adelaide';
  if (lat > -29 && lng >= 138) return 'Australia/Brisbane';
  return 'Australia/Sydney';
}

function brazilZone(lat, lng) {
  if (lng != null && !isNaN(lng) && lng < -60) return 'America/Manaus';
  return 'America/Sao_Paulo';
}

// Whole-hour, no-DST fallback straight from longitude. Only used when nothing
// in the address identifies the country; flagged as a guess by the caller.
function zoneFromLongitude(lng) {
  const hours = Math.max(-12, Math.min(12, Math.round(lng / 15)));
  if (hours === 0) return 'Etc/GMT';
  return 'Etc/GMT' + (hours > 0 ? '-' : '+') + Math.abs(hours);
}

// Returns { zone, guess } for a church record ({ citystatezip, lat, lng }).
// guess is true only when the zone came from the longitude fallback.
function rawChurchTimeZoneInfo(church) {
  const raw = String((church && church.citystatezip) || '').replace(/\s+/g, ' ').trim();
  const lat = church && church.lat != null && church.lat !== '' ? Number(church.lat) : null;
  const lng = church && church.lng != null && church.lng !== '' ? Number(church.lng) : null;
  const hasUsa = /\b(usa|u\.s\.a\.?|united states)\b/i.test(raw);

  const state = usStateFromText(raw);
  if (state) return { zone: refineUsZone(state, lat, lng), guess: false };

  if (!hasUsa) {
    if (/\bcanada\b/i.test(raw) || canadaProvinceFromText(raw)) {
      const prov = canadaProvinceFromText(raw);
      if (prov === 'ON' && lng != null && lng < -90.0) return { zone: 'America/Winnipeg', guess: false };
      if (prov) return { zone: CA_PROVINCE_ZONE[prov], guess: false };
      if (lng != null) return { zone: lng < -110 ? 'America/Vancouver' : (lng < -95 ? 'America/Winnipeg' : 'America/Toronto'), guess: true };
    }
    if (/\bm[eé]xico\b/i.test(raw) || /\b(b\.\s?c\.(?:c\.p\.)?|bcn|baja california|sonora|son\.|tijuana|mexicali|tecate|rosarito|ensenada|san felipe|caborca|san quint[ií]n|san luis r[ií]o colorado|los algodones|vizcaino|primo tapia)\b/i.test(raw)) {
      return { zone: mexicoZone(raw, lat, lng), guess: false };
    }
    if (/\baustralia\b/i.test(raw)) return { zone: australiaZone(lat, lng), guess: false };
    if (/\bbrazil\b|\bbrasil\b/i.test(raw)) return { zone: brazilZone(lat, lng), guess: false };
    for (const [re, zone] of COUNTRY_ZONES) {
      if (re.test(raw)) return { zone: zone, guess: false };
    }
    // UK postcode shape with no country word ("BD10 8SA").
    if (/(?:^|[\s,])[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2}\s*$/.test(raw)) return { zone: 'Europe/London', guess: false };
    // Mexican states written as abbreviations ("Mor.") with a 5-digit postcode.
    if (/\b\d{5}\b.*\b(mor|jal|gto|qro|pue|ver|oax|chis|yuc|nl|cdmx|edomex|mich|gro|sin|dgo|zac|ags|slp|tamps|coah|tab|camp|col|nay|hgo|tlax)\b\.?/i.test(raw)) {
      return { zone: 'America/Mexico_City', guess: true };
    }
  }
  // Nothing in the address names the country - fall back on coordinates, with
  // two boxes for places that observe daylight saving (central Europe, Israel)
  // so those don't land on a no-DST whole-hour guess.
  if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
    if (lat > 29 && lat < 34 && lng > 34 && lng < 36.5) return { zone: 'Asia/Jerusalem', guess: true };
    if (lat > 35 && lat < 70 && lng >= -1 && lng < 24) return { zone: 'Europe/Berlin', guess: true };
  }
  if (lng != null && !isNaN(lng)) return { zone: zoneFromLongitude(lng), guess: true };
  return { zone: null, guess: true };
}

function isValidZone(zone) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return true; } catch (e) { return false; }
}

// Same as above, but never hands back a zone name the runtime doesn't know
// (an unknown name would make Intl throw and take the whole cron cycle down).
export function churchTimeZoneInfo(church) {
  const info = rawChurchTimeZoneInfo(church);
  if (info.zone && !isValidZone(info.zone)) {
    const lng = church && church.lng != null && church.lng !== '' ? Number(church.lng) : NaN;
    return { zone: isNaN(lng) ? null : zoneFromLongitude(lng), guess: true };
  }
  return info;
}

export function churchTimeZone(church) {
  return churchTimeZoneInfo(church).zone;
}

// ---------------------------------------------------------------------------
// Local-time helpers (all built on Intl, which Workers and Node both support)
// ---------------------------------------------------------------------------

const fmtCache = {};
function formatterFor(tz) {
  if (!fmtCache[tz]) {
    fmtCache[tz] = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short'
    });
  }
  return fmtCache[tz];
}

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Wall-clock parts of an instant in a time zone. weekday: 0 = Sunday.
export function localParts(ms, tz) {
  const o = {};
  formatterFor(tz).formatToParts(new Date(ms)).forEach(function(p) { o[p.type] = p.value; });
  return {
    y: Number(o.year), m: Number(o.month), d: Number(o.day),
    h: Number(o.hour) % 24, min: Number(o.minute),
    weekday: WEEKDAY_INDEX[o.weekday]
  };
}

// The instant (ms since epoch) at which the wall clock in `tz` reads
// y-m-d h:min. Iterates because the offset itself depends on the instant
// (daylight saving).
export function wallToUtcMs(y, m, d, h, min, tz) {
  const target = Date.UTC(y, m - 1, d, h, min);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = localParts(guess, tz);
    const rendered = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
    const diff = rendered - target;
    if (diff === 0) break;
    guess -= diff;
  }
  return guess;
}

const DAY_MS = 86400000;
function dayNumber(y, m, d) { return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS); }
function fromDayNumber(n) {
  const dt = new Date(n * DAY_MS);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}
function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

// Which occurrence of its weekday a date is within its month: 1..5, and
// whether it is the last one ("last Saturday").
function weekdayOrdinal(y, m, d) {
  return { nth: Math.ceil(d / 7), isLast: d + 7 > daysInMonth(y, m) };
}

// Date of the nth (1..5) or last ('last') given weekday in a month, or null
// if that month doesn't have one (e.g. a 5th Saturday).
function nthWeekdayOfMonth(y, m, weekday, nth) {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const firstHit = 1 + ((weekday - first + 7) % 7);
  if (nth === 'last') {
    let d = firstHit;
    while (d + 7 <= daysInMonth(y, m)) d += 7;
    return d;
  }
  const d = firstHit + (nth - 1) * 7;
  return d <= daysInMonth(y, m) ? d : null;
}

export function snapToQuarterHour(minuteOfDay) {
  return Math.floor((minuteOfDay + PROGRAM_SNAP_EARLY_GRACE_MIN) / 15) * 15 % (24 * 60);
}

// ---------------------------------------------------------------------------
// Recorder
// ---------------------------------------------------------------------------

export function emptyProgramStore(nowMs) {
  return { since: new Date(nowMs).toISOString(), sessions: {}, diag: { noStartDate: 0, skippedSunWed: 0, skippedLongRunning: 0, noTimeZone: 0, lastCycleAt: null } };
}

// Folds this cycle's live entries into the store. `liveEntries` is the same
// liveOnly array the Live Now list is built from; `churchesById` maps church id
// to its record (for the time zone). Returns true if anything changed (so the
// caller can skip a pointless KV write).
//
// A session is identified by church + the broadcast's own start timestamp - NOT
// by video ID, because channels that reuse one persistent stream/video ID
// across services would otherwise collapse every week into one session. And the
// recorded start is YouTube's, not "when the cron noticed it", so a stream we
// first saw 20 minutes in is still logged at its real start.
export function recordProgramSessions(store, liveEntries, churchesById, nowMs) {
  if (!store.sessions) store.sessions = {};
  if (!store.diag) store.diag = { noStartDate: 0, skippedSunWed: 0, skippedLongRunning: 0, noTimeZone: 0, lastCycleAt: null };
  let changed = false;
  const nowIso = new Date(nowMs).toISOString();

  (liveEntries || []).forEach(function(e) {
    if (!e || !e.isLive) return;
    if (!e.startDate) {
      // Diagnostics below count SIGHTINGS (once per cron cycle a stream is
      // seen), not distinct streams, and never trigger a KV write on their
      // own - they just ride along with the next real change.
      store.diag.noStartDate++;
      return;
    }
    const startMs = Date.parse(e.startDate);
    if (isNaN(startMs) || startMs > nowMs + 5 * 60 * 1000) return;

    const startIso = new Date(startMs).toISOString();
    const key = e.churchId + '|' + startIso;
    const existing = store.sessions[key];
    const seenAtMs = e.lastCheckedAt ? Date.parse(e.lastCheckedAt) : nowMs;
    const seenIso = new Date(isNaN(seenAtMs) ? nowMs : Math.min(seenAtMs, nowMs)).toISOString();

    if (existing) {
      if (seenIso > existing.l) { existing.l = seenIso; changed = true; }
      if (e.title && e.title !== existing.t) { existing.t = e.title; changed = true; }
      return;
    }

    if (nowMs - startMs > PROGRAM_MAX_AGE_AT_FIRST_SIGHT_MS) {
      store.diag.skippedLongRunning++;
      return;
    }
    const church = churchesById[e.churchId];
    const info = church ? churchTimeZoneInfo(church) : { zone: null, guess: true };
    if (!info.zone) {
      store.diag.noTimeZone++;
      return;
    }
    const lp = localParts(startMs, info.zone);
    if (PROGRAM_SKIPPED_WEEKDAYS.indexOf(lp.weekday) !== -1) {
      store.diag.skippedSunWed++;
      return;
    }
    store.sessions[key] = {
      c: e.churchId,
      s: startIso,
      t: e.title || '',
      v: e.videoId || '',
      z: info.zone,
      g: info.guess ? 1 : 0,
      f: nowIso,
      l: seenIso
    };
    changed = true;
  });

  // Trim anything past retention.
  const cutoff = new Date(nowMs - PROGRAM_SESSION_RETENTION_MS).toISOString();
  Object.keys(store.sessions).forEach(function(k) {
    if (store.sessions[k].s < cutoff) { delete store.sessions[k]; changed = true; }
  });

  store.diag.lastCycleAt = nowIso;
  return changed;
}

// ---------------------------------------------------------------------------
// Schedule builder
// ---------------------------------------------------------------------------

function median(nums) {
  const a = nums.slice().sort(function(x, y) { return x - y; });
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

// Works out how a program repeats from the church-local DATES it was seen on.
// `occ` is a list of { day, nth, isLast } sorted by day, one per distinct date.
function classifyPattern(occ) {
  if (occ.length < 2) return { type: 'unknown' };
  const gaps = [];
  for (let i = 1; i < occ.length; i++) gaps.push(occ[i].day - occ[i - 1].day);
  const med = median(gaps);

  if (med >= 21) {
    // Monthly programs land on the same "nth weekday" each time (first
    // Saturday, third Thursday...) rather than a fixed number of days apart.
    if (gaps.every(function(g) { return g >= 25; })) {
      const nth0 = occ[0].nth;
      if (occ.every(function(o) { return o.nth === nth0; })) return { type: 'monthly', nth: nth0 };
      if (occ.every(function(o) { return o.isLast; })) return { type: 'monthly', nth: 'last' };
    }
    return { type: 'occasional' };
  }
  if (occ.length === 2) {
    if (gaps[0] <= 8) return { type: 'weekly' };
    // Two sightings 2 weeks apart is either "weekly with a missed week" or
    // "every other week" - not enough yet to say.
    return { type: 'unknown' };
  }
  if (med <= 10) return { type: 'weekly' };
  if (med >= 11 && med <= 17) return { type: 'biweekly' };
  return { type: 'occasional' };
}

function ordinalWord(n) { return n === 'last' ? 'last' : ['', '1st', '2nd', '3rd', '4th', '5th'][n]; }
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function patternLabel(p, weekday) {
  switch (p.type) {
    case 'weekly': return 'Weekly';
    case 'biweekly': return 'Every other week';
    case 'monthly': { const w = ordinalWord(p.nth) + ' ' + WEEKDAY_NAMES[weekday] + ' of the month'; return w.charAt(0).toUpperCase() + w.slice(1); }
    case 'occasional': return 'Occasional';
    default: return 'Seen once, pattern unknown';
  }
}

// The next real occurrence (UTC ms) of a program, counting from slightly in the
// past so a program that started an hour ago still shows as "today".
function nextOccurrenceMs(prog, nowMs) {
  const tz = prog.tz;
  const cutoff = nowMs - 4 * 60 * 60 * 1000;
  const h = Math.floor(prog.slotMin / 60);
  const mi = prog.slotMin % 60;
  const nowLocal = localParts(nowMs, tz);

  if (prog.pattern.type === 'monthly') {
    for (let i = 0; i < 15; i++) {
      const idx = (nowLocal.y * 12 + (nowLocal.m - 1)) + i;
      const y = Math.floor(idx / 12);
      const m = (idx % 12) + 1;
      const d = nthWeekdayOfMonth(y, m, prog.weekday, prog.pattern.nth);
      if (d == null) continue;
      const ms = wallToUtcMs(y, m, d, h, mi, tz);
      if (ms >= cutoff) return ms;
    }
    return null;
  }

  if (prog.pattern.type === 'biweekly') {
    let day = prog.lastDay;
    for (let i = 0; i < 40; i++) {
      const dt = fromDayNumber(day);
      const ms = wallToUtcMs(dt.y, dt.m, dt.d, h, mi, tz);
      if (ms >= cutoff) return ms;
      day += 14;
    }
    return null;
  }

  // weekly / unknown / occasional: the next date with the right weekday.
  const todayNum = dayNumber(nowLocal.y, nowLocal.m, nowLocal.d);
  for (let k = 0; k <= 8; k++) {
    const dt = fromDayNumber(todayNum + k);
    const wd = (nowLocal.weekday + k) % 7;
    if (wd !== prog.weekday) continue;
    const ms = wallToUtcMs(dt.y, dt.m, dt.d, h, mi, tz);
    if (ms >= cutoff) return ms;
  }
  return null;
}

export function programOverrideKey(churchId, weekday, slotMin) {
  return churchId + '|' + weekday + '|' + slotMin;
}

// Builds the full list of programs (hidden ones included, flagged) from the
// recorded sessions. churchesById supplies current names; overrides is the
// admin's hide/rename map ({ key: { hidden, title } }).
export function buildProgramSchedule(store, churchesById, overrides, nowMs) {
  overrides = overrides || {};
  const sessions = Object.keys((store && store.sessions) || {}).map(function(k) { return store.sessions[k]; });

  // church + church-local weekday -> sessions
  const groups = {};
  sessions.forEach(function(s) {
    const startMs = Date.parse(s.s);
    if (isNaN(startMs)) return;
    const endMs = Date.parse(s.l);
    if (!isNaN(endMs) && endMs - startMs > PROGRAM_MAX_SESSION_MS) return; // 24/7 loop, conference
    const lp = localParts(startMs, s.z);
    if (PROGRAM_SKIPPED_WEEKDAYS.indexOf(lp.weekday) !== -1) return;
    const rec = {
      title: s.t || '',
      startMs: startMs,
      minute: lp.h * 60 + lp.min,
      day: dayNumber(lp.y, lp.m, lp.d),
      ord: weekdayOrdinal(lp.y, lp.m, lp.d),
      weekday: lp.weekday,
      tz: s.z,
      guess: !!s.g
    };
    const gk = s.c + '|' + lp.weekday;
    (groups[gk] = groups[gk] || { churchId: s.c, weekday: lp.weekday, items: [] }).items.push(rec);
  });

  const programs = [];
  Object.keys(groups).forEach(function(gk) {
    const g = groups[gk];
    g.items.sort(function(a, b) { return a.minute - b.minute; });
    // Cluster by start time within the same weekday.
    const clusters = [];
    g.items.forEach(function(it) {
      const last = clusters[clusters.length - 1];
      if (last && it.minute - last[last.length - 1].minute <= PROGRAM_CLUSTER_GAP_MIN) last.push(it);
      else clusters.push([it]);
    });

    clusters.forEach(function(items) {
      // One occurrence per local date (earliest start that day).
      const byDay = {};
      items.forEach(function(it) {
        if (!byDay[it.day] || it.startMs < byDay[it.day].startMs) byDay[it.day] = it;
      });
      const occ = Object.keys(byDay).map(function(k) { return byDay[k]; }).sort(function(a, b) { return a.day - b.day; });
      const pattern = classifyPattern(occ.map(function(o) { return { day: o.day, nth: o.ord.nth, isLast: o.ord.isLast }; }));
      const medianMin = Math.round(median(occ.map(function(o) { return o.minute; })));
      const slotMin = snapToQuarterHour(medianMin);
      const first = occ[0];
      const latest = occ[occ.length - 1];
      const n = occ.length;

      // How steady is it? Weekly programs must show up in most of the weeks
      // between first and latest sighting; biweekly/monthly just need 3+.
      let status = 'new';
      if (n >= 2) status = 'emerging';
      if (n >= 3) {
        if (pattern.type === 'weekly') {
          const spanWeeks = (latest.day - first.day) / 7 + 1;
          if (n / spanWeeks >= 0.6) status = 'steady';
        } else if (pattern.type === 'biweekly' || pattern.type === 'monthly') {
          status = 'steady';
        }
      }

      const lapseDays = LAPSE_DAYS[pattern.type] || LAPSE_DAYS.other;
      const daysSinceLast = (nowMs - latest.startMs) / DAY_MS;
      const lapsed = n >= 2 && daysSinceLast > lapseDays;

      const titles = [];
      occ.slice().reverse().forEach(function(o) {
        if (o.title && titles.indexOf(o.title) === -1 && titles.length < 3) titles.push(o.title);
      });

      const church = churchesById[g.churchId];
      const prog = {
        key: programOverrideKey(g.churchId, g.weekday, slotMin),
        churchId: g.churchId,
        churchName: church ? church.name : ('Church #' + g.churchId),
        weekday: g.weekday,
        tz: first.tz,
        tzGuess: occ.some(function(o) { return o.guess; }),
        slotMin: slotMin,
        medianMin: medianMin,
        occurrences: n,
        pattern: pattern,
        patternLabel: patternLabel(pattern, g.weekday),
        status: status,
        lapsed: lapsed,
        firstSeen: new Date(first.startMs).toISOString(),
        lastSeen: new Date(latest.startMs).toISOString(),
        lastDay: latest.day,
        lastTitle: latest.title,
        titles: titles
      };
      const ov = overrides[prog.key] || {};
      prog.hidden = !!ov.hidden;
      prog.titleOverride = ov.title || '';
      prog.title = ov.title ? ov.title : latest.title;
      const nextMs = nextOccurrenceMs(prog, nowMs);
      prog.nextStartUtc = nextMs == null ? null : new Date(nextMs).toISOString();
      delete prog.lastDay;
      programs.push(prog);
    });
  });

  programs.sort(function(a, b) {
    if (a.weekday !== b.weekday) return a.weekday - b.weekday;
    if (a.slotMin !== b.slotMin) return a.slotMin - b.slotMin;
    return String(a.churchName).localeCompare(String(b.churchName));
  });
  return programs;
}
