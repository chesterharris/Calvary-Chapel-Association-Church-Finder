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

const MAX_DETAIL_LENGTH = 220; // safety net in case a match runs long

// Pulls out each "<strong>2026 Some Conference:</strong> details... <a href=...>link text</a>"
// style entry from the raw page HTML. Matching is intentionally loose (based on
// text patterns, not specific CSS classes) so small markup changes on the source
// site don't silently break the whole feed. Any link found inside an entry is
// kept separately (href + its own visible text) so the front end can make just
// that link text clickable, rather than the whole entry.
function parseConferences(rawHtml) {
  const html = stripScriptsAndStyles(rawHtml);
  const results = [];
  // Stop the detail capture at the next <strong>, a closing </p>, or the start
  // of another script/style tag (belt-and-suspenders alongside the stripping above).
  const re = /<strong>\s*([^<]+?)\s*<\/strong>\s*:?\s*([\s\S]*?)(?=<strong>|<\/p>|<script|<style|$)/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const rawTitle = decodeEntities(match[1]).trim();
    if (!/^\d{4}\b/.test(rawTitle)) continue; // keep only entries that start with a year
    if (rawTitle.length > 120) continue; // real titles are short; long ones are mismatches

    const rawDetail = (match[2] || '').slice(0, 4000); // cap input size before processing
    const linkMatch = rawDetail.match(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const link = linkMatch ? linkMatch[1] : null;
    const linkText = linkMatch ? stripTags(linkMatch[2]) : null;

    // Remove the anchor itself from the detail text so it isn't duplicated,
    // then strip remaining tags for the plain-text portion.
    const detailWithoutLink = linkMatch ? rawDetail.replace(linkMatch[0], '') : rawDetail;
    let detail = stripTags(detailWithoutLink)
      .replace(/\s*\|\s*$/, '')
      .trim();

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
  const cacheKey = new Request(request.url, request);
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
