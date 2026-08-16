// Cloudflare Pages Function
// Deployed URL: https://<your-site>.pages.dev/conferences
//
// Runs server-side (not in the visitor's browser), so it isn't subject to the
// browser CORS restriction that blocks a direct fetch from the map page to
// calvarycca.org. It fetches the conferences page, pulls out each conference
// entry, and returns clean JSON for the ticker to consume.
//
// Cached at the edge for 6 hours (CACHE_SECONDS) so we're not hitting
// calvarycca.org on every single page load - just re-scraping periodically.

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
    // Only keep entries that look like conference listings (they all start with a year).
    if (!/^\d{4}\b/.test(rawTitle)) continue;

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

export async function onRequestGet(context) {
  const cache = caches.default;
  const cacheKey = new Request(context.request.url, context.request);
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
    context.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (err) {
    // Return a 200 with an empty list rather than an error - the front end's own
    // FALLBACK_CONFERENCES will kick in when it sees zero conferences.
    const body = JSON.stringify({
      conferences: [],
      error: err.message,
      source: SOURCE_URL,
      fetchedAt: new Date().toISOString()
    });
    return new Response(body, { headers: jsonHeaders });
  }
}
