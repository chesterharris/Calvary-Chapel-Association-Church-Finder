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
// Separate from LIVE_STATUS_KV_KEY (which only ever holds the live-only
// list visitors' pins are built from) - this holds EVERY candidate's result
// from the most recent cycle, including ones that errored or simply weren't
// live, plus a rolling history of recent cycles' stats. Admin-only
// visibility, never read by the public-facing map.
const LIVE_CHECK_DEBUG_KV_KEY = 'live-check-debug';
const LIVE_CHECK_HISTORY_MAX_CYCLES = 50;
// Live, in-progress status written DURING a cycle (both cron-triggered and
// manually-triggered via "Run Check Now"), separate from
// LIVE_CHECK_DEBUG_KV_KEY (which only gets its final write once a cycle
// finishes). Lets the admin debug panel show a real, accurate progress bar
// and ETA instead of a simulated one - the panel polls this key while
// `running` is true.
const LIVE_CHECK_PROGRESS_KV_KEY = 'live-check-progress';

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
  // Deliberately NOT identifying as a bot here (the old User-Agent literally
  // said "CCAFinderBot") - confirmed in production that YouTube can serve a
  // stripped-down page (missing meta tags AND the videoDetails JSON we fall
  // back to) to requests that don't look like a real browser, even for a
  // channel whose real page has everything. Using a realistic browser UA
  // plus the Accept headers a real browser sends isn't an attempt to
  // deceive anyone about what this is - it's a publicly viewable page - it
  // just avoids opting INTO a reduced-content path that only exists for
  // actual bot traffic.
  const response = await fetch(liveUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9'
    }
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
  if (!isLive) return { isLive: false, status: 'not_live' };

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
  // The og: meta tags are raw HTML attribute content, so they can contain
  // entities like &amp; or &#39; that need decoding before display -
  // confirmed in production (a church's description showed literal
  // "&amp;" and "&#39;" instead of "&" and "'"). The JSON fallback path
  // already handled this correctly via decodeJsonString; this meta-tag
  // path just hadn't been given the same treatment.
  const title = titleMetaMatch ? decodeEntities(titleMetaMatch[1]) : (titleJsonMatch ? decodeJsonString(titleJsonMatch[1]) : null);
  const description = descriptionMetaMatch ? decodeEntities(descriptionMetaMatch[1]) : (descriptionJsonMatch ? decodeJsonString(descriptionJsonMatch[1]) : null);
  const startDate = startDateMetaMatch ? startDateMetaMatch[1] : (startDateJsonMatch ? startDateJsonMatch[1] : null);
  const uploadDate = uploadDateMetaMatch ? uploadDateMetaMatch[1] : (uploadDateJsonMatch ? uploadDateJsonMatch[1] : null);

  // Belt-and-suspenders: if a startDate is present and is still in the
  // future, this is a scheduled/upcoming stream, not a live one, whatever
  // the isLive field said. This used to just return { isLive: false },
  // discarding all the title/description/startDate we'd just parsed and
  // making a genuinely-scheduled stream indistinguishable from a channel
  // with nothing going on at all - now surfaced as its own "waiting"
  // status so the admin debug view (and, if useful later, the public
  // side) can actually tell the two apart.
  if (startDate) {
    const startTime = new Date(startDate).getTime();
    if (!isNaN(startTime) && startTime > Date.now()) {
      return {
        isLive: false,
        status: 'waiting',
        videoId: videoId,
        startDate: startDate,
        title: title,
        description: description,
        author: authorMatch ? authorMatch[1] : null
      };
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
      return { isLive: false, status: 'not_live' };
    }
  }

  return {
    isLive: true,
    status: 'live',
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

  const cycleStartedAt = Date.now();

  // Writes the live in-progress snapshot the admin debug panel polls for a
  // real progress bar/ETA. Best-effort - a failed KV write here shouldn't
  // ever take down the actual live-check cycle, so errors are swallowed.
  async function writeProgress(completedCount, currentChurchName, running) {
    try {
      await env.CHURCHES_KV.put(LIVE_CHECK_PROGRESS_KV_KEY, JSON.stringify({
        running: running,
        startedAt: new Date(cycleStartedAt).toISOString(),
        updatedAt: new Date().toISOString(),
        totalCandidates: candidates.length,
        completedCount: completedCount,
        currentChurchName: currentChurchName || null
      }));
    } catch (err) {
      // Swallow - progress display is a nice-to-have, not worth failing
      // the actual check over.
    }
  }

  await writeProgress(0, candidates.length ? candidates[0].name : null, true);

  let erroredCount = 0;
  // Churches that were never actually attempted this cycle because we'd
  // already exhausted Cloudflare's subrequest budget - distinct from
  // erroredCount (a real, attempted fetch that failed). Both the ONE
  // church whose fetch attempt actually triggered the "too many
  // subrequests" error, and every church after it that got skipped
  // without attempting a fetch at all, land in this same bucket - from an
  // admin's perspective both are equally "didn't get checked this cycle,"
  // not meaningfully different failure types worth separate badges.
  let notCheckedCount = 0;
  // Set the moment we hit Cloudflare's own per-invocation subrequest
  // ceiling (confirmed in production: 50/invocation on the Free/Bundled
  // plan, higher on Paid). This is a hard platform limit, not a YouTube
  // rate-limit signal - once it's hit, every further fetch() in this SAME
  // invocation fails instantly regardless of target or delay, so there's
  // nothing to gain by continuing to loop through (and waiting the
  // stagger delay between) whatever candidates are left. Also excluded
  // from the adaptive stagger calculation below for the same reason:
  // slowing down doesn't fix a count-based ceiling, so treating this like
  // a bad YouTube cycle would just needlessly max out the delay for
  // future (unrelated) cycles.
  let hitSubrequestLimit = false;
  const results = [];
  // Every candidate's outcome this cycle, including non-live and errored
  // ones the public-facing `live` list below discards - this is what the
  // admin debug view reads from, since "nobody's live" and "everything's
  // 429ing" look identical from the public list alone.
  const debugResults = [];

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];

    if (hitSubrequestLimit) {
      // Record the rest as not-checked rather than attempting (and
      // failing) each one identically - still falls back to last-known-
      // good data exactly like a normal per-church failure would.
      const prior = previousById[c.id];
      notCheckedCount++;
      debugResults.push({
        churchId: c.id,
        name: c.name,
        isLive: prior ? prior.isLive : false,
        error: 'Not attempted - subrequest budget exhausted this cycle',
        usedStaleData: !!prior,
        notChecked: true
      });
      if (prior) {
        results.push(Object.assign({}, prior, { stale: true }));
      } else {
        results.push({ churchId: c.id, name: c.name, isLive: false, error: true });
      }
      await writeProgress(i + 1, candidates[i + 1] ? candidates[i + 1].name : null, true);
      continue;
    }

    try {
      const churchCheckStartedAt = Date.now();
      const status = await checkChurchLive(c.youtubeUrl);
      const churchCheckMs = Date.now() - churchCheckStartedAt;
      // channelUrl is the fallback the frontend links to when videoId is
      // null (confirmed in production: YouTube can serve a stripped page
      // to our datacenter-IP requests that has the isLive:true signal but
      // omits videoId/title/everything else). A generic "go watch on their
      // channel" link is far better than a dead, unclickable card - the
      // visitor can still reach the actual stream even when WE can't
      // extract the specific video.
      results.push(Object.assign({ churchId: c.id, name: c.name, channelUrl: buildLiveCheckUrl(c.youtubeUrl) }, status));
      debugResults.push({ churchId: c.id, name: c.name, isLive: status.isLive, status: status.status || null, startDate: status.startDate || null, checkMs: churchCheckMs, error: null });
    } catch (err) {
      // Both the original fetch and the retry failed - fall back to the
      // last known-good status for this church instead of assuming it
      // went offline. If we've never seen this church live before, this
      // is just an ordinary "not live" result.
      const prior = previousById[c.id];
      // err.message is what actually carries the HTTP status code (see
      // fetchLivePage's "...failed with status " + response.status) - this
      // is the one place that distinguishes a 429 from a timeout from a
      // 5xx, so keep it verbatim rather than collapsing to a boolean.
      // Cloudflare's own subrequest-limit error text (confirmed in
      // production: "Too many subrequests...") is checked for separately
      // from ordinary per-church fetch failures - see hitSubrequestLimit
      // above for why it needs different handling.
      if (/too many subrequests/i.test(err.message || '')) {
        hitSubrequestLimit = true;
        notCheckedCount++;
        debugResults.push({ churchId: c.id, name: c.name, isLive: prior ? prior.isLive : false, error: err.message, usedStaleData: !!prior, notChecked: true });
      } else {
        erroredCount++;
        debugResults.push({ churchId: c.id, name: c.name, isLive: prior ? prior.isLive : false, error: err.message, usedStaleData: !!prior });
      }
      if (prior) {
        results.push(Object.assign({}, prior, { stale: true }));
      } else {
        results.push({ churchId: c.id, name: c.name, isLive: false, error: true });
      }
    }

    await writeProgress(i + 1, candidates[i + 1] ? candidates[i + 1].name : null, true);

    // Stagger requests to YouTube instead of firing them all at once.
    // Skip the delay after the last item, or once we've already hit the
    // subrequest ceiling - no point waiting to attempt something we know
    // will fail identically.
    if (i < candidates.length - 1 && !hitSubrequestLimit) {
      await sleep(staggerMs);
    }
  }

  const liveOnly = results.filter(function(r) { return r.isLive; });
  const cycleDurationMs = Date.now() - cycleStartedAt;
  // actuallyChecked = candidates a fetch was really attempted for
  // (whether it succeeded or failed), i.e. everything EXCEPT the
  // not-checked bucket above. candidates.length remains the honest total
  // regardless of how the cycle went.
  const actuallyCheckedCount = candidates.length - notCheckedCount;

  await env.CHURCHES_KV.put(LIVE_STATUS_KV_KEY, JSON.stringify({
    checkedAt: new Date().toISOString(),
    live: liveOnly,
    // Cycle-level stats for observability - lets us see the *actual*,
    // empirical error rate for our own traffic over time in KV, rather
    // than guessing at what YouTube's threshold is. Check this after
    // deploying instead of assuming the stagger delay is "enough."
    stats: {
      totalCandidates: candidates.length,
      actuallyChecked: actuallyCheckedCount,
      errored: erroredCount,
      notChecked: notCheckedCount,
      staggerMsUsed: staggerMs
    }
  }));

  // Full admin debug snapshot: every candidate's result (not just live
  // ones), plus a rolling history of recent cycles' summary stats so a
  // trend (e.g. error rate climbing over the course of an evening) is
  // visible, not just the latest cycle in isolation.
  const debugRaw = await env.CHURCHES_KV.get(LIVE_CHECK_DEBUG_KV_KEY);
  const debugPrevious = debugRaw ? JSON.parse(debugRaw) : { history: [] };
  const history = Array.isArray(debugPrevious.history) ? debugPrevious.history : [];
  history.push({
    checkedAt: new Date().toISOString(),
    totalCandidates: candidates.length,
    actuallyChecked: actuallyCheckedCount,
    errored: erroredCount,
    notChecked: notCheckedCount,
    staggerMsUsed: staggerMs,
    durationMs: cycleDurationMs,
    hitSubrequestLimit: hitSubrequestLimit
  });
  while (history.length > LIVE_CHECK_HISTORY_MAX_CYCLES) history.shift();

  await env.CHURCHES_KV.put(LIVE_CHECK_DEBUG_KV_KEY, JSON.stringify({
    latestCycle: {
      checkedAt: new Date().toISOString(),
      totalCandidates: candidates.length,
      actuallyChecked: actuallyCheckedCount,
      errored: erroredCount,
      notChecked: notCheckedCount,
      staggerMsUsed: staggerMs,
      durationMs: cycleDurationMs,
      hitSubrequestLimit: hitSubrequestLimit,
      results: debugResults
    },
    history: history
  }));

  // Adjust the delay for next cycle based on how this one went, and
  // persist it. This is what replaces the old fixed-guess constant -
  // the delay grows on its own if error rates climb, and only eases back
  // down after cycles come back fully clean.
  //
  // Skipped entirely if this cycle hit Cloudflare's subrequest ceiling -
  // that failure mode reflects a platform limit no amount of delay can
  // fix, not YouTube's actual rate-limiting behavior, and a truncated
  // cycle isn't a representative sample of the real error rate anyway.
  if (!hitSubrequestLimit) {
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

  await writeProgress(candidates.length, null, false);
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

// Admin-only, read-only - just returns whatever the last cron cycle wrote
// to LIVE_CHECK_DEBUG_KV_KEY (see checkAllChurchesLive). Never triggers a
// real check itself (unlike handleDebugCheckLiveNow above) - safe to poll
// repeatedly from an open debug panel without generating any extra
// YouTube traffic.
async function handleDebugLiveCheckStatus(request, env) {
  if (!(await isAdminRequest(request, env))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  const raw = await env.CHURCHES_KV.get(LIVE_CHECK_DEBUG_KV_KEY);
  const staggerRaw = await env.CHURCHES_KV.get(LIVE_CHECK_STAGGER_STATE_KV_KEY);
  const data = raw ? JSON.parse(raw) : { latestCycle: null, history: [] };
  data.currentStaggerState = staggerRaw ? JSON.parse(staggerRaw) : { staggerMs: LIVE_CHECK_STAGGER_DEFAULT_MS };
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

// Admin-only, read-only - returns the live in-progress snapshot written
// DURING a cycle (see writeProgress() inside checkAllChurchesLive), so the
// debug panel can show a real progress bar/ETA instead of a simulated one.
// Reflects ANY currently-running cycle, whether it was triggered by the
// Cron Trigger or by this or another admin session's "Run Check Now" -
// the panel doesn't need to have personally started the run to see it.
async function handleDebugLiveCheckProgress(request, env) {
  if (!(await isAdminRequest(request, env))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  const raw = await env.CHURCHES_KV.get(LIVE_CHECK_PROGRESS_KV_KEY);
  const data = raw ? JSON.parse(raw) : { running: false };
  return new Response(JSON.stringify(data), {
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
//   cityState   - OPTIONAL, hand-entered, display-only (e.g. "Vero Beach,
//                 FL"). Shown in the browse panel only - the ticker never
//                 renders anything beyond displayName + now-playing text.
//                 Fine to leave off entries that don't have it yet.
//   homePage    - OPTIONAL, hand-entered, display-only - the station's own
//                 website, shown as a link in the browse panel only.
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
//   domain      - the station's OWN website domain hosting the
//                 "/api/music/currentProgram" WordPress REST route (e.g.
//                 "www.radiobygrace.com") - NOT a shared SoCast
//                 infrastructure host. Found by waiting ~10 minutes after
//                 pressing Play on the station's own player page with
//                 DevTools Network (filter: JS or All, search "program")
//                 open - this call is only made once every 10 minutes and
//                 not immediately on page load, easy to miss.
//   accountId   - PlayerData.accountID in the station's player page JS;
//                 also appears as the accountID query param on the above
//                 endpoint. NOTE: an earlier, DIFFERENT SoCast endpoint
//                 (np_{accountId}_{streamId}.js, hosted on
//                 socast-public.s3.amazonaws.com) looked plausible at
//                 first and returns real data too, but tracks background
//                 song/music cues, NOT who's actually on air - confirmed
//                 wrong in production (showed a song's artist instead of
//                 "Ed Taylor", the actual live host). currentProgram is
//                 the one that actually reflects on-air host/show info.
//
//   wpshowplaying stations also need:
//   npUrl       - the FULL now-playing URL, stored whole rather than
//                 decomposed into a host+path pattern (unlike the other
//                 providers), since this format has been seen on exactly
//                 one WordPress theme ("radiostation") so far with no
//                 confirmed shared structure across stations. Response is
//                 plain HTML (not XML/JSON) - a `<div id="nowPlaying">`
//                 containing "Played earlier" / "Now playing" / "Up next"
//                 sections, each line formatted as "{title} by {artist}".
//                 We only care about the bolded "Now playing" line.
const RADIO_STATIONS = [
  {
    // streamUrl inferred from the status endpoint's own URL pattern
    // (".../stream/status-json.xsl" -> ".../stream/{mount}") since the
    // page only embeds a third-party (LibreTime) player iframe with no
    // visible audio src to confirm against directly - verify playback
    // next time before assuming this is exactly right.
    displayName: 'CCVB',
    cityState: 'Vero Beach, FL',
    homePage: 'https://ccvb.fm/',
    provider: 'icecast',
    host: 'wwsh.ccvb.fm/stream',
    mount: 'main',
    streamUrl: 'https://wwsh.ccvb.fm/stream/main'
  },
  {
    displayName: 'TrueFM',
    cityState: 'Wichita, KS',
    homePage: 'http://www.truefm.net',
    provider: 'icecast',
    host: 'radio.shoutcheap.com/proxy/kaxzann1',
    mount: 'live',
    streamUrl: 'https://radio.shoutcheap.com/proxy/kaxzann1/stream'
  },
  {
    displayName: 'WJWD',
    cityState: 'Marshall, WI',
    homePage: 'https://jesuspeoplefm.com',
    provider: 'icecast',
    host: 'lunar.citrus3.com:8034',
    mount: 'stream',
    streamUrl: 'https://lunar.citrus3.com:8034/stream'
  },
  {
    displayName: 'EQUIP FM',
    cityState: 'Lynchburg, VA',
    homePage: 'https://equipfm.org/sponsors/calvary-chapel-lynchburg/',
    provider: 'securenetsystems',
    subdomain: 'streamdb9web.securenetsystems.net',
    callSign: 'EQUIPFM',
    streamUrl: 'https://ice66.securenetsystems.net/EQUIPFM'
  },
  {
    displayName: 'WIAM',
    cityState: 'Knoxville, TN',
    homePage: 'https://thewaymedia.net/calvary-knoxville',
    provider: 'securenetsystems',
    subdomain: 'streamdb3web.securenetsystems.net',
    callSign: 'WIAM',
    streamUrl: 'https://ice42.securenetsystems.net/WIAM'
  },
  {
    displayName: 'DOVE FM',
    cityState: 'Russell, PA',
    homePage: 'https://www.dovefm.org/',
    provider: 'securenetsystems',
    subdomain: 'streamdb7web.securenetsystems.net',
    callSign: 'DOVEMAIN',
    streamUrl: 'https://ice64.securenetsystems.net/DOVEMAIN'
  },
  {
    // NOTE: displayName deliberately left as-is (not renamed to "REVIVE FM
    // (TX)") even though the person's cityState note suggested that -
    // renaming would silently un-favorite this station for anyone who's
    // already starred it (favorites are matched by exact displayName), and
    // this one wasn't part of the earlier explicit EQUIP FM/WIAM/DOVE FM
    // rename request. Flag if a rename is actually wanted.
    displayName: 'REVIVE FM',
    cityState: 'Houston, TX',
    homePage: 'https://revive953.com/',
    provider: 'securenetsystems',
    subdomain: 'streamdb8web.securenetsystems.net',
    callSign: 'KEPHLP',
    streamUrl: 'https://ice42.securenetsystems.net/KEPHLP'
  },
  {
    displayName: 'The Truth (TN)',
    cityState: 'Greeneville, TN',
    homePage: 'https://www.truthfm.net/',
    provider: 'securenetsystems',
    subdomain: 'streamdb00web.securenetsystems.net',
    callSign: 'WZTH',
    streamUrl: 'https://ice7.securenetsystems.net/WZTH'
  },
  {
    displayName: 'The Truth (GA)',
    cityState: 'Clayton, GA',
    homePage: 'https://www.truthfm.net/',
    provider: 'securenetsystems',
    subdomain: 'streamdb4web.securenetsystems.net',
    callSign: 'WZTG',
    streamUrl: 'https://ice26.securenetsystems.net/WZTG'
  },
  {
    displayName: 'KLHT FM',
    cityState: 'Honolulu, HI',
    homePage: 'https://fm.klight.org',
    provider: 'icecast',
    host: 'klht.rhemastreams.net:8443',
    mount: 'klhtfm',
    streamUrl: 'https://klht.rhemastreams.net:8443/klhtfm'
  },
  {
    displayName: 'KLHT AM',
    cityState: 'Honolulu, HI',
    homePage: 'https://am.klight.org',
    provider: 'icecast',
    host: 'klht.rhemastreams.net:8443',
    mount: 'klhtam',
    streamUrl: 'https://klht.rhemastreams.net:8443/klhtam'
  },
  {
    displayName: 'WTSW-LP',
    cityState: 'Manitowoc, WI',
    homePage: 'https://wtswlp.org/',
    provider: 'futuri',
    mount: '7077_24k',
    streamUrl: 'https://ais-sa1.streamon.fm/7077_24k.aac'
  },
  {
    displayName: 'Real Hope Radio',
    cityState: 'Grangeville, ID',
    homePage: 'https://realhoperadio.com/',
    provider: 'futuri',
    mount: '7066_24k',
    streamUrl: 'https://ais-sa1.streamon.fm/7066_24k.aac'
  },
  {
    displayName: 'Radio by Grace',
    cityState: 'Amarillo, TX',
    homePage: 'http://www.radiobygrace.com',
    provider: 'socast',
    domain: 'www.radiobygrace.com',
    accountId: '1023',
    streamUrl: 'https://stream-radiobygrace.streamguys1.com/rbga.aac'
  },
  {
    displayName: 'Renew FM',
    cityState: 'Fitchburg, MA',
    homePage: 'https://renewfm.org',
    provider: 'wpshowplaying',
    npUrl: 'https://renewfm.org/wp-content/themes/radiostation/showPlaying.php?device=web',
    streamUrl: 'https://streams.radio.co/s34b0aa3a7/listen'
  },
  {
    displayName: 'Truth FM',
    cityState: 'Hagerstown, MD',
    homePage: 'https://www.calvarycumberland.com/Listen-on-line',
    provider: 'securenetsystems',
    subdomain: 'streamdb4web.securenetsystems.net',
    callSign: 'WZTM',
    streamUrl: 'https://ice26.securenetsystems.net/WZTM'
  },
  {
    displayName: 'KSGR',
    cityState: 'Corpus Christi, TX',
    homePage: 'https://ksgr.org',
    provider: 'icecast',
    host: 'ksgr.ddns.net:1841',
    mount: 'stream.mp3',
    streamUrl: 'https://ksgr.ddns.net:1841/stream.mp3'
  },
  {
    displayName: 'WGSS',
    cityState: 'Amityville, NY',
    homePage: 'https://www.godstillspeaks.com/',
    provider: 'radiomast',
    streamUrl: 'https://streams.radiomast.io/bbe3faf2-3aa6-440a-9e1f-06b766d9bd70'
  },
  {
    displayName: 'The Word',
    cityState: 'Farmington, NY',
    homePage: 'https://wzxv.org/',
    provider: 'live365hls',
    host: 'streaming.live365.com',
    stationId: 'a10665',
    streamUrl: 'https://streaming.live365.com/a10665'
  },
  {
    displayName: 'WLEB',
    cityState: 'Lebanon, PA',
    homePage: 'https://truthmedianetwork.org/',
    provider: 'shoutcast',
    host: 'broadcast.shoutcheap.com/proxy/wleblpt1',
    streamUrl: 'https://broadcast.shoutcheap.com/proxy/wleblpt1/stream'
  },
  {
    displayName: 'Crossover',
    cityState: 'Cedar City, UT',
    homePage: 'https://crossoverfm.org/',
    provider: 'securenetsystems',
    subdomain: 'streamdb7web.securenetsystems.net',
    callSign: 'KCHG',
    streamUrl: 'https://ice8.securenetsystems.net/KCHG'
  },
  {
    displayName: 'WXMB',
    cityState: 'Myrtle Beach, SC',
    homePage: 'https://wxmbfm.com/',
    provider: 'securenetsystems',
    subdomain: 'streamdb7web.securenetsystems.net',
    callSign: 'WXMB',
    streamUrl: 'https://ice25.securenetsystems.net/WXMB'
  },
  {
    displayName: 'WRDJ',
    cityState: 'Merritt Island, FL',
    homePage: 'http://www.wrdj.com',
    provider: 'live365json',
    mountId: 'a96507',
    streamUrl: 'https://streaming.live365.com/a96507'
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

// Extracts now-playing info from Live365's public station JSON endpoint
// (https://api.live365.com/station/{mountId}). Undocumented but stable -
// same shape confirmed by station page inspection. Talk/spoken segments
// report a real title with an empty artist string (e.g. "Revival_Radio"),
// which is expected, not a failure - only treat completely missing data as
// absent. The "art" field always points at a static Live365 placeholder
// image (".../blankart.jpg") when no real cover exists, so that specific
// URL is filtered out to null rather than shown as if it were real artwork.
function parseLive365Json(rawJson) {
  let data;
  try {
    data = JSON.parse(rawJson);
  } catch (err) {
    throw new Error('Invalid Live365 JSON response');
  }

  const track = data && data['current-track'];
  const rawCover = track && typeof track.art === 'string' ? track.art.trim() : '';
  const isPlaceholderArt = /blankart\.jpg$/i.test(rawCover);

  return {
    title: track && typeof track.title === 'string' ? track.title.trim() : '',
    artist: track && typeof track.artist === 'string' ? track.artist.trim() : '',
    coverUrl: rawCover && !isPlaceholderArt ? rawCover : null
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
// Extracts on-air program info from a SoCast station's "currentProgram" API
// - a WordPress REST route hosted on the STATION'S OWN domain (not the
// shared socast-public.s3.amazonaws.com infrastructure used by the
// song-tracking feed we tried first). Confirmed via a real response to be
// the correct source for actual show/host identity (e.g. "Pastor Ed
// Taylor / Abounding Grace") - the song-based np_x_x.js feed we originally
// wired up instead tracks background music cues, which for a talk station
// never reflects who's actually on air, even though both feeds technically
// "work" and return data.
//
// Response is JSONP (see parseSocastJsonp's comment for what that means),
// but with a dynamically-generated callback name unique per request
// (e.g. "jQuery19105312052787680952_1787330750766") rather than a fixed
// literal - the regex below matches any valid identifier as the wrapper
// function name rather than requiring one specific name.
function parseSocastProgramJsonp(raw) {
  const wrapperMatch = raw.match(/^\s*[\w$]+\(([\s\S]*)\)\s*;?\s*$/);
  if (!wrapperMatch) throw new Error('Unexpected SoCast program response format');

  let parsed;
  try {
    parsed = JSON.parse(wrapperMatch[1]);
  } catch (err) {
    throw new Error('Invalid SoCast program JSON payload');
  }

  if (!parsed || parsed.status !== 'success' || !parsed.data) {
    return { title: '', artist: '', coverUrl: null };
  }

  // No separate "artist" concept for a program schedule - program_name is
  // already the full descriptive string (e.g. "Host Name / Show Title"),
  // so it goes entirely into title with artist left blank. The frontend's
  // existing "no artist -> just show the title" fallback handles this the
  // same way it already does for Icecast stations with no artist data.
  const title = typeof parsed.data.program_name === 'string' ? parsed.data.program_name.trim() : '';

  // program_button has been the populated one in practice (a host photo);
  // program_header_img/program_mobile_img are alternate fields in the same
  // payload shape that were empty strings in the one real response we've
  // confirmed, but checked here in case a different program populates one
  // of those instead.
  let coverUrl = null;
  if (typeof parsed.data.program_button === 'string' && parsed.data.program_button.trim()) {
    coverUrl = parsed.data.program_button.trim();
  } else if (typeof parsed.data.program_header_img === 'string' && parsed.data.program_header_img.trim()) {
    coverUrl = parsed.data.program_header_img.trim();
  } else if (typeof parsed.data.program_mobile_img === 'string' && parsed.data.program_mobile_img.trim()) {
    coverUrl = parsed.data.program_mobile_img.trim();
  }

  return { title: title, artist: '', coverUrl: coverUrl };
}

// Extracts the "Now playing" line from a WordPress "radiostation" theme's
// showPlaying.php feed. This is plain HTML (not XML/JSON) built for a
// browser to display and auto-refresh directly (the response includes its
// own <script>setTimeout(...location.reload...)</script> - we ignore that,
// we just re-fetch on our own poll schedule instead) - confirmed via a real
// response to look like:
//   <div id='nowPlaying'>...
//     <b><i><u>Played earlier</u></i></b><br/>Song by Artist<br/>...
//     <b><i><u>Now playing</u></i></b><br/><b>Title by Artist</b><br/>
//     <b><i><u>Up next</u></i></b><br/>Song by Artist
//   </div>
// Only the bolded "Now playing" line is what we want. Each line follows a
// "{title} by {artist}" convention - split on the first " by " the same
// way other providers split on " - ".
function parseWpShowPlayingHtml(html) {
  const nowPlayingMatch = html.match(/Now playing<\/u><\/i><\/b><br\s*\/?>\s*<b>([\s\S]*?)<\/b>/i);
  if (!nowPlayingMatch) return { title: '', artist: '', coverUrl: null };

  const raw = decodeEntities(nowPlayingMatch[1].replace(/<[^>]+>/g, '')).trim();
  if (!raw) return { title: '', artist: '', coverUrl: null };

  const sepIndex = raw.indexOf(' by ');
  if (sepIndex === -1) return { title: raw, artist: '', coverUrl: null };
  return {
    title: raw.slice(0, sepIndex).trim(),
    artist: raw.slice(sepIndex + 4).trim(),
    coverUrl: null
  };
}

// Safe JSON.parse that returns null on failure instead of throwing - used
// by parseRadioMastSse below to try a few candidate shapes in order rather
// than committing to one and failing hard if it's wrong.
function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch (err) {
    return null;
  }
}

// Extracts now-playing info from a RadioMast.io stream's metadata feed.
// Confirmed via a real response to be:
//   { "metadata": "05 You Say - Laura Daigle", "metadata_ext": {} }
// RadioMast's own docs describe this as a Server-Sent Events endpoint
// (`new EventSource(streamUrl + "/metadata")`), meant to push updates
// indefinitely - a fundamentally different shape than every other
// provider here (all one-shot GET+parse). We don't hold the connection
// open; a single fetch() is enough since the current state is sent
// immediately upon connecting, and we just read whatever arrives first.
// The exact raw wire format (proper "data: {...}" SSE framing vs. what
// look liked bare JSON in manual testing) wasn't fully pinned down, so
// this tries a few candidate shapes in order rather than assuming one:
//   1. The whole response is bare JSON, no framing at all.
//   2. Proper SSE framing - a "data: {...}" line as the first event.
//   3. Last resort - the first {...} span found anywhere in the text.
function parseRadioMastSse(raw) {
  const trimmed = raw.trim();
  let data = tryParseJson(trimmed);

  if (!data) {
    const firstEvent = trimmed.split(/\r?\n\r?\n/)[0];
    const dataLine = firstEvent.split(/\r?\n/).filter(function(line) {
      return line.indexOf('data:') === 0;
    })[0];
    if (dataLine) data = tryParseJson(dataLine.slice(dataLine.indexOf(':') + 1).trim());
  }

  if (!data) {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) data = tryParseJson(match[0]);
  }

  if (!data) throw new Error('Unexpected RadioMast metadata response format');

  const combined = typeof data.metadata === 'string' ? data.metadata.trim() : '';
  if (!combined) return { title: '', artist: '', coverUrl: null };

  // Combined string convention here is "{Title} - {Artist}" (confirmed:
  // "05 You Say - Laura Daigle" - Laura Daigle is the artist) - the
  // OPPOSITE order from Icecast's "{Artist} - {Track}" convention, so
  // don't copy that split blindly for a future RadioMast station.
  const sepIndex = combined.indexOf(' - ');
  if (sepIndex === -1) return { title: combined, artist: '', coverUrl: null };

  let title = combined.slice(0, sepIndex).trim();
  const artist = combined.slice(sepIndex + 3).trim();

  // Strips a leading track-number prefix some automation systems include
  // (confirmed in production: "05 You Say" for a track actually titled
  // "You Say") - inferred from a single real example, may need revisiting
  // if a future station's real titles legitimately start with a number.
  title = title.replace(/^\d{1,3}[\s.]+/, '');

  return { title: title, artist: artist, coverUrl: null };
}

// Extracts now-playing info from a Live365 HLS media playlist's embedded
// #EXTINF tags - a completely different (and much simpler) mechanism than
// Live365's SSE-based `/metadata` endpoint, which we deliberately decided
// NOT to build (see the "Providers we looked at and deliberately did NOT
// build" doc section - that endpoint appeared to require spoofing Origin/
// Referer headers to impersonate Live365's own player). This one needs
// none of that: the current track is sitting in plain text inside the
// public playlist file every segment already carries, confirmed via a
// real response:
//   #EXTINF:4.96327,PASTOR JOHN THOMAS - IN THE POTTERS HAND
//   /L2ExMDY2NQ../.../segment-163670.mp3?listeningSessionId=...
// Multiple #EXTINF lines can appear per fetch (one per segment in the
// current sliding window) - we want the LAST one, since segments are
// listed oldest-to-newest and the last is the most recently added.
function parseLive365HlsPlaylist(m3u8Text) {
  const matches = [...m3u8Text.matchAll(/^#EXTINF:[\d.]+,(.*)$/gm)];
  if (!matches.length) return { title: '', artist: '', coverUrl: null };

  const combined = matches[matches.length - 1][1].trim();
  if (!combined) return { title: '', artist: '', coverUrl: null };

  // Convention here is "{Artist} - {Title}" (confirmed: "PASTOR JOHN
  // THOMAS - IN THE POTTERS HAND" - a preacher's name, then the sermon
  // title) - same order as Icecast's split, NOT RadioMast's reversed one.
  const sepIndex = combined.indexOf(' - ');
  if (sepIndex === -1) return { title: combined, artist: '', coverUrl: null };
  return {
    artist: combined.slice(0, sepIndex).trim(),
    title: combined.slice(sepIndex + 3).trim(),
    coverUrl: null
  };
}

// Extracts now-playing info from a Shoutcast v2 server's native status
// endpoint. Distinct from `icecast` above - Shoutcast and Icecast are
// different streaming server software with different native formats, even
// though shared hosts like shoutcheap.com can host either kind. Confirmed
// via a real response that some shoutcheap.com proxies serve the audio
// stream itself (not JSON) at the Icecast-style `status-json.xsl` path -
// worth checking whether a "shoutcheap.com" station is actually Icecast or
// Shoutcast under the hood before assuming which provider applies.
//
// Response shape (confirmed via a real response):
//   { "songtitle": "Chris Falson - I See the Lord", "servertitle": "...", ... }
// `songtitle` follows the same "Artist - Track" convention as Icecast, so
// the split logic is identical.
function parseShoutcastJson(rawJson) {
  let data;
  try {
    data = JSON.parse(rawJson);
  } catch (err) {
    throw new Error('Invalid Shoutcast JSON response');
  }

  const combined = typeof data.songtitle === 'string' ? data.songtitle.trim() : '';
  if (!combined) return { title: '', artist: '', coverUrl: null };

  const sepIndex = combined.indexOf(' - ');
  if (sepIndex === -1) return { title: combined, artist: '', coverUrl: null };
  return {
    artist: combined.slice(0, sepIndex).trim(),
    title: combined.slice(sepIndex + 3).trim(),
    coverUrl: null
  };
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
      return 'https://' + station.domain + '/api/music/currentProgram?jsonpcallback=npCallback&accountID=' + station.accountId + '&_=' + Date.now();
    },
    parse: parseSocastProgramJsonp
  },
  wpshowplaying: {
    buildNowPlayingUrl: function(station) {
      return station.npUrl;
    },
    parse: parseWpShowPlayingHtml
  },
  live365json: {
    buildNowPlayingUrl: function(station) {
      return 'https://api.live365.com/station/' + station.mountId;
    },
    parse: parseLive365Json
  },
  live365hls: {
    // Deliberately named distinctly from a hypothetical future
    // "live365sse"-style provider - this is NOT the same mechanism as the
    // rejected SSE endpoint, and shouldn't be confused with it later.
    // Uses fetchAndParse (not buildNowPlayingUrl/parse) because the real
    // media playlist lives behind a master-playlist redirect that has to
    // be followed fresh every poll - see fetchLive365NowPlaying above.
    fetchAndParse: fetchLive365NowPlaying
  },
  radiomast: {
    // Metadata URL is always just the stream URL itself + "/metadata"

    // (confirmed via RadioMast's own docs and a real response) - no
    // separate station-specific field needed beyond the streamUrl every
    // station already has for playback.
    buildNowPlayingUrl: function(station) {
      return station.streamUrl + '/metadata';
    },
    parse: parseRadioMastSse
  },
  shoutcast: {
    buildNowPlayingUrl: function(station) {
      return 'https://' + station.host + '/stats?json=1';
    },
    parse: parseShoutcastJson
  }
};

const LIVE365_FETCH_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; CCA-Map-Ticker/1.0)' };

// Live365's own base playlist URL isn't the media playlist we need - it's
// a "master" playlist pointing to a freshly-issued, session-specific edge
// URL that changes on every single request (confirmed in production: two
// separate fetches returned two different listeningSessionId values).
// This is NOT the same kind of gating as the rejected SSE `/metadata`
// endpoint (no spoofed headers needed, nothing session-authenticated) -
// it's just a normal, public two-step redirect we have to follow fresh
// every poll rather than something we can cache/hardcode.
//
// This needs its own fetch function (rather than the generic single
// fetch+parse used by every other provider) because it requires two HTTP
// calls, not one - see fetchAndParse on the live365hls provider entry.
async function fetchLive365NowPlaying(station) {
  const masterUrl = 'https://' + station.host + '/' + station.stationId + '/playlist.m3u8';
  const masterRes = await fetch(masterUrl, { headers: LIVE365_FETCH_HEADERS });
  if (!masterRes.ok) throw new Error('Station ' + station.displayName + ' master playlist returned ' + masterRes.status);
  const masterText = await masterRes.text();

  const variantMatch = masterText.match(/^https?:\/\/\S+\.m3u8\S*$/m);
  if (!variantMatch) throw new Error('Station ' + station.displayName + ' master playlist had no variant URL');

  const mediaRes = await fetch(variantMatch[0], { headers: LIVE365_FETCH_HEADERS });
  if (!mediaRes.ok) throw new Error('Station ' + station.displayName + ' media playlist returned ' + mediaRes.status);
  const mediaText = await mediaRes.text();

  return parseLive365HlsPlaylist(mediaText);
}

async function fetchStationNowPlaying(station) {
  const provider = RADIO_PROVIDERS[station.provider];
  if (!provider) throw new Error('Unknown radio provider: ' + station.provider);

  // Most providers just need one fetch+parse (buildNowPlayingUrl + parse).
  // A provider that needs more than one HTTP call (like live365hls's
  // master-playlist-then-edge-URL chain) instead exposes fetchAndParse,
  // which takes full control of its own fetching and returns the same
  // { title, artist, coverUrl } shape directly.
  let parsed;
  if (provider.fetchAndParse) {
    parsed = await provider.fetchAndParse(station);
  } else {
    const res = await fetch(provider.buildNowPlayingUrl(station), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CCA-Map-Ticker/1.0)' }
    });
    if (!res.ok) throw new Error('Station ' + station.displayName + ' returned ' + res.status);
    const raw = await res.text();
    parsed = provider.parse(raw);
  }

  return {
    displayName: station.displayName,
    title: parsed.title,
    artist: parsed.artist,
    coverUrl: parsed.coverUrl || null,
    streamUrl: station.streamUrl,
    // Optional, hand-entered display-only fields - never shown in the
    // ticker (that only ever renders displayName + now-playing text), just
    // in the browse panel. Purely cosmetic, unrelated to any of the
    // technical/streaming fields above. Add more the same way: (1) put it
    // on the RADIO_STATIONS entry, (2) pass it through here AND in the
    // error fallback below, (3) render it in the browse panel row.
    cityState: station.cityState || null,
    homePage: station.homePage || null
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
        cityState: station.cityState || null,
        homePage: station.homePage || null,
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
    if (url.pathname === '/api/debug/live-check-status' && request.method === 'GET') {
      return handleDebugLiveCheckStatus(request, env);
    }
    if (url.pathname === '/api/debug/live-check-progress' && request.method === 'GET') {
      return handleDebugLiveCheckProgress(request, env);
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
