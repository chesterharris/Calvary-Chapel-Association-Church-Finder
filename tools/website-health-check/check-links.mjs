#!/usr/bin/env node
// Church Website Link Health Check
// ----------------------------------
// A manual, on-demand diagnostic tool - NOT scheduled, NOT part of the
// Cloudflare Worker. Run it by hand (double-click run.bat, or
// `node check-links.mjs` from this folder) whenever you want a fresh look
// at whether all 1,400+ church website/Facebook links still resolve.
//
// Why this lives outside the Worker: checking 1,400+ outbound URLs is a lot
// of HTTP requests. Doing that *inside* the Cloudflare Worker would burn
// into its subrequest limits and run against your Cloudflare account's
// quota every time you ran it. Instead, this script makes exactly ONE
// request to your own site (GET /api/churches, the same public endpoint
// the map itself uses) to get the current list, and then every other
// request - all 1,400+ of them - goes out directly from this computer's own
// network connection. Your Cloudflare account never sees them.
//
// Output: a single self-contained, dated HTML report in ./reports/, e.g.
// reports/Church_Website_Link_Report_2026-11-23.html - no external scripts
// or stylesheets, so it opens fine by double-clicking even with no
// internet connection once the check itself is done.
//
// See README.md in this folder for the full design notes and the
// categorization rules.

import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { exec } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- Config (override via CLI flags, e.g. --concurrency=6) ----

const DEFAULT_SOURCE_URL = 'https://cca-finder.calvary.workers.dev/api/churches';
const DEFAULT_CONCURRENCY = 10;
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRIES = 1; // extra attempts after the first, on network/timeout errors only
// Phase 2 (optional): re-visit likely false positives with a real browser.
// Slower per-URL than the plain fetch check, so a smaller concurrency and a
// longer timeout (a bot-challenge page can take a few seconds to clear).
const DEFAULT_DEEP_CONCURRENCY = 4;
const DEFAULT_DEEP_TIMEOUT_MS = 20000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/131.0.0.0 Safari/537.36 CCA-Finder-LinkHealthCheck/1.0 (+manual tool, run by admin; not automated)';
const BODY_SAMPLE_MAX_BYTES = 60000; // enough to catch parked-page boilerplate without reading whole pages

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const m = /^--([a-zA-Z-]+)=(.*)$/.exec(arg);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

// ---- Small helpers ----

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Hostname with a leading "www." stripped, lowercased - a deliberately
// simple same-site comparison (not full eTLD+1 parsing). Good enough to
// tell "stayed on roughly the same site" from "redirected somewhere else
// entirely", which is all the report needs it for.
export function baseHost(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.startsWith('www.') ? h.slice(4) : h;
  } catch {
    return null;
  }
}

export function isFacebookHost(hostname) {
  return /(^|\.)(facebook\.com|fb\.com|fb\.me)$/i.test(hostname || '');
}

// Known parking/placeholder-page phrases, checked against the first chunk
// of the HTML body on an otherwise-200 response (status alone can't catch
// these - a parked domain still answers 200). Each entry's second element
// is the human-readable label shown in the report when it matches.
// Signatures that are specific enough to registrar/host/page-builder
// placeholder text that a real, built-out site is very unlikely to ever
// contain them, however long the page is - checked unconditionally.
const PARKED_SIGNATURES_STRONG = [
  [/this domain is parked/i, 'domain parking page'],
  [/buy this domain/i, '"buy this domain" parking page'],
  [/domain (?:name )?may be for sale/i, 'domain-for-sale notice'],
  [/this domain is for sale/i, 'domain-for-sale notice'],
  [/parked\s*(?:free)?\s*,?\s*(?:courtesy of|by)/i, 'domain parking page'],
  [/sedo domain parking/i, 'Sedo parking page'],
  [/hugedomains\.com/i, 'HugeDomains for-sale page'],
  [/parkingcrew/i, 'ParkingCrew parking page'],
  [/future home of something (?:quite cool|great)/i, 'GoDaddy "future home" placeholder'],
  [/account (?:has been|is) suspended/i, 'hosting account suspended'],
  [/is this your domain\?/i, 'registrar "is this your domain" page'],
  [/renew your (?:wix )?(?:premium )?plan/i, 'Wix "renew your plan" placeholder'],
  [/created (?:for free )?with wix\.com[\s\S]{0,60}renew/i, 'Wix unclaimed-site placeholder'],
  [/squarespace[\s\S]{0,60}(?:expired|unclaimed)/i, 'Squarespace placeholder'],
  [/weebly[\s\S]{0,40}(?:site unpublished|has expired)/i, 'Weebly unpublished-site notice']
];

// Short, everyday phrases that a real, fully-built site can easily contain
// in passing - "our new site is under construction, meanwhile visit
// <other domain>", a stale WordPress tagline nobody bothered to change,
// "online giving coming soon!" and so on (all three seen in real CCA Finder
// data - 2026-11-24). These only count as a parked/placeholder signal when
// the rest of the page is also short, i.e. there isn't much of anything
// ELSE there - which is what an actual placeholder page looks like.
const PARKED_SIGNATURES_WEAK = [
  [/website\s*(?:is)?\s*coming soon/i, '"coming soon" placeholder'],
  [/under construction/i, '"under construction" page'],
  [/just another wordpress site/i, 'default WordPress tagline (site likely never set up)']
];

// A real placeholder/parked page is almost always just a one-liner plus
// registrar/host chrome - nowhere near this much visible text once tags,
// scripts, styles and comments are stripped out.
const SHORT_PAGE_VISIBLE_TEXT_THRESHOLD = 1500;

// Removes the parts of a page that a visitor never actually reads or sees
// rendered: HTML comments (dead/disabled markup - e.g. a leftover modal
// that still says "under construction" but is commented out), <script>
// blocks (including JSON-LD/schema.org metadata, which can carry a stale
// default description like "Just another WordPress site" even on a fully
// built-out site), and <style> blocks. Matching signatures against this
// instead of the raw HTML avoids flagging real, live sites over text that
// isn't actually part of the page a human visitor sees.
function stripNonVisible(html) {
  return html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
}

function visibleTextLength(strippedHtml) {
  return strippedHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;
}

// Detects an interactive bot/human-verification interstitial - Cloudflare's
// "Verify you are human" Managed Challenge (what Larry's screenshot showed
// for calvarychapelbartlett.com, 2026-11-24), its older "Just a moment..."/
// "Attention Required!" pages, etc. - being served INSTEAD OF the real
// page. This matters because it can slip past both checks in the wrong
// direction: the fast check could otherwise call a 200-status challenge
// page "passed" (nothing about it matches a parked-page signature either),
// and a real headless browser - see runDeepCheck - often gets served the
// exact same interactive checkpoint a script would, since headless
// automation is one of the things these challenges are built to catch. We
// deliberately never try to click through or solve the challenge (that
// would just be bypassing the site's own bot-detection by another name) -
// only detect it and say so honestly, so neither check draws a false
// "confirmed fine" (or "parked") conclusion from a challenge page's own
// text instead of the site's actual content.
const BOT_CHALLENGE_SIGNATURES = [
  [/performing security verification/i, 'Cloudflare "Verify you are human" challenge'],
  [/verify you are human/i, 'Cloudflare "Verify you are human" challenge'],
  [/checking (?:your browser|if the site connection is secure)/i, 'Cloudflare browser-check interstitial'],
  [/just a moment\.\.\./i, 'Cloudflare "Just a moment..." interstitial'],
  [/attention required!\s*\|\s*cloudflare/i, 'Cloudflare "Attention Required" block page'],
  [/ddos protection by cloudflare/i, 'Cloudflare DDoS-protection interstitial'],
  [/enable javascript and cookies to continue/i, 'Cloudflare JS/cookie challenge notice']
];

export function detectBotChallenge(bodyText) {
  if (!bodyText) return null;
  for (const [re, label] of BOT_CHALLENGE_SIGNATURES) {
    if (re.test(bodyText)) return label;
  }
  return null;
}

export function detectParkedSignature(bodyText) {
  if (!bodyText) return null;
  const visible = stripNonVisible(bodyText);
  for (const [re, label] of PARKED_SIGNATURES_STRONG) {
    if (re.test(visible)) return label;
  }
  if (visibleTextLength(visible) < SHORT_PAGE_VISIBLE_TEXT_THRESHOLD) {
    for (const [re, label] of PARKED_SIGNATURES_WEAK) {
      if (re.test(visible)) return label;
    }
  }
  return null;
}

export function describeFetchError(err) {
  if (!err) return 'Unknown error';
  if (err.name === 'AbortError') return 'Timed out waiting for a response';
  const cause = err.cause || err;
  const code = cause && cause.code;
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'Domain does not resolve (DNS lookup failed)';
  if (code === 'ECONNREFUSED') return 'Connection refused';
  if (code === 'ECONNRESET') return 'Connection reset by the server';
  if (code === 'CERT_HAS_EXPIRED') return "SSL certificate has expired";
  if (code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || code === 'SELF_SIGNED_CERT_IN_CHAIN') return 'SSL certificate is self-signed/untrusted';
  if (code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') return 'SSL certificate could not be verified';
  if (code && /CERT|SSL|TLS/i.test(String(code))) return 'SSL/TLS error (' + code + ')';
  // Node/undici's own wording for an abrupt mid-request disconnect (no
  // specific error code) - e.g. "other side closed". Left as-is rather than
  // relabeled, but see isDnsFailure()/the deep-check flow below: this kind
  // of error is treated as a possible bot/firewall block, same as a 403.
  return (cause && cause.message) || err.message || String(err);
}

// True only for errors a real browser can't do anything about either (the
// domain itself doesn't exist). Used to decide what's worth a slower,
// real-browser recheck: a DNS failure stays a DNS failure no matter what
// does the asking, so there's no point retrying those with Playwright -
// but almost everything else (a dropped connection, a timeout, even most
// TLS errors - Chromium's cert-chain handling is more complete than
// Node's default) is worth a second opinion from something that looks
// like an ordinary browser instead of a script.
export function isDnsFailure(err) {
  if (!err) return false;
  const cause = err.cause || err;
  const code = cause && cause.code;
  return code === 'ENOTFOUND' || code === 'EAI_AGAIN';
}

// Common status codes get a plain-English label next to the number, so the
// report doesn't assume anyone has them memorized (added 2026-11-24 at
// Larry's request).
const HTTP_STATUS_DESCRIPTIONS = {
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  406: 'Not Acceptable',
  408: 'Request Timeout',
  409: 'Conflict',
  410: 'Gone',
  411: 'Length Required',
  413: 'Payload Too Large',
  414: 'URI Too Long',
  429: 'Too Many Requests',
  451: 'Unavailable For Legal Reasons',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
  520: 'Unknown Error (Cloudflare-specific)',
  521: 'Web Server Is Down (Cloudflare-specific)',
  522: 'Connection Timed Out (Cloudflare-specific)',
  523: 'Origin Is Unreachable (Cloudflare-specific)',
  524: 'A Timeout Occurred (Cloudflare-specific)',
  525: 'SSL Handshake Failed (Cloudflare-specific)',
  526: 'Invalid SSL Certificate (Cloudflare-specific)'
};

export function describeStatus(status) {
  const label = HTTP_STATUS_DESCRIPTIONS[status];
  return 'HTTP ' + status + (label ? ' (' + label + ')' : '');
}

// Reads only up to maxBytes of the response body - plenty to catch parked
// page boilerplate (which is always near the top) without pulling down
// multi-MB pages for 1,400+ sites.
export async function readBodySample(res, maxBytes = BODY_SAMPLE_MAX_BYTES) {
  if (!res.body || typeof res.body.getReader !== 'function') {
    try {
      return (await res.text()).slice(0, maxBytes);
    } catch {
      return '';
    }
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let received = 0;
  let out = '';
  try {
    while (received < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      out += decoder.decode(value, { stream: true });
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
  }
  return out;
}

async function fetchWithTimeout(url, { timeoutMs, userAgent }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      // Headers chosen to look like an ordinary Chrome tab, not a script -
      // some sites' bot/WAF protection (Cloudflare, Sucuri, Wordfence, etc.)
      // 403s a request missing these even though a human visiting the same
      // URL in a browser gets right in. This won't defeat protection that
      // fingerprints the TLS handshake itself (Node's differs from
      // Chrome's no matter what headers say) - see the README's "About
      // 403s" section for what to do about those.
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1'
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

// Network-level check with one retry on timeout/DNS/connection errors only
// (an HTTP 404/500 is a real, final answer - retrying it just wastes time).
export async function checkUrl(url, opts) {
  const attempts = 1 + Math.max(0, opts.retries || 0);
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetchWithTimeout(url, opts);
      return { ok: true, response };
    } catch (err) {
      lastError = err;
      if (attempt < attempts - 1) await sleep(1000);
    }
  }
  return { ok: false, error: lastError };
}

// Status codes that are routinely returned by bot/WAF protection (Cloudflare,
// Sucuri, Wordfence, Imperva, etc.) to an automated request that a real
// browser sailing through the same URL never sees - 403 for "you look like
// a bot, denied" and 429 for "you're making too many requests" (which can
// legitimately be OUR OWN concurrency rather than anything wrong with the
// site). Both get their own category rather than being lumped in with a
// genuine 404/410, since they're much more likely to be a false alarm - see
// the README's "About 403s" section.
const LIKELY_BLOCKED_STATUSES = new Set([403, 429]);

// ---- Per-church categorization ----
//
// Eleven possible outcomes (see README.md "Categories" for the full
// rationale). A church with the literal "(404)" marker already in its
// website field is routed to one of the marker-specific categories
// INSTEAD OF the generic ones, since confirming/clearing that marker is
// the point - it's never double-counted.
//
// Every returned outcome also carries a top-level `deepCheckUrl`: non-null
// only for results worth a slower, real-browser second opinion (see
// isDnsFailure() and the README's "About 403s" / "Real-browser recheck"
// sections) - `main()`'s optional Phase 2 uses this to decide what to
// re-visit with Playwright. It's null for everything else, including
// categories where a browser wouldn't tell us anything new (a confirmed
// DNS failure, a plain 404, Facebook's own always-manual bucket, etc.).

export async function checkChurch(church, opts) {
  const base = { id: church.id, name: church.name, city: church.citystatezip || '' };
  const raw = (church.website || '').trim();

  if (!raw) {
    return { category: 'noWebsite', row: { ...base, originalUrl: '', checkedUrl: null, detail: 'No website on file' }, deepCheckUrl: null, needsManualCheck: false };
  }

  const hadMarker = /\(404\)\s*$/i.test(raw);
  const cleaned = raw.replace(/\s*\(404\)\s*$/i, '').trim();
  const testUrl = /^https?:\/\//i.test(cleaned) ? cleaned : 'https://' + cleaned;
  const originalHost = baseHost(testUrl);

  if (!originalHost) {
    const detail = 'Could not parse "' + raw + '" as a URL';
    return hadMarker
      ? { category: 'markerStillBroken', row: { ...base, originalUrl: raw, checkedUrl: null, detail }, deepCheckUrl: null, needsManualCheck: false }
      : { category: 'unreachable', row: { ...base, originalUrl: raw, checkedUrl: null, detail }, deepCheckUrl: null, needsManualCheck: false };
  }

  // Every row from here on actually has a URL that was (or would be) hit,
  // so it can link straight to it - see renderRows / the README's "Links
  // in the report" note.
  const row = { ...base, originalUrl: raw, checkedUrl: testUrl };

  const isFb = isFacebookHost(originalHost);
  const result = await checkUrl(testUrl, opts);

  if (!result.ok) {
    const detail = describeFetchError(result.error);
    if (isFb) return { category: 'facebook', row: { ...row, detail: 'Unreachable — ' + detail }, deepCheckUrl: null, needsManualCheck: true };
    // A real DNS failure stays a DNS failure for a browser too - not worth
    // a slower recheck. Anything else (a dropped connection, "other side
    // closed", a timeout, most TLS errors) might just be bot/firewall
    // protection reacting to a non-browser client, so it's a candidate -
    // and, same reasoning, worth a manual look too unless/until the deep
    // check (if it runs) resolves it one way or the other.
    const eligible = !isDnsFailure(result.error);
    return hadMarker
      ? { category: 'markerStillBroken', row: { ...row, detail }, deepCheckUrl: eligible ? testUrl : null, needsManualCheck: eligible }
      : { category: 'unreachable', row: { ...row, detail }, deepCheckUrl: eligible ? testUrl : null, needsManualCheck: eligible };
  }

  const res = result.response;
  const status = res.status;
  const finalHost = baseHost(res.url) || originalHost;
  // Facebook's/redirects' own destination can differ from what we tested -
  // link to wherever we actually ended up, not just where we started.
  row.checkedUrl = res.url || testUrl;

  if (isFb) {
    const detail =
      status >= 200 && status < 400
        ? describeStatus(status) + (res.redirected ? ' (redirected to ' + res.url + ')' : '') + ' — verify manually'
        : describeStatus(status) + ' — verify manually';
    try {
      res.body?.cancel?.();
    } catch {
      /* ignore */
    }
    return { category: 'facebook', row: { ...row, detail }, deepCheckUrl: null, needsManualCheck: true };
  }

  if (LIKELY_BLOCKED_STATUSES.has(status)) {
    const detail = describeStatus(status) + ' — likely bot/rate-limit protection, not necessarily broken; open the link yourself to confirm';
    return hadMarker
      ? {
          category: 'markerStillBroken',
          row: { ...row, detail: describeStatus(status) + ' (may just be bot-blocking an automated check — open manually to confirm before trusting this)' },
          deepCheckUrl: row.checkedUrl,
          needsManualCheck: true
        }
      : { category: 'likelyBlocked', row: { ...row, detail }, deepCheckUrl: row.checkedUrl, needsManualCheck: true };
  }

  if (status >= 500) {
    const detail = describeStatus(status);
    return hadMarker
      ? { category: 'markerStillBroken', row: { ...row, detail }, deepCheckUrl: null, needsManualCheck: false }
      : { category: 'server5xx', row: { ...row, detail }, deepCheckUrl: null, needsManualCheck: false };
  }

  if (status >= 400) {
    const detail = describeStatus(status);
    return hadMarker
      ? { category: 'markerStillBroken', row: { ...row, detail }, deepCheckUrl: null, needsManualCheck: false }
      : { category: 'client4xx', row: { ...row, detail }, deepCheckUrl: null, needsManualCheck: false };
  }

  if (finalHost !== originalHost) {
    const detail = cleaned + '  →  ' + res.url;
    return hadMarker
      ? { category: 'markerNowResolves', row: { ...row, detail: 'Now resolves, but redirects to a different domain: ' + detail }, deepCheckUrl: null, needsManualCheck: false }
      : { category: 'redirectedDifferentDomain', row: { ...row, detail }, deepCheckUrl: null, needsManualCheck: false };
  }

  // Same domain, 2xx/3xx final response. Sniff the body for a bot/human
  // challenge interstitial or parked-page boilerplate before declaring it
  // a real pass - a 200 status alone doesn't mean we actually saw the
  // site (see detectBotChallenge's comment and the README's "About 403s"
  // section).
  let signature = null;
  let botChallenge = null;
  const contentType = res.headers.get('content-type') || '';
  if (status === 200 && /html/i.test(contentType)) {
    try {
      const bodySample = await readBodySample(res);
      botChallenge = detectBotChallenge(bodySample);
      if (!botChallenge) signature = detectParkedSignature(bodySample);
    } catch {
      /* treat unreadable body as "can't tell" rather than failing the check */
    }
  } else {
    try {
      res.body?.cancel?.();
    } catch {
      /* ignore */
    }
  }

  if (botChallenge) {
    // Same treatment as a 403/429 - likely blocked, not necessarily
    // actually broken - rather than "passed" or "parked", since we never
    // actually saw the real page. Eligible for the real-browser recheck,
    // same as 403/429 (see isDnsFailure's comment on eligibility) - though
    // see runDeepCheck/applyDeepCheckResult for why that recheck can run
    // into the very same challenge rather than resolving it.
    const detail = describeStatus(status) + ' — served an interactive security check (' + botChallenge + ') instead of the real page; open it yourself to confirm it loads';
    return hadMarker
      ? { category: 'markerStillBroken', row: { ...row, detail }, deepCheckUrl: row.checkedUrl, needsManualCheck: true }
      : { category: 'likelyBlocked', row: { ...row, detail }, deepCheckUrl: row.checkedUrl, needsManualCheck: true };
  }

  if (signature) {
    const detail = describeStatus(status) + ' — page text matches ' + signature;
    return hadMarker
      ? { category: 'markerStillBroken', row: { ...row, detail }, deepCheckUrl: null, needsManualCheck: false }
      : { category: 'parked', row: { ...row, detail }, deepCheckUrl: null, needsManualCheck: false };
  }

  if (hadMarker) {
    const detail =
      'Now resolves fine (' + describeStatus(status) + (res.redirected ? ', redirected to ' + res.url : '') + ') — the (404) tag looks stale, consider removing it';
    return { category: 'markerNowResolves', row: { ...row, detail }, deepCheckUrl: null, needsManualCheck: false };
  }

  return { category: 'passed', row: null, deepCheckUrl: null, needsManualCheck: false };
}

// ---- Deep-check: re-verify a likely false positive with a real browser ----
//
// Pure/testable half of the deep-check flow: given an outcome from
// checkChurch() and the result of actually visiting deepCheckUrl with a
// real browser (see runDeepCheck, the I/O half, in main()'s Phase 2),
// decides what the outcome should become. Kept separate from runDeepCheck
// so this decision logic is unit-testable without a real browser or
// network - see check-links.test.mjs.
//
// deepResult shape: { ok: boolean, status?, finalUrl?, signature?, error? }
// - ok:true  -> navigation succeeded with a non-error status (status < 400)
// - ok:false -> navigation failed outright, OR the browser also got a 4xx/5xx;
//               `error` is a human-readable reason either way
export function applyDeepCheckResult(outcome, deepResult) {
  if (!deepResult) return outcome;

  // The real browser ran into the same kind of interactive "prove you're
  // human" page a script would - not evidence the link is fine (we never
  // saw the real page), and not evidence it's broken either (quite the
  // opposite: it's a stronger sign this really is bot-protection). Leave
  // the outcome's category exactly where the fast check put it rather
  // than promoting it to "confirmed fine"/"parked" or demoting it to
  // "confirmed broken" - see detectBotChallenge's comment for why we never
  // try to get past the challenge itself.
  if (deepResult.challenged) {
    const note =
      ' — a real browser also ran into an interactive security check (' +
      (deepResult.challengeLabel || 'a bot-detection challenge') +
      ') instead of the real page; this looks like bot-protection, not a dead link — open it yourself in your own browser to confirm it loads fine for you';
    return { ...outcome, needsManualCheck: true, row: { ...outcome.row, detail: outcome.row.detail + note } };
  }

  if (!deepResult.ok) {
    // A 403/429 from the headless-browser recheck is NOT solid evidence of
    // a genuine problem, even though a real browser engine made the
    // request - Playwright's headless Chromium can itself be fingerprinted
    // as automated (e.g. navigator.webdriver, missing browser-runtime
    // signals Chrome normally has) and blocked by the very same rule that
    // blocked the plain fetch, regardless of whether the site works fine
    // for an actual visitor. Larry confirmed this in practice (2026-11-24,
    // cckeweenaw.com and others): several sites the deep-check still
    // called "blocked" opened perfectly normally in his own regular
    // browser. So for that specific, still-ambiguous case, say so plainly
    // instead of overclaiming "confirmed genuine." Anything else the deep
    // check turns up (a DNS failure, a connection refused, an actual
    // 404/500) is a different, unambiguous kind of failure a browser
    // engine can't talk its way around, so that case keeps the stronger
    // "likely genuine" wording.
    const stillAmbiguous = deepResult.status && LIKELY_BLOCKED_STATUSES.has(deepResult.status);
    const note = stillAmbiguous
      ? ' — a browser-automated recheck got the same ' +
        describeStatus(deepResult.status) +
        '. That does NOT confirm this is a genuine problem: some sites specifically detect automated/headless browsers (regardless of engine) and block them the same way, so this result is still consistent with bot-detection, not a dead link. If you\'ve opened it yourself in your own regular browser and it loaded fine, trust that over this automated recheck.'
      : ' — confirmed via a real browser too (' + (deepResult.error || 'still failed') + '); this isn\'t the kind of failure automated-browser detection typically produces, so it\'s more likely a genuine problem';
    return { ...outcome, needsManualCheck: !!stillAmbiguous, row: { ...outcome.row, detail: outcome.row.detail + note } };
  }

  const finalUrl = deepResult.finalUrl || outcome.deepCheckUrl;

  if (deepResult.signature) {
    const detail =
      describeStatus(deepResult.status) + ' — a real browser also shows this is a parked/placeholder page (matches ' + deepResult.signature + ')';
    if (outcome.category === 'markerStillBroken') {
      return { ...outcome, needsManualCheck: false, row: { ...outcome.row, checkedUrl: finalUrl, detail } };
    }
    return { ...outcome, category: 'parked', needsManualCheck: false, row: { ...outcome.row, checkedUrl: finalUrl, detail } };
  }

  const redirectNote = finalUrl !== outcome.deepCheckUrl ? ', redirected to ' + finalUrl : '';

  if (outcome.category === 'markerStillBroken') {
    const detail = 'Confirmed via a real browser: now resolves fine (' + describeStatus(deepResult.status) + redirectNote + ') — the (404) tag looks stale, consider removing it';
    return { ...outcome, category: 'markerNowResolves', needsManualCheck: false, row: { ...outcome.row, checkedUrl: finalUrl, detail } };
  }

  const detail =
    'Confirmed via a real browser: opens fine (' + describeStatus(deepResult.status) + redirectNote + ') — the fast check flagged this, but it is not actually broken';
  return { ...outcome, category: 'confirmedByBrowser', needsManualCheck: false, row: { ...outcome.row, checkedUrl: finalUrl, detail } };
}

// ---- Concurrency pool ----

async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;
  const total = items.length;
  async function runner() {
    for (;;) {
      const i = next++;
      if (i >= total) return;
      results[i] = await worker(items[i]);
      done++;
      if (done % 25 === 0 || done === total) {
        process.stdout.write('\r  checked ' + done + ' / ' + total + '...   ');
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, total)) }, runner));
  process.stdout.write('\n');
  return results;
}

// ---- Report rendering ----

export const CATEGORY_META = [
  { key: 'markerNowResolves', title: 'Marked (404) in our data — now resolves', accent: '#2e7d32', columns: ['id', 'name', 'city', 'originalUrl', 'detail'] },
  { key: 'confirmedByBrowser', title: 'Flagged by the fast check, but opens fine in a real browser', accent: '#0f766e', columns: ['id', 'name', 'city', 'originalUrl', 'detail'] },
  { key: 'markerStillBroken', title: 'Marked (404) in our data — still broken', accent: '#8d6e00', columns: ['id', 'name', 'city', 'originalUrl', 'detail'] },
  { key: 'redirectedDifferentDomain', title: 'Redirected to a different domain', accent: '#2f6fa8', columns: ['id', 'name', 'city', 'originalUrl', 'detail'] },
  { key: 'parked', title: 'Possible parked / under-construction / placeholder page', accent: '#b45f06', columns: ['id', 'name', 'city', 'originalUrl', 'detail'] },
  { key: 'likelyBlocked', title: 'Blocked by bot/rate-limit protection (403, 429, or a security-check interstitial) — often fine in a browser', accent: '#946200', columns: ['id', 'name', 'city', 'originalUrl', 'detail'] },
  { key: 'client4xx', title: 'Client error (4xx)', accent: '#a61c1c', columns: ['id', 'name', 'city', 'originalUrl', 'detail'] },
  { key: 'server5xx', title: 'Server error (5xx)', accent: '#a61c1c', columns: ['id', 'name', 'city', 'originalUrl', 'detail'] },
  { key: 'unreachable', title: 'Unreachable (DNS / timeout / connection / SSL)', accent: '#a61c1c', columns: ['id', 'name', 'city', 'originalUrl', 'detail'] },
  { key: 'facebook', title: 'Facebook links — needs a human look', accent: '#555555', columns: ['id', 'name', 'city', 'originalUrl', 'detail'] },
  { key: 'noWebsite', title: 'No website on file', accent: '#777777', columns: ['id', 'name', 'city'] }
];

// Linkifies any http(s) URL found inside already-unescaped raw text,
// escaping everything (link text included) along the way. Used for the
// "Finding" column, where a redirect's destination URL (e.g. "oldsite.org
// → https://newsite.org/") should be clickable too, not just the main
// "Website on file" link.
const URL_IN_TEXT_RE = /https?:\/\/[^\s<>"')]+/g;

function linkifyText(raw) {
  if (!raw) return '';
  let out = '';
  let lastIndex = 0;
  let m;
  URL_IN_TEXT_RE.lastIndex = 0;
  while ((m = URL_IN_TEXT_RE.exec(raw))) {
    out += escapeHtml(raw.slice(lastIndex, m.index));
    let url = m[0];
    let trail = '';
    // Don't swallow trailing punctuation that's just ending the sentence.
    while (/[).,;:!]$/.test(url)) {
      trail = url.slice(-1) + trail;
      url = url.slice(0, -1);
    }
    const safeUrl = escapeHtml(url);
    out += '<a href="' + safeUrl + '" target="_blank" rel="noopener noreferrer">' + safeUrl + '</a>' + escapeHtml(trail);
    lastIndex = m.index + m[0].length;
  }
  out += escapeHtml(raw.slice(lastIndex));
  return out;
}

function renderRows(rows, columns) {
  const headers = {
    id: 'ID',
    name: 'Church',
    city: 'City / State',
    originalUrl: 'Website on file',
    detail: 'Finding'
  };
  const thead = '<tr>' + columns.map((c) => '<th>' + headers[c] + '</th>').join('') + '</tr>';
  const tbody = rows
    .map(
      (r) =>
        '<tr>' +
        columns
          .map((c) => {
            if (c === 'originalUrl' && r[c]) {
              // Click-through goes to the actual URL we tested (normalized,
              // scheme added if it was missing) rather than the raw stored
              // text, so it always works even when the (404) marker or a
              // bare domain (no https://) is part of what's on file.
              const label = escapeHtml(r[c]);
              const inner = r.checkedUrl ? '<a href="' + escapeHtml(r.checkedUrl) + '" target="_blank" rel="noopener noreferrer">' + label + '</a>' : label;
              return '<td class="url-cell">' + inner + '</td>';
            }
            if (c === 'detail') {
              return '<td>' + linkifyText(r[c]) + '</td>';
            }
            return '<td>' + escapeHtml(r[c]) + '</td>';
          })
          .join('') +
        '</tr>'
    )
    .join('');
  return '<table><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table>';
}

export function renderReport({ generatedAt, sourceUrl, totalChecked, passedCount, categories }) {
  const summaryItems = [
    '<li class="summary-pass"><strong>' + passedCount + '</strong> of <strong>' + totalChecked + '</strong> church website links passed (resolve normally, no action needed)</li>'
  ]
    .concat(
      CATEGORY_META.filter((m) => categories[m.key].length > 0).map(
        (m) => '<li><a href="#' + m.key + '"><strong>' + categories[m.key].length + '</strong> — ' + escapeHtml(m.title) + '</a></li>'
      )
    )
    .join('');

  const sections = CATEGORY_META.filter((m) => categories[m.key].length > 0)
    .map(
      (m) =>
        '<section id="' +
        m.key +
        '" style="border-left-color:' +
        m.accent +
        '">' +
        '<h2>' +
        escapeHtml(m.title) +
        ' <span class="count">(' +
        categories[m.key].length +
        ')</span></h2>' +
        renderRows(categories[m.key], m.columns) +
        '</section>'
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Church Website Link Report - ${escapeHtml(generatedAt)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0; padding: 24px 32px 64px; max-width: 1100px; margin-inline: auto; line-height: 1.45; }
  h1 { margin-bottom: 4px; }
  .meta { color: #666; font-size: 14px; margin-bottom: 24px; }
  .summary { background: #f4f6f8; border: 1px solid #dde3e8; border-radius: 8px; padding: 16px 20px; margin-bottom: 32px; }
  .summary h2 { margin-top: 0; font-size: 16px; }
  .summary ul { margin: 0; padding-left: 20px; }
  .summary li { margin: 4px 0; }
  .summary-pass { color: #2e7d32; }
  section { border-left: 5px solid #999; padding: 4px 0 4px 16px; margin: 0 0 36px; }
  section h2 { font-size: 17px; margin-bottom: 10px; }
  .count { font-weight: normal; color: #777; font-size: 14px; }
  table { border-collapse: collapse; width: 100%; font-size: 13.5px; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #e5e5e5; vertical-align: top; }
  th { background: #fafafa; position: sticky; top: 0; }
  .url-cell { word-break: break-all; font-family: Consolas, Menlo, monospace; font-size: 12.5px; }
  a { color: #2f6fa8; }
  @media (prefers-color-scheme: dark) {
    body { background: #1b1d1f; color: #e6e6e6; }
    .summary { background: #26292c; border-color: #3a3f44; }
    .meta { color: #aaa; }
    th { background: #222527; }
    th, td { border-bottom-color: #33373a; }
    a { color: #7fb4e0; }
  }
</style>
</head>
<body>
  <h1>Church Website Link Report</h1>
  <div class="meta">Generated ${escapeHtml(generatedAt)} &middot; source: ${escapeHtml(sourceUrl)} &middot; ${totalChecked} churches checked</div>
  <div class="summary">
    <h2>Summary</h2>
    <ul>${summaryItems}</ul>
  </div>
  ${sections}
</body>
</html>`;
}

// ---- Main ----

async function loadChurches(sourceUrl) {
  if (/^https?:\/\//i.test(sourceUrl)) {
    const res = await fetch(sourceUrl, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error('Could not load church list (' + sourceUrl + ' returned HTTP ' + res.status + ')');
    const data = await res.json();
    return Array.isArray(data) ? data : data.churches || data.data || [];
  }
  // Local file path, mainly for testing offline against a saved export.
  const raw = await (await import('node:fs/promises')).readFile(sourceUrl, 'utf8');
  const data = JSON.parse(raw);
  return Array.isArray(data) ? data : data.churches || data.data || [];
}

function todayStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

// ---- Deep-check Phase 2 (optional, needs Playwright) ----
//
// I/O half of the deep-check flow - actually opens url in a real, shared
// headless Chromium instance and reports what happened. The decision logic
// (what that result should change about the outcome) lives in
// applyDeepCheckResult above, so it can be unit-tested without this.
async function runDeepCheck(browser, url, timeoutMs) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    let response;
    try {
      response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    } catch (err) {
      return { ok: false, error: describeBrowserError(err) };
    }
    if (!response) return { ok: false, error: 'the browser produced no response' };
    const status = response.status();
    const finalUrl = page.url();
    let bodySample = '';
    try {
      bodySample = (await page.content()).slice(0, BODY_SAMPLE_MAX_BYTES);
    } catch {
      /* status is still meaningful even if we can't read the rendered body */
    }
    // Check for a bot/human-verification interstitial BEFORE looking at
    // status - Cloudflare serves these at a mix of statuses (often 403,
    // sometimes a plain 200), and either way it means we didn't actually
    // see the real page (see detectBotChallenge's comment).
    const challenge = detectBotChallenge(bodySample);
    if (challenge) {
      return { ok: false, challenged: true, challengeLabel: challenge, status, finalUrl, error: 'still shows an interactive security check (' + challenge + ') instead of the real page' };
    }
    if (status >= 400) return { ok: false, status, finalUrl, error: describeStatus(status) };
    return { ok: true, status, finalUrl, signature: detectParkedSignature(bodySample) };
  } finally {
    await context.close().catch(() => {});
  }
}

function describeBrowserError(err) {
  const msg = (err && err.message) || String(err);
  if (/ERR_NAME_NOT_RESOLVED/.test(msg)) return 'domain does not resolve';
  if (/ERR_CONNECTION_REFUSED/.test(msg)) return 'connection refused';
  if (/Timeout .*exceeded|ERR_TIMED_OUT|ERR_CONNECTION_TIMED_OUT/.test(msg)) return 'timed out';
  if (/ERR_CERT|SSL|TLS/i.test(msg)) return 'SSL/certificate error';
  if (/ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_EMPTY_RESPONSE/.test(msg)) return 'connection was reset/closed';
  return 'navigation failed (' + msg.split('\n')[0].slice(0, 160) + ')';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceUrl = args.source || DEFAULT_SOURCE_URL;
  const concurrency = Number(args.concurrency) || DEFAULT_CONCURRENCY;
  const timeoutMs = Number(args.timeout) || DEFAULT_TIMEOUT_MS;
  const retries = args.retries !== undefined ? Number(args.retries) : DEFAULT_RETRIES;
  const deepCheckRequested = args['deep-check'] !== 'false' && args['deep-check'] !== '0';
  const deepConcurrency = Number(args['deep-concurrency']) || DEFAULT_DEEP_CONCURRENCY;
  const deepTimeoutMs = Number(args['deep-timeout']) || DEFAULT_DEEP_TIMEOUT_MS;

  console.log('Church Website Link Health Check');
  console.log('  source:      ' + sourceUrl);
  console.log('  concurrency: ' + concurrency);
  console.log('  timeout:     ' + timeoutMs + 'ms (retries: ' + retries + ')');
  console.log('  deep-check:  ' + (deepCheckRequested ? 'on (real-browser recheck of likely false positives)' : 'off'));
  console.log('');
  console.log('Loading church list...');

  const churches = await loadChurches(sourceUrl);
  console.log('Loaded ' + churches.length + ' churches. Checking website links (this can take several minutes)...');

  const opts = { timeoutMs, userAgent: USER_AGENT, retries };
  const outcomes = await runPool(churches, concurrency, (church) => checkChurch(church, opts));

  // ---- Phase 2: re-verify likely false positives with a real browser ----
  // Only the subset checkChurch marked deepCheckUrl on (403/429, and a
  // non-DNS connection/timeout/SSL error - see checkChurch's comment)
  // - typically a few dozen out of 1,400+, not everything.
  if (deepCheckRequested) {
    const candidates = [];
    outcomes.forEach((o, i) => {
      if (o && o.deepCheckUrl) candidates.push(i);
    });

    if (!candidates.length) {
      console.log('No likely false positives to re-check with a real browser this run.');
    } else {
      let chromium;
      try {
        ({ chromium } = await import('playwright'));
      } catch {
        console.log(
          '(' +
            candidates.length +
            ' result(s) could use a real-browser recheck, but Playwright is not installed - skipping. ' +
            'Run "npm install" then "npx playwright install chromium" once in this folder to enable it. See README.md "About 403s".)'
        );
      }
      if (chromium) {
        console.log('Re-checking ' + candidates.length + ' likely false positive(s) with a real headless browser (slower - a few minutes)...');
        let browser;
        try {
          browser = await chromium.launch({ headless: true });
          const updates = await runPool(candidates, deepConcurrency, async (i) => {
            const deepResult = await runDeepCheck(browser, outcomes[i].deepCheckUrl, deepTimeoutMs);
            return { i, outcome: applyDeepCheckResult(outcomes[i], deepResult) };
          });
          for (const u of updates) outcomes[u.i] = u.outcome;
        } catch (err) {
          console.log(
            '(Real-browser recheck could not run: ' +
              (err && err.message ? err.message : err) +
              '. Try "npx playwright install chromium" once, then re-run. Continuing with the fast-check results.)'
          );
        } finally {
          if (browser) await browser.close().catch(() => {});
        }
      }
    }
  }

  const categories = Object.fromEntries(CATEGORY_META.map((m) => [m.key, []]));
  let passedCount = 0;
  // Entries worth a human glance (see checkChurch/applyDeepCheckResult's
  // needsManualCheck field) - written out alongside the HTML report as a
  // small sidecar file that review-flagged.mjs reads, so Larry can open
  // just these, one at a time, instead of hunting through the full report
  // by hand. See README.md "Reviewing what's left - review-flagged.mjs".
  const needsReview = [];
  for (const outcome of outcomes) {
    if (!outcome) continue;
    if (outcome.category === 'passed') {
      passedCount++;
    } else {
      categories[outcome.category].push(outcome.row);
      if (outcome.needsManualCheck && outcome.row && outcome.row.checkedUrl) {
        needsReview.push({
          id: outcome.row.id,
          name: outcome.row.name,
          city: outcome.row.city,
          url: outcome.row.checkedUrl,
          category: outcome.category,
          detail: outcome.row.detail
        });
      }
    }
  }

  // Keep each category's rows in a stable, readable order.
  for (const key of Object.keys(categories)) {
    categories[key].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }
  needsReview.sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const generatedAt = new Date().toLocaleString();
  const html = renderReport({
    generatedAt,
    sourceUrl,
    totalChecked: churches.length,
    passedCount,
    categories
  });

  const reportsDir = path.join(__dirname, 'reports');
  if (!existsSync(reportsDir)) await mkdir(reportsDir, { recursive: true });
  const stamp = todayStamp();
  const outPath = path.join(reportsDir, 'Church_Website_Link_Report_' + stamp + '.html');
  await writeFile(outPath, html, 'utf8');

  const reviewPath = path.join(reportsDir, 'Church_Website_Link_Report_' + stamp + '.review.json');
  await writeFile(reviewPath, JSON.stringify({ generatedAt, sourceUrl, entries: needsReview }, null, 2), 'utf8');

  console.log('');
  console.log('Done. ' + passedCount + ' / ' + churches.length + ' passed.');
  for (const m of CATEGORY_META) {
    if (categories[m.key].length) console.log('  ' + categories[m.key].length + '  ' + m.title);
  }
  console.log('');
  console.log('Report written to: ' + outPath);
  if (needsReview.length) {
    console.log(needsReview.length + ' of those are worth a quick manual look (see above for which categories).');
    console.log('Run "node review-flagged.mjs" (or double-click review.bat) to open them one at a time -');
    console.log('just close each browser window after you glance at it, and the next one opens automatically.');
  }

  if (process.platform === 'win32') {
    exec('start "" "' + outPath + '"', () => {});
  }
}

// Only run when this file is executed directly (e.g. `node check-links.mjs`
// or via run.bat) - not when imported, so the test file can import the
// functions above without kicking off a real run.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => {
    console.error('\nFailed: ' + (err && err.message ? err.message : err));
    process.exitCode = 1;
  });
}
