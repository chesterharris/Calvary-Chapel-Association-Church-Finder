// Cloudflare Worker (with static assets)
//
// Handles two things:
//   1. Any request to /conferences -> scrapes calvarycca.org server-side and
//      returns clean JSON for the ticker (not subject to browser CORS rules,
//      since this runs on Cloudflare's servers, not in the visitor's browser).
//   2. Everything else -> served from the /public folder (your map's index.html
//      and any other static files) via the ASSETS binding.
//
// Edge-cached for 6 hours so we're not re-scraping calvarycca.org on every load.

const SOURCE_URL = 'https://calvarycca.org/conferences/';
const CACHE_SECONDS = 6 * 60 * 60; // 6 hours

// Bump this any time parseConferences() (or anything it depends on) changes.
// The cache key includes this version, so a fix is never masked by an old
// cached response sitting around from before the fix - it's a brand new
// cache key, not a hit against the stale one.
const CACHE_VERSION = 2;

const ENTITY_MAP = {
  '&amp;': '&', '&nbsp;': ' ', '&quot;': '"', '&#039;': "'", '&apos;': "'",
  '&#8211;': '\u2013', '&#8212;': '\u2014', '&#8216;': '\u2018', '&#8217;': '\u2019',
  '&#8220;': '\u201c', '&#8221;': '\u201d', '&#8230;': '\u2026',
  '&ndash;': '\u2013', '&mdash;': '\u2014', '&lsquo;': '\u2018', '&rsquo;': '\u2019',
  '&ldquo;': '\u201c', '&rdquo;': '\u201d', '&hellip;': '\u2026'
};

function decodeEntities(str) {
  return str.replace(/&#?\w+;/g, function(match) {
    if (ENTITY_MAP[match]) return ENTITY_MAP[match];
    const numeric = match.match(/^&#(\d+);$/);
    if (numeric) return String.fromCharCode(parseInt(numeric[1], 10));
    return match;
  });
}

function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

// Removes entire <script>...</script> and <style>...</style> blocks - code and
// all - not just the tags. Without this, embedded JS text (e.g. from analytics
// or emoji-support snippets WordPress injects inline) can leak into the parsed
// text as if it were page content.
function stripScriptsAndStyles(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
}

// Finds the exact <div> that holds the conference listings (identified by two
// stable class tokens seen in its opening tag) and returns only what's inside
// it - by scanning matching <div>/</div> pairs rather than just searching for
// nearby text. This means content sitting after the last conference but still
// inside the page (leftover scripts, footer nav, etc.) can never be included,
// because it's structurally outside this div, not just "far from a landmark."
function extractConferenceListDiv(html) {
  const openTagRe = /<div\b[^>]*class="([^"]*)"[^>]*>/gi;
  let m;
  let startIdx = -1;
  let afterOpenTag = -1;
  while ((m = openTagRe.exec(html)) !== null) {
    const classAttr = m[1];
    if (classAttr.includes('flex_column_div') && classAttr.includes('avia-builder-el-2')) {
      startIdx = m.index;
      afterOpenTag = openTagRe.lastIndex;
      break;
    }
  }
  if (startIdx === -1) return null; // marker div not found - caller will fall back

  const tagRe = /<div\b[^>]*>|<\/div>/gi;
  tagRe.lastIndex = afterOpenTag;
  let depth = 1;
  let match;
  while ((match = tagRe.exec(html)) !== null) {
    if (match[0].toLowerCase() === '</div>') {
      depth--;
      if (depth === 0) {
        return html.slice(startIdx, tagRe.lastIndex);
      }
    } else {
      depth++;
    }
  }
  return html.slice(startIdx); // unbalanced markup - take everything from the start point onward
}

// Fallback used only if the specific div above can't be found (e.g. the site's
// markup changes). Bounds the search using nearby heading/footer text instead -
// looser than the div-scan above, but still much safer than searching the
// whole page.
function extractByLandmarks(html) {
  const startPatterns = [/Regional Conferences/i, /Upcoming Conferences/i, /<h1[^>]*>\s*Conferences/i];
  const endPatterns = [/Scroll to top/i, /©\s*\d{4}/i, /<footer\b/i];

  let startIdx = -1;
  for (const p of startPatterns) {
    const m = html.match(p);
    if (m && m.index !== undefined) { startIdx = m.index; break; }
  }
  let endIdx = -1;
  for (const p of endPatterns) {
    const m = html.match(p);
    if (m && m.index !== undefined && (endIdx === -1 || m.index < endIdx)) endIdx = m.index;
  }

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return html.slice(startIdx, endIdx);
  }
  return html; // couldn't find landmarks either - fall back to searching the whole page
}

function extractContentRegion(html) {
  return extractConferenceListDiv(html) || extractByLandmarks(html);
}

// Detail text should read like a date/location line, never like code. If it
// contains obvious programming tokens, something went wrong upstream (a
// mismatched tag boundary, an unstripped script fragment, etc.) - better to
// drop that one entry than show junk in the ticker.
const CODE_SMELL = /function\s*\(|=>|\bwindow\.|\bdocument\.|\bvar\s+\w+\s*=|\bconst\s+\w+\s*=|sessionStorage|querySelector|getElementById/i;

const MAX_DETAIL_LENGTH = 220; // safety net in case a match runs long

// Pulls out each "<strong>2026 Some Conference:</strong> details... <a href=...>link text</a>"
// style entry from the raw page HTML. Matching is intentionally loose (based on
// text patterns, not specific CSS classes) so small markup changes on the source
// site don't silently break the whole feed. Any link found inside an entry is
// kept separately (href + its own visible text) so the front end can make just
// that link text clickable, rather than the whole entry.
function parseConferences(rawHtml) {
  const html = extractContentRegion(stripScriptsAndStyles(rawHtml));
  const results = [];
  // Stop the detail capture at the next <strong>, a closing </p> or </div>, or
  // the start of another script/style tag (belt-and-suspenders alongside the
  // stripping and div-scoping above).
  const re = /<strong>\s*([^<]+?)\s*<\/strong>\s*:?\s*([\s\S]*?)(?=<strong>|<\/p>|<\/div>|<script|<style|$)/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const rawTitle = decodeEntities(match[1]).trim();
    if (!/^\d{4}\b/.test(rawTitle)) continue; // keep only entries that start with a year
    if (rawTitle.length > 120) continue; // real titles are short; long ones are mismatches
    if (CODE_SMELL.test(rawTitle)) continue;

    const rawDetail = (match[2] || '').slice(0, 4000); // cap input size before processing
    const linkMatch = rawDetail.match(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const link = linkMatch ? linkMatch[1] : null;
    const linkText = linkMatch ? stripTags(linkMatch[2]) : null;

    // Remove the anchor itself from the detail text so it isn't duplicated,
    // then strip remaining tags for the plain-text portion.
    const detailWithoutLink = linkMatch ? rawDetail.replace(linkMatch[0], '') : rawDetail;
    let detail = stripTags(detailWithoutLink)
      .replace(/\s*\|\s*$/, '')
      .replace(/^:\s*/, '') // some entries have the colon in a nested <span> rather than right after </strong>
      .trim();

    if (CODE_SMELL.test(detail)) continue; // discard the whole entry rather than show junk

    if (detail.length > MAX_DETAIL_LENGTH) detail = detail.slice(0, MAX_DETAIL_LENGTH).trim() + '\u2026';

    results.push({
      title: rawTitle.replace(/:$/, '').slice(0, 120),
      detail: detail,
      link: link,
      linkText: linkText
    });
  }
  return results;
}

async function handleConferences(request, ctx) {
  const cache = caches.default;
  const cacheUrl = new URL(request.url);
  cacheUrl.searchParams.set('cacheVersion', String(CACHE_VERSION));
  const cacheKey = new Request(cacheUrl.toString(), request);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const jsonHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=' + CACHE_SECONDS
  };

  try {
    const pageRes = await fetch(SOURCE_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CCA-Map-Ticker/1.0)' }
    });
    if (!pageRes.ok) throw new Error('Source site returned ' + pageRes.status);

    const html = await pageRes.text();
    const conferences = parseConferences(html);
    if (!conferences.length) throw new Error('Parsed zero conference entries');

    const body = JSON.stringify({
      conferences: conferences,
      source: SOURCE_URL,
      fetchedAt: new Date().toISOString()
    });
    const response = new Response(body, { headers: jsonHeaders });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (err) {
    const body = JSON.stringify({
      conferences: [],
      error: err.message,
      source: SOURCE_URL,
      fetchedAt: new Date().toISOString()
    });
    return new Response(body, { headers: jsonHeaders });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/conferences') {
      return handleConferences(request, ctx);
    }
    return env.ASSETS.fetch(request);
  }
};
