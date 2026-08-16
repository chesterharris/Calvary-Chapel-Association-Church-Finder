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

// Pulls out each "<strong>2026 Some Conference:</strong> details... <a href=...>link</a>"
// style entry from the raw page HTML. Matching is intentionally loose (based on
// text patterns, not specific CSS classes) so small markup changes on the source
// site don't silently break the whole feed.
function parseConferences(html) {
  const results = [];
  const re = /<strong>\s*([^<]+?)\s*<\/strong>\s*:?\s*([\s\S]*?)(?=<strong>|<\/p>|$)/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const rawTitle = decodeEntities(match[1]).trim();
    if (!/^\d{4}\b/.test(rawTitle)) continue; // keep only entries that start with a year

    const rawDetail = match[2] || '';
    const linkMatch = rawDetail.match(/<a\s[^>]*href="([^"]+)"/i);
    const link = linkMatch ? linkMatch[1] : null;
    const detail = stripTags(rawDetail).replace(/\s*\|\s*(more info|register now|email now|email to register)\s*$/i, '').trim();

    results.push({
      title: rawTitle.replace(/:$/, ''),
      detail: detail,
      link: link
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
