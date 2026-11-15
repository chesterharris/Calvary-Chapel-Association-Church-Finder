// Reads the live "watching now" (concurrent viewers) number out of a
// YouTube watch page's HTML. Pure function, no network - kept in its own
// file so it can be tested against saved page snippets.
//
// WHY THIS EXISTS AS A TOLERANT READER (2026-11-15): the original
// one-line regex in checkChurchLive required "originalViewCount" to come
// IMMEDIATELY after `"isLive":true`. Around Nov 9-10 2026 YouTube started
// putting two extra fields between them -
//   "isLive":true,"extraShortViewCount":{"simpleText":"22"},
//   "entityKey":"...","originalViewCount":"22"
// - so the regex matched nothing on every page: every live church came
// back with viewCount null, the Live Now "View count" sort disabled
// itself, and the Live Stream Activity "watching" totals fell to 0.
// Nobody had changed our code; YouTube changed its page. The reader below
// survives that kind of change by trying three progressively looser
// readings of the SAME renderer (always anchored on the
// videoViewCountRenderer that says "isLive":true, never the lifetime
// videoDetails.viewCount, never a sidebar video):
//   1. originalViewCount after any number of other simple fields
//      (strings / booleans / numbers / small flat objects),
//   2. originalViewCount anywhere inside this one renderer, never crossing
//      into the next renderer ("videoViewCountRenderer"/"videoActions"),
//   3. the visible text itself ("1,234 watching now"), which is what a
//      person would read.
// Returns a number, or null if none of the three finds one (the caller
// already treats null as "unknown", exactly as before).

const RENDERER_ANCHOR = /"videoViewCountRenderer":\{"viewCount":\{"runs":\[((?:\{"text":"[^"]*"\},?)+)\]\},"isLive":true/g;
const ORIGINAL_AFTER_SIMPLE_FIELDS = /^(?:,"[A-Za-z]+":(?:\{[^{}]*\}|"[^"]*"|true|false|-?\d+))*,"originalViewCount":"(\d+)"/;
const RENDERER_LOOKAHEAD_CHARS = 1500;

export function extractConcurrentViewers(html) {
  if (!html || typeof html !== 'string') return null;
  RENDERER_ANCHOR.lastIndex = 0;
  let m;
  while ((m = RENDERER_ANCHOR.exec(html)) !== null) {
    const runsJson = m[1];
    const after = html.slice(RENDERER_ANCHOR.lastIndex, RENDERER_ANCHOR.lastIndex + RENDERER_LOOKAHEAD_CHARS);

    const strict = ORIGINAL_AFTER_SIMPLE_FIELDS.exec(after);
    if (strict) return Number(strict[1]);

    const idx = after.indexOf('"originalViewCount":"');
    if (idx !== -1) {
      const before = after.slice(0, idx);
      if (before.indexOf('"videoViewCountRenderer"') === -1 && before.indexOf('"videoActions"') === -1) {
        const digits = /^"originalViewCount":"(\d+)"/.exec(after.slice(idx));
        if (digits) return Number(digits[1]);
      }
    }

    const text = [];
    runsJson.replace(/"text":"([^"]*)"/g, function(_, t) { text.push(t); return ''; });
    const shown = /^\s*([\d,]+)\s*watching/i.exec(text.join(''));
    if (shown) {
      const n = Number(shown[1].replace(/,/g, ''));
      if (!isNaN(n)) return n;
    }
  }
  return null;
}
