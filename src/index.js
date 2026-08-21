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

// Safely decodes a raw JSON string's escape sequences (\", \\, \n, \uXXXX,
// etc.) when we've pulled that string's contents out via regex rather than
// a full JSON.parse of the surrounding (often huge, not-fully-valid-as-one-
// object) page script. Wrapping in quotes and handing it back to JSON.parse
// is a simple, correct way to reuse the platform's own escape handling
// instead of reimplementing it.
function decodeJsonString(raw) {
  try {
    return JSON.parse('"' + raw + '"');
  } catch (err) {
    return raw;
  }
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
const LIVE_CHECK_STAGGER_STATE_KV_KEY = 'live-check-stagger-state';

// Starting point for the delay between each church's fetch in a cron run.
// YouTube's anti-bot rate limiting kicks in fast on bursts of requests
// (confirmed in testing: a 429 after just a couple of fetches in quick
// succession), so checks are sent one at a time with a gap instead of all
// at once via Promise.all.
//
// IMPORTANT: there is no published, trustworthy number for "how much delay
// is enough" - this isn't a documented rate limit, it's anti-bot heuristics
// on YouTube's end, and Cloudflare Workers share a small pool of egress IPs
// across ALL Workers customers (confirmed via Cloudflare's own community
// forum), so the threshold that matters isn't just our own request rate -
// it includes however much other, unrelated traffic happens to be sharing
// our egress IP at a given moment. No fixed constant can be "correct" for
// that. So instead of guessing a single number, the delay is adaptive: it
// grows automatically when a cycle sees rate-limit errors, and eases back
// down slowly during clean runs. Bounds below are the starting guess and
// the safety ceiling, not a claim about the true threshold.
// Three named tiers: 1000ms healthy baseline -> 2000ms after a rough cycle
// -> 8000ms worst case. Growth doubles each bad cycle (1000 -> 2000 -> 4000
// -> 8000), so the tiers land on clean, round numbers instead of drifting.
const LIVE_CHECK_STAGGER_MIN_MS = 1000;
const LIVE_CHECK_STAGGER_MAX_MS = 8000;
const LIVE_CHECK_STAGGER_DEFAULT_MS = 1000;
const LIVE_CHECK_STAGGER_GROWTH_FACTOR = 2;   // applied on a bad cycle
const LIVE_CHECK_STAGGER_DECAY_FACTOR = 0.9;  // applied on a fully clean cycle
const LIVE_CHECK_ERROR_RATE_THRESHOLD = 0.15; // >15% errored triggers growth

// If a single fetch gets rate-limited (429) or otherwise fails, retry once
// after a short pause before giving up on that church for this cycle.
const LIVE_CHECK_RETRY_DELAY_MS = 1500;

function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

async function loadStaggerState(env) {
  const raw = await env.CHURCHES_KV.get(LIVE_CHECK_STAGGER_STATE_KV_KEY);
  if (!raw) return { staggerMs: LIVE_CHECK_STAGGER_DEFAULT_MS };
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.staggerMs === 'number' && !isNaN(parsed.staggerMs)) {
      return parsed;
    }
  } catch (err) {
    // Fall through to default on any parse issue - safer to under-guess
    // than to carry forward corrupted state.
  }
  return { staggerMs: LIVE_CHECK_STAGGER_DEFAULT_MS };
}

// Adjusts the stagger delay based on how the just-finished cycle went, and
// persists it for the next cron run to read. Errs on the side of caution:
// growth is faster (1.6x) than decay (0.9x), so a single bad cycle raises
// the delay noticeably, while trust is rebuilt gradually only after
// several fully clean cycles in a row.
function nextStaggerMs(currentMs, checked, errored) {
  if (checked === 0) return currentMs;
  const errorRate = errored / checked;
  let next = currentMs;
  if (errorRate > LIVE_CHECK_ERROR_RATE_THRESHOLD) {
    next = currentMs * LIVE_CHECK_STAGGER_GROWTH_FACTOR;
  } else if (errorRate === 0) {
    next = currentMs * LIVE_CHECK_STAGGER_DECAY_FACTOR;
  }
  // Otherwise (some errors, but under the threshold): hold steady rather
  // than adjusting on a small, possibly-noisy sample.
  return Math.max(LIVE_CHECK_STAGGER_MIN_MS, Math.min(LIVE_CHECK_STAGGER_MAX_MS, Math.round(next)));
}

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

async function fetchLivePage(liveUrl) {
  const response = await fetch(liveUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CCAFinderBot/1.0)' }
  });
  if (!response.ok) {
    throw new Error('Live page fetch failed with status ' + response.status);
  }
  return response.text();
}

// Wraps fetchLivePage with a single retry after a short backoff. Most
// failures here are transient YouTube rate-limiting (429s), not permanent
// errors, so one retry recovers the majority of cases without materially
// slowing down the cron run.
async function fetchLivePageWithRetry(liveUrl) {
  try {
    return await fetchLivePage(liveUrl);
  } catch (err) {
    await sleep(LIVE_CHECK_RETRY_DELAY_MS);
    return fetchLivePage(liveUrl);
  }
}

async function checkChurchLive(youtubeUrl) {
  const liveUrl = buildLiveCheckUrl(youtubeUrl);
  const html = await fetchLivePageWithRetry(liveUrl);

  // IMPORTANT: itemprop="isLiveBroadcast" (schema.org) turned out to mark
  // "this video is a livestream-type broadcast" as a category - true for
  // scheduled/upcoming streams and old past broadcasts too, NOT just
  // ones airing right now. Confirmed via real production false positives
  // (churches with startDate days in the future, and years-old test
  // videos, both showing isLiveBroadcast=True). The stricter, real-time
  // signal is the internal videoDetails JSON field below, which was
  // verified via actual diffed LIVE vs NOT-LIVE test files to be
  // completely ABSENT (not just false) on a genuinely not-live page.
  const isLive = html.includes('"isLive":true');
  if (!isLive) return { isLive: false };

  // Loosely matched on purpose: only require the href value itself, not an
  // exact immediate ">" after it. YouTube's markup for this tag isn't
  // perfectly consistent across channels/pages (self-closing "/>", other
  // attributes after href, etc.) - a stricter match here was silently
  // failing for at least one real church's page, leaving videoId null and
  // producing a broken thumbnail on the frontend even though the church
  // really was live.
  // Loosely matched on purpose: only require the href value itself, not an
  // exact immediate ">" after it. YouTube's markup for this tag isn't
  // perfectly consistent across channels/pages (self-closing "/>", other
  // attributes after href, etc.).
  const canonicalMatch = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([^"&]+)"/);
  const startDateMetaMatch = html.match(/itemprop="startDate" content="([^"]+)"/);
  const titleMetaMatch = html.match(/<meta property="og:title" content="([^"]*)">/);
  const descriptionMetaMatch = html.match(/<meta property="og:description" content="([^"]*)">/);
  const authorMatch = html.match(/"author":"([^"]*)"/);
  const viewCountMatch = html.match(/"viewCount":"(\d+)"/);
  const uploadDateMetaMatch = html.match(/itemprop="(?:datePublished|uploadDate)" content="([^"]+)"/);

  // Fallback source: the page's embedded videoDetails/microformat JSON.
  // Confirmed via a real production case (Calvary Chapel Gresham) where the
  // <meta>/<link>/itemprop tags above were ALL absent, yet the church was
  // genuinely live - author (matched above via its own JSON field) still
  // came through fine, meaning this JSON blob was present and reliable even
  // though the page's <head> tags weren't. "videoId" is consistently the
  // first key inside the videoDetails object, so anchoring on that object
  // (rather than a bare "videoId" match, which could hit an unrelated
  // recommended-video ID elsewhere on the page) keeps this specific to the
  // actual broadcast.
  const videoIdJsonMatch = html.match(/"videoDetails":\{"videoId":"([a-zA-Z0-9_-]{11})"/);
  const titleJsonMatch = html.match(/"videoDetails":\{"videoId":"[a-zA-Z0-9_-]{11}","title":"((?:[^"\\]|\\.)*)"/);
  const descriptionJsonMatch = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
  const startDateJsonMatch = html.match(/"liveBroadcastDetails":\{"isLiveNow":true,"startTimestamp":"([^"]+)"/);
  const uploadDateJsonMatch = html.match(/"publishDate":"([^"]+)"/);

  const videoId = canonicalMatch ? canonicalMatch[1] : (videoIdJsonMatch ? videoIdJsonMatch[1] : null);
  const title = titleMetaMatch ? titleMetaMatch[1] : (titleJsonMatch ? decodeJsonString(titleJsonMatch[1]) : null);
  const description = descriptionMetaMatch ? descriptionMetaMatch[1] : (descriptionJsonMatch ? decodeJsonString(descriptionJsonMatch[1]) : null);
  const startDate = startDateMetaMatch ? startDateMetaMatch[1] : (startDateJsonMatch ? startDateJsonMatch[1] : null);
  const uploadDate = uploadDateMetaMatch ? uploadDateMetaMatch[1] : (uploadDateJsonMatch ? uploadDateJsonMatch[1] : null);

  // Belt-and-suspenders: if a startDate is present and is still in the
  // future, this is a scheduled/upcoming stream, not a live one, whatever
  // the isLive field said.
  if (startDate) {
    const startTime = new Date(startDate).getTime();
    if (!isNaN(startTime) && startTime > Date.now()) {
      return { isLive: false };
    }
  }

  // Second real-world false-positive pattern found in production: a
  // broadcast that was never properly "ended" on YouTube's side can stay
  // flagged isLive:true indefinitely, even years later, with nobody
  // actually streaming (confirmed via real results: a 2021 video, several
  // "test" videos, all with viewCount 0). A genuinely-live-right-now
  // video was just published, so require the video's publish date to be
  // recent - this is the strongest signal we've found so far for telling
  // "actually live" apart from "stuck live" without needing to inspect
  // the actual video stream data itself.
  const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
  if (uploadDate) {
    const publishedTime = new Date(uploadDate).getTime();
    if (!isNaN(publishedTime) && (Date.now() - publishedTime) > RECENT_WINDOW_MS) {
      return { isLive: false };
    }
  }

  return {
    isLive: true,
    videoId: videoId,
    startDate: startDate,
    title: title,
    description: description,
    author: authorMatch ? authorMatch[1] : null,
    viewCount: viewCountMatch ? Number(viewCountMatch[1]) : null
  };
}

// Runs on the Cron Trigger schedule. Checks every livestreamsEnabled
// church and writes the combined results to KV as one JSON blob.
//
// Two changes from the original Promise.all version, both aimed at the
// same root cause (YouTube rate-limiting a burst of near-simultaneous
// fetches from the same Worker, which previously wiped the whole live
// list to empty for a cycle):
//
// 1. Churches are checked one at a time with a stagger delay between
//    each, instead of all at once - this is what actually keeps request
//    volume to YouTube low enough to avoid tripping the rate limit in
//    the first place.
// 2. If a church's fetch still fails after the retry in
//    fetchLivePageWithRetry, we fall back to whatever that church's
//    status was on the PREVIOUS successful cycle, rather than forcing
//    isLive: false. A transient rate-limit blip on one church now just
//    means slightly stale data for that one church, not a false "nobody
//    is live" result for everyone.
async function checkAllChurchesLive(env) {
  const churches = await loadChurches(env);
  const candidates = churches.filter(function(c) { return c.livestreamsEnabled && c.youtubeUrl; });

  const previousRaw = await env.CHURCHES_KV.get(LIVE_STATUS_KV_KEY);
  const previous = previousRaw ? JSON.parse(previousRaw) : { live: [] };
  const previousById = {};
  previous.live.forEach(function(r) { previousById[r.churchId] = r; });

  const staggerState = await loadStaggerState(env);
  const staggerMs = staggerState.staggerMs;

  let erroredCount = 0;
  const results = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    try {
      const status = await checkChurchLive(c.youtubeUrl);
      results.push(Object.assign({ churchId: c.id, name: c.name }, status));
    } catch (err) {
      // Both the original fetch and the retry failed - fall back to the
      // last known-good status for this church instead of assuming it
      // went offline. If we've never seen this church live before, this
      // is just an ordinary "not live" result.
      erroredCount++;
      const prior = previousById[c.id];
      if (prior) {
        results.push(Object.assign({}, prior, { stale: true }));
      } else {
        results.push({ churchId: c.id, name: c.name, isLive: false, error: true });
      }
    }

    // Stagger requests to YouTube instead of firing them all at once.
    // Skip the delay after the last item - no need to wait once we're done.
    if (i < candidates.length - 1) {
      await sleep(staggerMs);
    }
  }

  const liveOnly = results.filter(function(r) { return r.isLive; });

  await env.CHURCHES_KV.put(LIVE_STATUS_KV_KEY, JSON.stringify({
    checkedAt: new Date().toISOString(),
    live: liveOnly,
    // Cycle-level stats for observability - lets us see the *actual*,
    // empirical error rate for our own traffic over time in KV, rather
    // than guessing at what YouTube's threshold is. Check this after
    // deploying instead of assuming the stagger delay is "enough."
    stats: {
      checked: candidates.length,
      errored: erroredCount,
      staggerMsUsed: staggerMs
    }
  }));

  // Adjust the delay for next cycle based on how this one went, and
  // persist it. This is what replaces the old fixed-guess constant -
  // the delay grows on its own if error rates climb, and only eases back
  // down after cycles come back fully clean.
  const updatedStaggerMs = nextStaggerMs(staggerMs, candidates.length, erroredCount);
  if (updatedStaggerMs !== staggerMs) {
    await env.CHURCHES_KV.put(LIVE_CHECK_STAGGER_STATE_KV_KEY, JSON.stringify({
      staggerMs: updatedStaggerMs,
      updatedAt: new Date().toISOString(),
      reason: erroredCount / Math.max(candidates.length, 1) > LIVE_CHECK_ERROR_RATE_THRESHOLD
        ? 'error-rate-above-threshold'
        : 'clean-cycle-decay'
    }));
  }
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

// ---- Radio "Now Playing" ticker ----
//
// Same overall shape as the Conference ticker above (edge-cached JSON,
// graceful per-item failure) but sourced from each station's own streaming
// platform instead of scraping an HTML page. Cache TTL is deliberately much
// shorter than Conferences (20s vs 6 hours) - now-playing data changes
// every few minutes, while conference listings barely change at all.

const RADIO_CACHE_SECONDS = 60;
const RADIO_CACHE_VERSION = 1;

// Config-driven station list. Adding a new station is just adding one entry
// here (assuming it's on a provider already handled by RADIO_PROVIDERS below;
// see the note there for what's involved in adding a new provider).
//
//   displayName - what visitors see in the ticker. May differ from the
//                 station's own internal/technical call sign - e.g. Dove FM
//                 is set up internally as "DOVEMAIN", but should never show
//                 that publicly.
//   provider    - key into RADIO_PROVIDERS below; decides how we fetch/parse
//                 this station's now-playing data, and which of the
//                 provider-specific fields below apply.
//   streamUrl   - the actual raw audio stream URL the mini-player plays.
//                 Required for every provider.
//
//   SecureNetSystems stations also need:
//   subdomain   - the streamdbXweb.securenetsystems.net host serving this
//                 station's now-playing XML feed.
//   callSign    - the technical station identifier used in the now-playing
//                 XML endpoint's URL path (NOT necessarily the same as
//                 displayName - see Dove FM above).
//
//   Icecast stations also need:
//   host        - the host:port serving the station's status-json.xsl feed.
//   mount       - the mount point (without leading slash) identifying this
//                 station's stream on that Icecast server.
//
//   Futuri/streamon.fm stations also need:
//   mount       - identifies this station on yp.cdnstream1.com's metadata
//                 API (e.g. "7077_24k" -> .../metadata/7077_24k/current.json).
//                 Found in the station's own player page JS as
//                 "cfg_yp_mount" or in the "currentapi" URL. Unlike the
//                 other two providers, streamUrl here is the plain
//                 continuous-stream ("iceaac") format from that same page's
//                 "streams" config array, NOT the HLS ("hlsaac"/.m3u8) one -
//                 a plain <audio> tag can't play HLS without an extra
//                 library, but the iceaac format works exactly like a
//                 SecureNetSystems/Icecast stream.
//
//   SoCast stations also need:
//   accountId   - PlayerData.accountID in the station's player page JS.
//   streamId    - PlayerData.streamID in that same JS. Together these build
//                 the now-playing URL: PlayerData.nowPlayingURL is literally
//                 ".../np_{accountId}_{streamId}.js" - the raw audio stream
//                 itself (streamUrl) is unrelated to this platform and is
//                 usually hosted separately (e.g. on StreamGuys), found in
//                 that same JS as PlayerData.streamObj.mp3/.m4a.
const RADIO_STATIONS = [
  {
    // streamUrl inferred from the status endpoint's own URL pattern
    // (".../stream/status-json.xsl" -> ".../stream/{mount}") since the
    // page only embeds a third-party (LibreTime) player iframe with no
    // visible audio src to confirm against directly - verify playback
    // next time before assuming this is exactly right.
    displayName: 'Calvary Radio (Vero Beach)',
    provider: 'icecast',
    host: 'wwsh.ccvb.fm/stream',
    mount: 'main',
    streamUrl: 'https://wwsh.ccvb.fm/stream/main'
  },
  {
    displayName: 'TrueFM (KS)',
    provider: 'icecast',
    host: 'radio.shoutcheap.com/proxy/kaxzann1',
    mount: 'live',
    streamUrl: 'https://radio.shoutcheap.com/proxy/kaxzann1/stream'
  },
  {
    displayName: 'WJWD (WI)',
    provider: 'icecast',
    host: 'lunar.citrus3.com:8034',
    mount: 'stream',
    streamUrl: 'https://lunar.citrus3.com:8034/stream'
  },
  {
    displayName: 'EQUIP FM',
    provider: 'securenetsystems',
    subdomain: 'streamdb9web.securenetsystems.net',
    callSign: 'EQUIPFM',
    streamUrl: 'https://ice66.securenetsystems.net/EQUIPFM'
  },
  {
    displayName: 'WIAM',
    provider: 'securenetsystems',
    subdomain: 'streamdb3web.securenetsystems.net',
    callSign: 'WIAM',
    streamUrl: 'https://ice42.securenetsystems.net/WIAM'
  },
  {
    displayName: 'DOVE FM',
    provider: 'securenetsystems',
    subdomain: 'streamdb7web.securenetsystems.net',
    callSign: 'DOVEMAIN',
    streamUrl: 'https://ice64.securenetsystems.net/DOVEMAIN'
  },
  {
    displayName: 'REVIVE FM',
    provider: 'securenetsystems',
    subdomain: 'streamdb8web.securenetsystems.net',
    callSign: 'KEPHLP',
    streamUrl: 'https://ice42.securenetsystems.net/KEPHLP'
  },
  {
    displayName: 'The Truth (TN)',
    provider: 'securenetsystems',
    subdomain: 'streamdb00web.securenetsystems.net',
    callSign: 'WZTH',
    streamUrl: 'https://ice7.securenetsystems.net/WZTH'
  },
  {
    displayName: 'The Truth (GA)',
    provider: 'securenetsystems',
    subdomain: 'streamdb4web.securenetsystems.net',
    callSign: 'WZTG',
    streamUrl: 'https://ice26.securenetsystems.net/WZTG'
  },
  {
    displayName: 'KLHT FM (HI)',
    provider: 'icecast',
    host: 'klht.rhemastreams.net:8443',
    mount: 'klhtfm',
    streamUrl: 'https://klht.rhemastreams.net:8443/klhtfm'
  },
  {
    displayName: 'KLHT AM (HI)',
    provider: 'icecast',
    host: 'klht.rhemastreams.net:8443',
    mount: 'klhtam',
    streamUrl: 'https://klht.rhemastreams.net:8443/klhtam'
  },
  {
    displayName: 'WTSW-LP (WI)',
    provider: 'futuri',
    mount: '7077_24k',
    streamUrl: 'https://ais-sa1.streamon.fm/7077_24k.aac'
  },
  {
    displayName: 'Real Hope Radio 90.9 FM (ID)',
    provider: 'futuri',
    mount: '7066_24k',
    streamUrl: 'https://ais-sa1.streamon.fm/7066_24k.aac'
  },
  {
    displayName: 'Radio by Grace (TX)',
    provider: 'socast',
    accountId: '1023',
    streamId: '973',
    streamUrl: 'https://stream-radiobygrace.streamguys1.com/rbga.aac'
  }
];

// Extracts <title>, <artist>, and <cover> from the small XML feed each
// SecureNetSystems station exposes. Deliberately simple regex extraction is
// fine here (unlike the Conference ticker's messy nested HTML) because this
// is clean, predictable, machine-generated XML with no nesting to worry
// about. <cover> is the station's own album-art/show-image URL - Icecast has
// no equivalent field, so coverUrl is SecureNetSystems-only and callers must
// treat it as optional.
function parseSecureNetSystemsXml(xml) {
  const titleMatch = xml.match(/<title>([\s\S]*?)<\/title>/i);
  const artistMatch = xml.match(/<artist>([\s\S]*?)<\/artist>/i);
  const coverMatch = xml.match(/<cover>([\s\S]*?)<\/cover>/i);
  const coverUrl = coverMatch ? decodeEntities(coverMatch[1]).trim() : '';
  return {
    title: titleMatch ? decodeEntities(titleMatch[1]).trim() : '',
    artist: artistMatch ? decodeEntities(artistMatch[1]).trim() : '',
    coverUrl: coverUrl || null
  };
}

// Extracts now-playing info from an Icecast status-json.xsl response. Unlike
// SecureNetSystems, Icecast reports a single combined "title" field rather
// than separate title/artist fields - by convention it's usually formatted
// as "Artist - Track" (or "Host - Program" for talk stations), so we split
// on the first " - " to recover both. If a station's title doesn't follow
// that convention, we fall back to treating the whole string as the title
// with no artist, rather than guessing wrong.
function parseIcecastJson(rawJson) {
  let data;
  try {
    data = JSON.parse(rawJson);
  } catch (err) {
    throw new Error('Invalid Icecast JSON response');
  }

  // status-json.xsl returns "source" as a single object when the server has
  // just one mount, but as an array when it has several. Requesting with
  // ?mount= should always give us a single object, but handle the array
  // shape too in case a server ever ignores that filter.
  let source = data && data.icestats && data.icestats.source;
  if (Array.isArray(source)) source = source[0];

  const rawTitle = source && typeof source.title === 'string' ? source.title.trim() : '';
  if (!rawTitle) return { title: '', artist: '', coverUrl: null };

  const sepIndex = rawTitle.indexOf(' - ');
  if (sepIndex !== -1) {
    return {
      artist: rawTitle.slice(0, sepIndex).trim(),
      title: rawTitle.slice(sepIndex + 3).trim(),
      coverUrl: null
    };
  }

  // Some stations (confirmed in production - WRBP 92.5FM) report an empty
  // artist as a bare leading "- Title" instead of omitting the separator
  // entirely. After trimming the string, that leaves a stray "- " prefix
  // that the split above won't catch (no leading space left to match
  // " - " against) - strip it here so the ticker doesn't show a dangling
  // dash with no artist before it.
  const bareTitle = rawTitle.replace(/^-\s+/, '').trim();
  return { title: bareTitle, artist: '', coverUrl: null };
}

// Extracts now-playing info from a Futuri/streamon.fm "current.json"
// metadata endpoint. Confirmed via a real response to return a one-element
// array (not a bare object like Icecast's single-mount case) using ID3
// frame names as keys: TIT2 for title, TPE1 for artist, WXXX_album_art for
// cover art. WXXX_album_art can be present but an empty string when the
// current program has no art configured (seen in production - a talk show
// with no art, vs. a music track that would have one), so treat blank the
// same as absent rather than showing a broken image.
function parseFuturiJson(rawJson) {
  let data;
  try {
    data = JSON.parse(rawJson);
  } catch (err) {
    throw new Error('Invalid Futuri JSON response');
  }

  const entry = Array.isArray(data) ? data[0] : data;
  if (!entry) return { title: '', artist: '', coverUrl: null };

  const title = typeof entry.TIT2 === 'string' ? entry.TIT2.trim() : '';
  const artist = typeof entry.TPE1 === 'string' ? entry.TPE1.trim() : '';
  const coverUrl = typeof entry.WXXX_album_art === 'string' && entry.WXXX_album_art.trim()
    ? entry.WXXX_album_art.trim()
    : null;

  return { title: title, artist: artist, coverUrl: coverUrl };
}

// Extracts now-playing info from a SoCast player's now-playing feed. Unlike
// the other providers, this isn't bare JSON - it's JSONP, a JS-callback
// wrapper around a JSON object (confirmed via a real response:
// `jsonpcallback({...});`), designed to be loaded via a <script> tag on the
// station's own player page rather than fetched and parsed directly. We
// don't execute it as script - just regex out the object literal and
// JSON.parse that part ourselves.
function parseSocastJsonp(raw) {
  const wrapperMatch = raw.match(/jsonpcallback\(([\s\S]*)\)\s*;?\s*$/);
  if (!wrapperMatch) throw new Error('Unexpected SoCast now-playing response format');

  let data;
  try {
    data = JSON.parse(wrapperMatch[1]);
  } catch (err) {
    throw new Error('Invalid SoCast JSON payload');
  }

  const title = typeof data.song_name === 'string' ? data.song_name.trim() : '';
  const artist = typeof data.artist_name === 'string' ? data.artist_name.trim() : '';
  // "image" is the show/song art when present; "itunes_img" seen as a
  // fallback field in the same payload shape - both null in the one real
  // response we've confirmed, but handle either being populated.
  let coverUrl = null;
  if (typeof data.image === 'string' && data.image.trim()) {
    coverUrl = data.image.trim();
  } else if (typeof data.itunes_img === 'string' && data.itunes_img.trim()) {
    coverUrl = data.itunes_img.trim();
  }

  return { title: title, artist: artist, coverUrl: coverUrl };
}

// Registry of provider-specific fetch+parse logic. Every provider must
// expose buildNowPlayingUrl(station) and parse(rawText), and parse() must
// always return { title, artist, coverUrl } regardless of the provider's own
// native format (XML here, but a future provider might be JSON) - that's the
// one contract the ticker rendering code relies on. coverUrl is null for any
// provider (like Icecast) that doesn't expose station/show artwork. Adding a
// future non-SecureNetSystems station (streamon.fm, Live365, etc.) means
// adding one new entry here, not touching the handler, the cache logic, or
// the frontend at all.
const RADIO_PROVIDERS = {
  securenetsystems: {
    buildNowPlayingUrl: function(station) {
      return 'https://' + station.subdomain + '/player_status_update/' + station.callSign + '.xml';
    },
    parse: parseSecureNetSystemsXml
  },
  icecast: {
    buildNowPlayingUrl: function(station) {
      return 'https://' + station.host + '/status-json.xsl?mount=/' + station.mount;
    },
    parse: parseIcecastJson
  },
  futuri: {
    buildNowPlayingUrl: function(station) {
      return 'https://yp.cdnstream1.com/metadata/' + station.mount + '/current.json';
    },
    parse: parseFuturiJson
  },
  socast: {
    buildNowPlayingUrl: function(station) {
      return 'https://socast-public.s3.amazonaws.com/player/np_' + station.accountId + '_' + station.streamId + '.js';
    },
    parse: parseSocastJsonp
  }
};

async function fetchStationNowPlaying(station) {
  const provider = RADIO_PROVIDERS[station.provider];
  if (!provider) throw new Error('Unknown radio provider: ' + station.provider);

  const res = await fetch(provider.buildNowPlayingUrl(station), {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CCA-Map-Ticker/1.0)' }
  });
  if (!res.ok) throw new Error('Station ' + station.displayName + ' returned ' + res.status);

  const raw = await res.text();
  const parsed = provider.parse(raw);
  return {
    displayName: station.displayName,
    title: parsed.title,
    artist: parsed.artist,
    coverUrl: parsed.coverUrl || null,
    streamUrl: station.streamUrl
  };
}

async function handleRadio(request, ctx) {
  const cache = caches.default;
  const cacheUrl = new URL(request.url);
  cacheUrl.searchParams.set('cacheVersion', String(RADIO_CACHE_VERSION));
  const cacheKey = new Request(cacheUrl.toString(), request);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const jsonHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=' + RADIO_CACHE_SECONDS
  };

  // Each station is fetched independently - one station's feed being down
  // shouldn't blank out the whole ticker, same philosophy as the church
  // live-status checker above.
  const stations = await Promise.all(RADIO_STATIONS.map(async function(station) {
    try {
      return await fetchStationNowPlaying(station);
    } catch (err) {
      return {
        displayName: station.displayName,
        title: null,
        artist: null,
        coverUrl: null,
        streamUrl: station.streamUrl,
        error: err.message
      };
    }
  }));

  const body = JSON.stringify({
    stations: stations,
    fetchedAt: new Date().toISOString()
  });
  const response = new Response(body, { headers: jsonHeaders });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

// ---- Feedback form ----
//
// Public visitors can submit a name (optional), reply email (optional),
// and a message. We validate + rate-limit server-side, then relay it as
// an email via Resend (env.RESEND_API_KEY, a Worker secret) to
// env.ADMIN_EMAIL - the same secret already used for admin login, so no
// new secret is needed for the destination address.
async function handleFeedback(request, env) {
  let incoming;
  try {
    incoming = await request.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Bad request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Honeypot: a hidden field real users never fill in. Bots that
  // auto-fill every field trip this and get silently "accepted" (so they
  // don't know to retry) without ever reaching the inbox.
  if (incoming.website) {
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const message = (incoming.message || '').trim();
  if (!message || message.length > 5000) {
    return new Response(JSON.stringify({ error: 'Message is required (max 5000 characters)' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  const name = (incoming.name || '').trim().slice(0, 200);
  const replyEmail = (incoming.email || '').trim().slice(0, 200);

  // Lightweight rate limit: max 5 submissions per IP per hour. Reuses the
  // existing CHURCHES_KV binding under a distinct key prefix so it never
  // collides with church data, and each key auto-expires in an hour.
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rateKey = `feedback_rate_${ip}`;
  const recentCount = parseInt((await env.CHURCHES_KV.get(rateKey)) || '0', 10);
  if (recentCount >= 5) {
    return new Response(JSON.stringify({ error: 'Too many submissions, please try again later' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  await env.CHURCHES_KV.put(rateKey, String(recentCount + 1), { expirationTtl: 3600 });

  if (!env.RESEND_API_KEY || !env.ADMIN_EMAIL) {
    return new Response(JSON.stringify({ error: 'Feedback is not configured yet' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'CCA Finder Feedback <onboarding@resend.dev>',
      to: env.ADMIN_EMAIL,
      reply_to: replyEmail || undefined,
      subject: `CCA Finder feedback${name ? ' from ' + name : ''}`,
      text: `From: ${name || 'Anonymous'}\nEmail: ${replyEmail || 'Not provided'}\n\n${message}`
    })
  });

  if (!emailRes.ok) {
    // Don't leak Resend's response body back to the client - just log
    // enough server-side to debug, and tell the visitor it failed.
    console.error('Resend send failed', emailRes.status, await emailRes.text());
    return new Response(JSON.stringify({ error: 'Failed to send' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/conferences') {
      return handleConferences(request, ctx);
    }
    if (url.pathname === '/radio-now-playing') {
      return handleRadio(request, ctx);
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
    if (url.pathname === '/api/feedback' && request.method === 'POST') {
      return handleFeedback(request, env);
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
