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

import { jwtVerify, createRemoteJWKSet } from 'jose';

const SOURCE_URL = 'https://calvarycca.org/conferences/';
const CACHE_SECONDS = 6 * 60 * 60; // 6 hours

// ---- Admin login (Google Sign-In) ----
//
// Flow: the browser gets a signed ID token from Google, POSTs it to
// /api/verify-admin. We verify the token's signature against Google's public
// keys (so it can't be forged), then check the email inside it against
// env.ADMIN_EMAIL (a Worker secret - never hardcoded, never logged). If it
// matches, we hand back our own short-lived signed session cookie so the
// browser doesn't have to re-run the Google flow on every request.
//
// This is deliberately NOT tied to hiding any features yet - right now it
// only lets the frontend know "yes, this visitor is the admin" so it can
// show a badge. Real feature-gating (hiding Add/Manage/Delete from non-admins)
// is a separate future step, and when that happens it should also check
// this same session server-side rather than trusting the browser.

const SESSION_COOKIE = 'cca_admin_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

function base64UrlEncode(bytes) {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecodeToBytes(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

// Builds "<payload>.<signature>", both base64url. Payload is just
// { email, exp } - no secrets live in the cookie itself, only the signature
// proves we issued it.
async function signSession(payload, secret) {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const payloadB64 = base64UrlEncode(payloadBytes);
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  const sigB64 = base64UrlEncode(new Uint8Array(sig));
  return payloadB64 + '.' + sigB64;
}

// Returns the parsed payload if the signature is valid and it hasn't
// expired, otherwise null. Never throws.
async function verifySession(token, secret) {
  if (!token || !token.includes('.')) return null;
  const [payloadB64, sigB64] = token.split('.');
  try {
    const key = await hmacKey(secret);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlDecodeToBytes(sigB64),
      new TextEncoder().encode(payloadB64)
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecodeToBytes(payloadB64)));
    if (!payload.exp || Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch (err) {
    return null;
  }
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const match = header.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[1]) : null;
}

async function isAdminRequest(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  const payload = await verifySession(token, env.SESSION_SECRET);
  return !!(payload && payload.email && env.ADMIN_EMAIL && payload.email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase());
}

async function handleVerifyAdmin(request, env) {
  const cors = { 'Content-Type': 'application/json' };
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return new Response(JSON.stringify({ isAdmin: false, error: 'Bad request body' }), { status: 400, headers: cors });
  }

  const idToken = body && body.token;
  if (!idToken) {
    return new Response(JSON.stringify({ isAdmin: false, error: 'Missing token' }), { status: 400, headers: cors });
  }

  if (!env.GOOGLE_CLIENT_ID || !env.ADMIN_EMAIL || !env.SESSION_SECRET) {
    // Misconfigured Worker - fail closed, never treat this as "admin".
    return new Response(JSON.stringify({ isAdmin: false, error: 'Server not configured' }), { status: 500, headers: cors });
  }

  let payload;
  try {
    const result = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: env.GOOGLE_CLIENT_ID
    });
    payload = result.payload;
  } catch (err) {
    // Token didn't verify (forged, expired, wrong audience, etc.) - not admin.
    return new Response(JSON.stringify({ isAdmin: false }), { status: 200, headers: cors });
  }

  const email = (payload.email || '').toLowerCase();
  const isAdmin = !!(payload.email_verified && email === env.ADMIN_EMAIL.toLowerCase());

  if (!isAdmin) {
    return new Response(JSON.stringify({ isAdmin: false }), { status: 200, headers: cors });
  }

  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const session = await signSession({ email, exp }, env.SESSION_SECRET);

  const setCookie = `${SESSION_COOKIE}=${encodeURIComponent(session)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
  return new Response(JSON.stringify({ isAdmin: true }), {
    status: 200,
    headers: { ...cors, 'Set-Cookie': setCookie }
  });
}

async function handleWhoAmI(request, env) {
  const admin = await isAdminRequest(request, env);
  return new Response(JSON.stringify({ isAdmin: admin }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

function handleLogout() {
  const clearCookie = `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearCookie }
  });
}

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

// ---- Church data (Workers KV) ----
//
// All church records live in KV under a single key, "churches", as one JSON
// array. The public map reads this via GET /api/churches. The admin panel
// writes to it via POST (add/edit) and DELETE, both gated behind the same
// isAdminRequest() check used elsewhere in this file.
//
// IDs are permanent and never reused, even after a delete - see
// getNextChurchId() below. This matters because Edit/Delete/Save all target
// a record by its id, and a reused id could silently operate on the wrong
// church later.

const CHURCHES_KV_KEY = 'churches';

async function loadChurches(env) {
  const raw = await env.CHURCHES_KV.get(CHURCHES_KV_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function saveChurches(env, churches) {
  await env.CHURCHES_KV.put(CHURCHES_KV_KEY, JSON.stringify(churches));
}

// Next id is always one past the highest id currently in use - ids only ever
// go forward, so a deleted church's old id is retired permanently rather
// than being handed out again.
function getNextChurchId(churches) {
  let maxId = 0;
  for (const c of churches) {
    if (typeof c.id === 'number' && c.id > maxId) maxId = c.id;
  }
  return maxId + 1;
}

async function handleGetChurches(request, env) {
  const churches = await loadChurches(env);
  return new Response(JSON.stringify(churches), {
    headers: {
      'Content-Type': 'application/json',
      // Data changes any time the admin saves, so don't let browsers or CDNs
      // cache this - always ask KV fresh.
      'Cache-Control': 'no-store'
    }
  });
}

async function handleSaveChurch(request, env) {
  if (!(await isAdminRequest(request, env))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let incoming;
  try {
    incoming = await request.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Bad request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!incoming || typeof incoming !== 'object' || !incoming.name) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const churches = await loadChurches(env);

  if (incoming.id != null) {
    // Editing an existing record - id must already exist.
    const index = churches.findIndex(c => c.id === incoming.id);
    if (index === -1) {
      return new Response(JSON.stringify({ error: 'Church id not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    churches[index] = { ...churches[index], ...incoming };
  } else {
    // Adding a new record - assign the next permanent id ourselves; never
    // trust an id the client might have sent for a "new" record.
    const newChurch = { ...incoming, id: getNextChurchId(churches) };
    churches.push(newChurch);
  }

  await saveChurches(env, churches);

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleDeleteChurch(request, env) {
  if (!(await isAdminRequest(request, env))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Bad request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!body || typeof body.id !== 'number') {
    return new Response(JSON.stringify({ error: 'Missing id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const churches = await loadChurches(env);
  const filtered = churches.filter(c => c.id !== body.id);

  if (filtered.length === churches.length) {
    return new Response(JSON.stringify({ error: 'Church id not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  await saveChurches(env, filtered);

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// ---- YouTube live-stream detection ----
//
// A Cron Trigger (see wrangler config) calls checkAllChurchesLive() on a
// fixed schedule (proposed: every 10 minutes), independent of site
// traffic. Results are cached in KV under LIVE_STATUS_KV_KEY. Visitors'
// page loads only ever read that cache via handleGetLiveStatus() - no
// visitor page load ever triggers a real YouTube request.
//
// Detection method (confirmed empirically - see
// live-stream-detection-notes.md): fetch a channel's "/live" shorthand
// URL. If currently live, the raw HTML contains schema.org structured
// data: `<meta itemprop="isLiveBroadcast" content="True">`. If not live,
// that block is entirely absent. The canonical link and startDate are
// pulled from the same response for the video id and "live since" time.

const LIVE_STATUS_KV_KEY = 'live-status';

// Accepts whatever format an admin pasted into youtubeUrl - a bare
// @handle URL, a /streams URL, a /videos URL, or a /channel/UC... URL -
// and returns the correct "/live" URL to check.
function buildLiveCheckUrl(youtubeUrl) {
  let url = youtubeUrl.trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  url = url.replace(/\/(streams|videos|featured|community|about)\/?$/i, '');
  url = url.replace(/\/+$/, '');
  return url + '/live';
}

async function checkChurchLive(youtubeUrl) {
  const liveUrl = buildLiveCheckUrl(youtubeUrl);
  const response = await fetch(liveUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CCAFinderBot/1.0)' }
  });
  const html = await response.text();

  const isLive = html.includes('itemprop="isLiveBroadcast" content="True"');
  if (!isLive) return { isLive: false };

  const canonicalMatch = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([^"]+)">/);
  const startDateMatch = html.match(/itemprop="startDate" content="([^"]+)"/);
  const titleMatch = html.match(/<meta property="og:title" content="([^"]*)">/);
  const descriptionMatch = html.match(/<meta property="og:description" content="([^"]*)">/);
  const authorMatch = html.match(/"author":"([^"]*)"/);
  const viewCountMatch = html.match(/"viewCount":"(\d+)"/);

  return {
    isLive: true,
    videoId: canonicalMatch ? canonicalMatch[1] : null,
    startDate: startDateMatch ? startDateMatch[1] : null,
    title: titleMatch ? titleMatch[1] : null,
    description: descriptionMatch ? descriptionMatch[1] : null,
    author: authorMatch ? authorMatch[1] : null,
    viewCount: viewCountMatch ? Number(viewCountMatch[1]) : null
  };
}

// Runs on the Cron Trigger schedule. Checks every livestreamsEnabled
// church and writes the combined results to KV as one JSON blob.
async function checkAllChurchesLive(env) {
  const churches = await loadChurches(env);
  const candidates = churches.filter(function(c) { return c.livestreamsEnabled && c.youtubeUrl; });

  const results = await Promise.all(candidates.map(async function(c) {
    try {
      const status = await checkChurchLive(c.youtubeUrl);
      return Object.assign({ churchId: c.id, name: c.name }, status);
    } catch (err) {
      // A single church failing to fetch (network hiccup, YouTube rate
      // limit, etc.) shouldn't block results for everyone else.
      return { churchId: c.id, name: c.name, isLive: false, error: true };
    }
  }));

  const liveOnly = results.filter(function(r) { return r.isLive; });

  await env.CHURCHES_KV.put(LIVE_STATUS_KV_KEY, JSON.stringify({
    checkedAt: new Date().toISOString(),
    live: liveOnly
  }));
}

// Public, read-only endpoint - just returns whatever the last cron run
// cached. No YouTube requests happen here; safe to call on every page
// load.
async function handleGetLiveStatus(request, env) {
  const raw = await env.CHURCHES_KV.get(LIVE_STATUS_KV_KEY);
  const data = raw ? JSON.parse(raw) : { checkedAt: null, live: [] };
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}

// Admin-only. Manually runs the same check the Cron Trigger runs
// automatically, so live status can be tested immediately after deploy
// without waiting up to 10 minutes for the real schedule to fire.
async function handleDebugCheckLiveNow(request, env) {
  if (!(await isAdminRequest(request, env))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  await checkAllChurchesLive(env);
  const raw = await env.CHURCHES_KV.get(LIVE_STATUS_KV_KEY);
  return new Response(raw || '{}', {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
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
    if (url.pathname === '/api/verify-admin' && request.method === 'POST') {
      return handleVerifyAdmin(request, env);
    }
    if (url.pathname === '/api/whoami') {
      return handleWhoAmI(request, env);
    }
    if (url.pathname === '/api/logout' && request.method === 'POST') {
      return handleLogout();
    }
    if (url.pathname === '/api/churches' && request.method === 'GET') {
      return handleGetChurches(request, env);
    }
    if (url.pathname === '/api/churches' && request.method === 'POST') {
      return handleSaveChurch(request, env);
    }
    if (url.pathname === '/api/churches' && request.method === 'DELETE') {
      return handleDeleteChurch(request, env);
    }
    if (url.pathname === '/api/live-status' && request.method === 'GET') {
      return handleGetLiveStatus(request, env);
    }
    if (url.pathname === '/api/debug/check-live-now' && request.method === 'POST') {
      return handleDebugCheckLiveNow(request, env);
    }
    return env.ASSETS.fetch(request);
  },

  // Fired automatically by the Cron Trigger defined in wrangler config
  // (proposed schedule: every 10 minutes). Not tied to any visitor
  // request - runs on Cloudflare's own schedule regardless of site
  // traffic.
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(checkAllChurchesLive(env));
  }
};
