// Standalone tests for check-links.mjs's categorization logic.
// Mocks global.fetch so these run with NO real network access - safe to
// run anywhere, including a sandboxed environment with restricted egress.
//
// Run with: node check-links.test.mjs

import assert from 'node:assert/strict';
import { checkChurch, baseHost, isFacebookHost, detectParkedSignature, detectBotChallenge, describeStatus, isDnsFailure, applyDeepCheckResult } from './check-links.mjs';

const opts = { timeoutMs: 5000, userAgent: 'test-agent', retries: 1 };

function mockResponse({ status = 200, url, redirected = false, headers = {}, text = '' }) {
  const h = new Map(Object.entries(headers));
  return {
    status,
    url,
    redirected,
    headers: { get: (k) => h.get(k.toLowerCase()) ?? h.get(k) ?? null },
    text: async () => text,
    body: null // forces readBodySample's res.text() fallback path
  };
}

async function withMockFetch(impl, fn) {
  const original = global.fetch;
  global.fetch = impl;
  try {
    await fn();
  } finally {
    global.fetch = original;
  }
}

let passCount = 0;
function check(name, cond) {
  assert.ok(cond, name);
  passCount++;
  console.log('ok - ' + name);
}

async function run() {
  // ---- Pure helper functions, no network ----
  check('baseHost strips www', baseHost('https://www.example.org/x') === 'example.org');
  check('baseHost lowercases', baseHost('https://Example.ORG') === 'example.org');
  check('baseHost returns null for garbage', baseHost('not a url at all') === null);

  check('isFacebookHost matches facebook.com', isFacebookHost('www.facebook.com'));
  check('isFacebookHost matches fb.me', isFacebookHost('fb.me'));
  check('isFacebookHost rejects lookalike domain', !isFacebookHost('facebook.com.evil.example'));

  check('detectParkedSignature catches GoDaddy placeholder', detectParkedSignature('Future home of something quite cool.') !== null);
  check('detectParkedSignature catches "under construction"', detectParkedSignature('This page is Under Construction, check back soon') !== null);
  check('detectParkedSignature returns null for ordinary church copy', detectParkedSignature('Welcome to Calvary Chapel, join us Sunday at 10am') === null);

  // ---- detectParkedSignature false-positive regressions (2026-11-24) ----
  // Larry reported three real, built-out church sites wrongly landing in
  // "Possible parked / placeholder page": a stale WordPress tagline only
  // present in JSON-LD schema metadata (never rendered to a visitor), an
  // "under construction" mention left behind in a commented-out (dead,
  // never-rendered) bit of markup, and a genuine "...new site, under
  // construction, meanwhile visit <other domain>" sentence inside an
  // otherwise long, real page. None of these should match.

  check(
    'WordPress default tagline buried in a JSON-LD <script> block (metadata, never rendered) does not flag a real page',
    detectParkedSignature(
      '<html><head><script type="application/ld+json">{"@type":"WebSite","name":"Calvary Chapel Example","description":"Just another WordPress site"}</script></head>' +
        '<body><nav>Home About Ministries Sermons Contact</nav><h1>Welcome to Calvary Chapel</h1>' +
        '<p>Join us Sundays at 10am for worship and teaching from God\'s word. We have ministries for all ages.</p>'.repeat(10) +
        '</body></html>'
    ) === null
  );

  check(
    '"under construction" inside an HTML comment (dead markup, never rendered) does not flag a real page',
    detectParkedSignature(
      '<html><body><h1>Welcome to Calvary Chapel</h1>' +
        '<!-- <div class="modal"><p>Slideshow under construction</p></div> -->' +
        '<p>Join us Sundays at 10am. We are a Christian fellowship gathering to know and glorify Jesus Christ.</p>'.repeat(10) +
        '</body></html>'
    ) === null
  );

  check(
    '"under construction" as real, visible text on an otherwise long/real page does not flag it (size-gated)',
    detectParkedSignature(
      '<html><body><nav>Home About Leadership Ministries Media Topical Messages Old Testament New Testament Matthew Mark Luke John Acts Romans</nav>' +
        '<p>Please visit our new, under construction website at example.org for the latest.</p>' +
        '<p>Meanwhile here is a full sermon archive with years of teaching content for you to read and enjoy at your leisure today.</p>'.repeat(15) +
        '</body></html>'
    ) === null
  );

  check(
    'a genuinely short placeholder page with "under construction" and nothing else still flags as parked (true positive preserved)',
    detectParkedSignature('<html><body><h1>Site under construction</h1><p>Check back soon!</p></body></html>') === '"under construction" page'
  );

  check(
    'a genuinely bare, never-configured WordPress install (short page, tagline visible) still flags as parked',
    detectParkedSignature('<html><head><title>My Site &#8211; Just another WordPress site</title></head><body><h1>Hello world!</h1></body></html>') ===
      'default WordPress tagline (site likely never set up)'
  );

  check(
    'a strong signature (explicit domain-for-sale notice) still flags regardless of how long the surrounding page is',
    detectParkedSignature(
      '<html><body><nav>Home About Ministries Sermons Media Contact Leadership Missions Outreach Events Calendar</nav>' +
        'This domain may be for sale - click here to make an offer. ' +
        '<p>Some unrelated filler paragraph text that just pads out the page length for this test case here.</p>'.repeat(15) +
        '</body></html>'
    ) === 'domain-for-sale notice'
  );

  check('describeStatus labels a common code', describeStatus(404) === 'HTTP 404 (Not Found)');
  check('describeStatus labels a Cloudflare-specific code', describeStatus(521) === 'HTTP 521 (Web Server Is Down (Cloudflare-specific))');
  check('describeStatus falls back gracefully for an unknown code', describeStatus(499) === 'HTTP 499');

  check('isDnsFailure true for ENOTFOUND', isDnsFailure({ code: 'ENOTFOUND' }));
  check('isDnsFailure true for EAI_AGAIN', isDnsFailure({ code: 'EAI_AGAIN' }));
  check('isDnsFailure false for a connection reset', !isDnsFailure({ code: 'ECONNRESET' }));
  check('isDnsFailure false for no error', !isDnsFailure(undefined));

  // ---- detectBotChallenge (added 2026-11-24, Larry's calvarychapelbartlett.com screenshot) ----

  check(
    'detectBotChallenge catches Cloudflare\'s "Verify you are human" Managed Challenge',
    detectBotChallenge('<html><body><h1>calvarychapelbartlett.com</h1><h2>Performing security verification</h2><p>This website uses a security service...</p></body></html>') ===
      'Cloudflare "Verify you are human" challenge'
  );
  check('detectBotChallenge catches the classic "Just a moment..." interstitial', detectBotChallenge('<title>Just a moment...</title>') !== null);
  check('detectBotChallenge catches the old "Attention Required! | Cloudflare" block page', detectBotChallenge('<title>Attention Required! | Cloudflare</title>') !== null);
  check('detectBotChallenge returns null for ordinary church copy', detectBotChallenge('Welcome to Calvary Chapel, join us Sunday at 10am') === null);

  // ---- checkChurch end-to-end scenarios (fetch mocked) ----

  // 1. Clean pass.
  await withMockFetch(
    async (url) => mockResponse({ status: 200, url, text: '<html>Welcome to our church</html>' }),
    async () => {
      const r = await checkChurch({ id: 1, name: 'Clean Church', website: 'https://clean.example.org' }, opts);
      check('clean 200 same-domain -> passed', r.category === 'passed');
    }
  );

  // 2. Same-domain redirect (http -> https, or bare -> www) folds into passed.
  await withMockFetch(
    async () => mockResponse({ status: 200, url: 'https://www.sametown.example.org/', redirected: true, text: 'ok' }),
    async () => {
      const r = await checkChurch({ id: 2, name: 'Www Church', website: 'http://sametown.example.org' }, opts);
      check('same-domain redirect (www/scheme) -> passed, not its own category', r.category === 'passed');
    }
  );

  // 3. Cross-domain redirect.
  await withMockFetch(
    async () => mockResponse({ status: 200, url: 'https://totallydifferent.example.net/', redirected: true, text: 'ok' }),
    async () => {
      const r = await checkChurch({ id: 3, name: 'Moved Church', website: 'https://oldname.example.org' }, opts);
      check('cross-domain redirect -> redirectedDifferentDomain', r.category === 'redirectedDifferentDomain');
      check('cross-domain redirect detail mentions both URLs', r.row.detail.includes('oldname.example.org') && r.row.detail.includes('totallydifferent.example.net'));
    }
  );

  // 4. Parked page (200 but body matches a signature).
  await withMockFetch(
    async (url) => mockResponse({ status: 200, url, headers: { 'content-type': 'text/html' }, text: 'This domain is parked by a registrar.' }),
    async () => {
      const r = await checkChurch({ id: 4, name: 'Lapsed Church', website: 'https://lapsed.example.org' }, opts);
      check('parked-page body text -> parked category', r.category === 'parked');
    }
  );

  // 5. 404.
  await withMockFetch(
    async (url) => mockResponse({ status: 404, url }),
    async () => {
      const r = await checkChurch({ id: 5, name: 'Dead Church', website: 'https://dead.example.org' }, opts);
      check('HTTP 404 -> client4xx', r.category === 'client4xx');
      check('detail records the status code', r.row.detail.includes('404'));
    }
  );

  // 5b. 403 goes to its own "likely blocked" bucket, not client4xx - these
  // are commonly bot-protection false positives (Larry's 2026-11-24 report:
  // many 403s opened fine by hand).
  await withMockFetch(
    async (url) => mockResponse({ status: 403, url }),
    async () => {
      const r = await checkChurch({ id: 14, name: 'Bot-Walled Church', website: 'https://botwalled.example.org' }, opts);
      check('HTTP 403 -> likelyBlocked, not client4xx', r.category === 'likelyBlocked');
      check('403 detail suggests checking manually', r.row.detail.toLowerCase().includes('confirm'));
    }
  );

  // 5c. 429 (rate-limited) also goes to likelyBlocked.
  await withMockFetch(
    async (url) => mockResponse({ status: 429, url }),
    async () => {
      const r = await checkChurch({ id: 15, name: 'Rate Limited Church', website: 'https://ratelimited.example.org' }, opts);
      check('HTTP 429 -> likelyBlocked', r.category === 'likelyBlocked');
    }
  );

  // 5d. A (404)-marked entry that comes back 403 stays in the marker
  // bucket (that's still the point of the check) but flags the ambiguity.
  await withMockFetch(
    async (url) => mockResponse({ status: 403, url }),
    async () => {
      const r = await checkChurch({ id: 16, name: 'Marked But Walled Church', website: 'https://markedwalled.example.org (404)' }, opts);
      check('(404)-marked entry returning 403 -> still markerStillBroken', r.category === 'markerStillBroken');
      check('but its detail notes the 403 could be a false positive', r.row.detail.toLowerCase().includes('bot-blocking'));
    }
  );

  // 5e. A 200-status Cloudflare "Verify you are human" interstitial served
  // in place of the real page must NOT be called "passed" (we never saw
  // the real site) and must NOT be called "parked" either (it's not a
  // registrar/placeholder page) - it goes to likelyBlocked, same as a
  // 403, and stays eligible for the real-browser recheck.
  await withMockFetch(
    async (url) =>
      mockResponse({
        status: 200,
        url,
        headers: { 'content-type': 'text/html' },
        text: '<html><body><h2>Performing security verification</h2><p>This website uses a security service to protect against malicious bots.</p></body></html>'
      }),
    async () => {
      const r = await checkChurch({ id: 26, name: 'Challenge-Walled Church', website: 'https://challenged.example.org' }, opts);
      check('200-status Cloudflare challenge page -> likelyBlocked, not passed or parked', r.category === 'likelyBlocked');
      check('challenge-page detail mentions the security check', r.row.detail.toLowerCase().includes('security check'));
      check('challenge-page outcome stays deep-check eligible', !!r.deepCheckUrl);
    }
  );

  // 6. 500.
  await withMockFetch(
    async (url) => mockResponse({ status: 503, url }),
    async () => {
      const r = await checkChurch({ id: 6, name: 'Broken Server Church', website: 'https://brokenserver.example.org' }, opts);
      check('HTTP 503 -> server5xx', r.category === 'server5xx');
    }
  );

  // 7. DNS failure -> unreachable.
  await withMockFetch(
    async () => {
      const err = new Error('getaddrinfo ENOTFOUND nosuchdomain.example');
      err.cause = { code: 'ENOTFOUND' };
      throw err;
    },
    async () => {
      const r = await checkChurch({ id: 7, name: 'Lapsed Domain Church', website: 'https://nosuchdomain.example' }, opts);
      check('DNS failure -> unreachable', r.category === 'unreachable');
      check('unreachable detail is human-readable', r.row.detail.includes('does not resolve'));
    }
  );

  // 8. Facebook link always goes to its own bucket, even on a clean 200.
  await withMockFetch(
    async (url) => mockResponse({ status: 200, url, text: '<html>some facebook app shell</html>' }),
    async () => {
      const r = await checkChurch({ id: 8, name: 'FB Church', website: 'https://www.facebook.com/somechurch' }, opts);
      check('facebook URL with clean 200 still -> facebook bucket (needs human look)', r.category === 'facebook');
    }
  );

  // 8b. Facebook link that hard-404s still goes to facebook bucket, but says so.
  await withMockFetch(
    async (url) => mockResponse({ status: 404, url }),
    async () => {
      const r = await checkChurch({ id: 9, name: 'FB Dead Church', website: 'https://www.facebook.com/gonechurch' }, opts);
      check('facebook URL with HTTP 404 -> still facebook bucket', r.category === 'facebook');
      check('facebook 404 detail mentions the status', r.row.detail.includes('404'));
    }
  );

  // 9. (404)-marked entry that now resolves fine.
  await withMockFetch(
    async (url) => mockResponse({ status: 200, url, text: 'Welcome back, we relaunched!' }),
    async () => {
      const r = await checkChurch({ id: 10, name: 'Revived Church', website: 'https://revived.example.org (404)' }, opts);
      check('(404)-marked entry that now resolves -> markerNowResolves', r.category === 'markerNowResolves');
      check('marker-now-resolves detail suggests removing the tag', r.row.detail.toLowerCase().includes('stale'));
    }
  );

  // 10. (404)-marked entry that is still broken.
  await withMockFetch(
    async (url) => mockResponse({ status: 404, url }),
    async () => {
      const r = await checkChurch({ id: 11, name: 'Still Dead Church', website: 'https://stilldead.example.org (404)' }, opts);
      check('(404)-marked entry still 404 -> markerStillBroken', r.category === 'markerStillBroken');
    }
  );

  // 11. No website at all.
  {
    const r = await checkChurch({ id: 12, name: 'No Site Church', website: '' }, opts);
    check('empty website -> noWebsite, no network call made', r.category === 'noWebsite');
    check('noWebsite row has no checkedUrl (nothing to link to)', !r.row.checkedUrl);
  }

  // 12. Unparseable "URL".
  {
    const r = await checkChurch({ id: 13, name: 'Garbage URL Church', website: '   ???not a url   ' }, opts);
    check('unparseable website string -> unreachable (not a crash)', r.category === 'unreachable' || r.category === 'markerStillBroken');
    check('unparseable-URL row has no checkedUrl either', !r.row.checkedUrl);
  }

  // 13. checkedUrl is populated (and clickable) for an ordinary checked link,
  // and reflects where we actually ended up for a redirect, not just where
  // we started - this is what makes the report's links usable per Larry's
  // 2026-11-24 ask.
  await withMockFetch(
    async (url) => mockResponse({ status: 200, url, text: 'ok' }),
    async () => {
      // (404)-marked so the row survives (a plain pass returns row: null,
      // nothing to assert checkedUrl on) while still exercising scheme
      // normalization on a bare domain with no http(s):// prefix.
      const r = await checkChurch({ id: 17, name: 'Linkable Church', website: 'linkable.example.org (404)' }, opts);
      check('checkedUrl gets a scheme even when the stored value had none', r.row.checkedUrl === 'https://linkable.example.org');
    }
  );
  await withMockFetch(
    async () => mockResponse({ status: 200, url: 'https://totallydifferent.example.net/', redirected: true, text: 'ok' }),
    async () => {
      const r = await checkChurch({ id: 18, name: 'Redirected Linkable Church', website: 'https://oldname2.example.org' }, opts);
      check('checkedUrl for a redirect points at the final destination', r.row.checkedUrl === 'https://totallydifferent.example.net/');
    }
  );

  // ---- deepCheckUrl eligibility (added 2026-11-24, real-browser recheck) ----
  // Only 403/429 and non-DNS network errors are worth a slower,
  // real-browser second opinion; everything else gets deepCheckUrl: null.

  await withMockFetch(
    async (url) => mockResponse({ status: 403, url }),
    async () => {
      const r = await checkChurch({ id: 19, name: 'Deep-Eligible 403 Church', website: 'https://deepme403.example.org' }, opts);
      check('403 outcome is deep-check eligible', r.deepCheckUrl === r.row.checkedUrl && !!r.deepCheckUrl);
    }
  );

  await withMockFetch(
    async (url) => mockResponse({ status: 429, url }),
    async () => {
      const r = await checkChurch({ id: 20, name: 'Deep-Eligible 429 Church', website: 'https://deepme429.example.org' }, opts);
      check('429 outcome is deep-check eligible', !!r.deepCheckUrl);
    }
  );

  await withMockFetch(
    async () => {
      const err = new Error('other side closed');
      err.cause = { code: 'ECONNRESET' };
      throw err;
    },
    async () => {
      const r = await checkChurch({ id: 21, name: 'Deep-Eligible Reset Church', website: 'https://deepmereset.example.org' }, opts);
      check('non-DNS connection error is deep-check eligible', r.category === 'unreachable' && !!r.deepCheckUrl);
    }
  );

  await withMockFetch(
    async () => {
      const err = new Error('getaddrinfo ENOTFOUND stillgone.example');
      err.cause = { code: 'ENOTFOUND' };
      throw err;
    },
    async () => {
      const r = await checkChurch({ id: 22, name: 'Deep-Ineligible DNS Church', website: 'https://stillgone.example' }, opts);
      check('DNS failure is NOT deep-check eligible (no browser can fix a domain that does not exist)', r.deepCheckUrl === null);
    }
  );

  await withMockFetch(
    async (url) => mockResponse({ status: 404, url }),
    async () => {
      const r = await checkChurch({ id: 23, name: 'Deep-Ineligible 404 Church', website: 'https://plain404.example.org' }, opts);
      check('a plain 404 is NOT deep-check eligible', r.deepCheckUrl === null);
    }
  );

  await withMockFetch(
    async (url) => mockResponse({ status: 200, url, text: '<html>some facebook app shell</html>' }),
    async () => {
      const r = await checkChurch({ id: 24, name: 'Deep-Ineligible FB Church', website: 'https://www.facebook.com/deepinelig' }, opts);
      check('a facebook outcome is NOT deep-check eligible', r.deepCheckUrl === null);
    }
  );

  await withMockFetch(
    async (url) => mockResponse({ status: 200, url, text: 'ok' }),
    async () => {
      const r = await checkChurch({ id: 25, name: 'Deep-Ineligible Pass Church', website: 'https://cleanpass.example.org' }, opts);
      check('a clean pass is NOT deep-check eligible', r.deepCheckUrl === null);
    }
  );

  // ---- needsManualCheck (added 2026-11-24, for the review-flagged.mjs
  // auto-open-in-browser workflow) - true only for outcomes where the
  // report explicitly tells Larry to go look for himself; false for
  // anything the checks are already confident about either way.

  await withMockFetch(
    async (url) => mockResponse({ status: 403, url }),
    async () => {
      const r = await checkChurch({ id: 27, name: 'Manual-Check 403 Church', website: 'https://manualcheck403.example.org' }, opts);
      check('a 403 (likelyBlocked) needs a manual check', r.needsManualCheck === true);
    }
  );

  await withMockFetch(
    async (url) => mockResponse({ status: 200, url, text: '<html><body>needs a human look</body></html>' }),
    async () => {
      const r = await checkChurch({ id: 28, name: 'Manual-Check FB Church', website: 'https://www.facebook.com/manualcheck' }, opts);
      check('a facebook outcome always needs a manual check', r.needsManualCheck === true);
    }
  );

  await withMockFetch(
    async () => {
      const err = new Error('getaddrinfo ENOTFOUND manualcheckdns.example');
      err.cause = { code: 'ENOTFOUND' };
      throw err;
    },
    async () => {
      const r = await checkChurch({ id: 29, name: 'Manual-Check DNS Church', website: 'https://manualcheckdns.example' }, opts);
      check('a confirmed DNS failure does NOT need a manual check', r.needsManualCheck === false);
    }
  );

  await withMockFetch(
    async () => {
      const err = new Error('other side closed');
      err.cause = { code: 'ECONNRESET' };
      throw err;
    },
    async () => {
      const r = await checkChurch({ id: 30, name: 'Manual-Check Reset Church', website: 'https://manualcheckreset.example.org' }, opts);
      check('a non-DNS connection error (ambiguous - could be bot-blocking) needs a manual check', r.needsManualCheck === true);
    }
  );

  await withMockFetch(
    async (url) => mockResponse({ status: 404, url }),
    async () => {
      const r = await checkChurch({ id: 31, name: 'Manual-Check 404 Church', website: 'https://manualcheck404.example.org' }, opts);
      check('a plain confirmed 404 does NOT need a manual check', r.needsManualCheck === false);
    }
  );

  await withMockFetch(
    async (url) => mockResponse({ status: 200, url, text: 'ok, ordinary church copy' }),
    async () => {
      const r = await checkChurch({ id: 32, name: 'Manual-Check Pass Church', website: 'https://manualcheckpass.example.org' }, opts);
      check('a clean pass does NOT need a manual check', r.needsManualCheck === false);
    }
  );

  {
    const outcome = { category: 'likelyBlocked', deepCheckUrl: 'https://x.example.org', row: { checkedUrl: 'https://x.example.org', detail: 'HTTP 403 (Forbidden)' }, needsManualCheck: true };
    const challenged = applyDeepCheckResult(outcome, { ok: false, challenged: true, challengeLabel: 'Cloudflare "Verify you are human" challenge' });
    check('applyDeepCheckResult: still-challenged keeps needsManualCheck true', challenged.needsManualCheck === true);

    const stillBlocked = applyDeepCheckResult(outcome, { ok: false, status: 403, error: 'HTTP 403 (Forbidden)' });
    check('applyDeepCheckResult: same-status-ambiguous keeps needsManualCheck true', stillBlocked.needsManualCheck === true);

    const confirmedBroken = applyDeepCheckResult(outcome, { ok: false, error: 'domain does not resolve' });
    check('applyDeepCheckResult: a genuinely different/unambiguous failure clears needsManualCheck', confirmedBroken.needsManualCheck === false);

    const confirmedFine = applyDeepCheckResult(outcome, { ok: true, status: 200, finalUrl: 'https://x.example.org' });
    check('applyDeepCheckResult: confirmed fine clears needsManualCheck', confirmedFine.needsManualCheck === false);

    const revealedParked = applyDeepCheckResult(outcome, { ok: true, status: 200, finalUrl: 'https://x.example.org', signature: 'GoDaddy placeholder' });
    check('applyDeepCheckResult: revealed-as-parked clears needsManualCheck', revealedParked.needsManualCheck === false);
  }

  // ---- applyDeepCheckResult (pure decision logic, no real browser) ----

  {
    const outcome = { category: 'likelyBlocked', deepCheckUrl: 'https://wasblocked.example.org', row: { checkedUrl: 'https://wasblocked.example.org', detail: 'HTTP 403 (Forbidden) — likely bot/rate-limit protection' } };
    const updated = applyDeepCheckResult(outcome, { ok: true, status: 200, finalUrl: 'https://wasblocked.example.org' });
    check('deep-check success on a likelyBlocked 403 -> confirmedByBrowser', updated.category === 'confirmedByBrowser');
    check('confirmedByBrowser detail explains the fast check was wrong', updated.row.detail.toLowerCase().includes('not actually broken'));
  }

  {
    const outcome = { category: 'unreachable', deepCheckUrl: 'https://wasreset.example.org', row: { checkedUrl: null, detail: 'Connection reset by the server' } };
    const updated = applyDeepCheckResult(outcome, { ok: true, status: 200, finalUrl: 'https://www.wasreset.example.org/' });
    check('deep-check success on an unreachable connection-reset -> confirmedByBrowser, notes the redirect', updated.category === 'confirmedByBrowser' && updated.row.detail.includes('redirected to'));
  }

  {
    const outcome = { category: 'markerStillBroken', deepCheckUrl: 'https://markedstillgone.example.org', row: { checkedUrl: null, detail: 'HTTP 403 (Forbidden) (may just be bot-blocking...)' } };
    const updated = applyDeepCheckResult(outcome, { ok: true, status: 200, finalUrl: 'https://markedstillgone.example.org' });
    check('deep-check success on a (404)-marked entry -> markerNowResolves, not confirmedByBrowser', updated.category === 'markerNowResolves');
  }

  {
    const outcome = { category: 'likelyBlocked', deepCheckUrl: 'https://actuallyparked.example.org', row: { checkedUrl: 'https://actuallyparked.example.org', detail: 'HTTP 403 (Forbidden)' } };
    const updated = applyDeepCheckResult(outcome, { ok: true, status: 200, finalUrl: 'https://actuallyparked.example.org', signature: 'GoDaddy placeholder' });
    check('deep-check success with a parked-page signature -> parked, not confirmedByBrowser', updated.category === 'parked');
  }

  {
    const outcome = { category: 'likelyBlocked', deepCheckUrl: 'https://stillbad.example.org', row: { checkedUrl: 'https://stillbad.example.org', detail: 'HTTP 403 (Forbidden)' } };
    const updated = applyDeepCheckResult(outcome, { ok: false, error: 'domain does not resolve' });
    check('deep-check failure stays in its original category', updated.category === 'likelyBlocked');
    check('deep-check failure appends a "confirmed via a real browser too" note', updated.row.detail.includes('confirmed via a real browser too'));
  }

  // A deep-check that comes back with the SAME 403/429 a plain fetch would
  // get is NOT solid evidence of a real problem - Playwright's headless
  // Chromium can itself be detected as automated and blocked by the exact
  // same WAF rule, independent of whether the site works fine for an
  // actual visitor. Larry confirmed this directly (2026-11-24):
  // cckeweenaw.com and several others stayed in this category even after
  // the real-browser recheck, but opened perfectly normally in his own
  // regular browser. The messaging must not overclaim "confirmed genuine"
  // in this specific case.
  {
    const outcome = { category: 'likelyBlocked', deepCheckUrl: 'https://cckeweenaw-like.example.org', row: { checkedUrl: 'https://cckeweenaw-like.example.org', detail: 'HTTP 403 (Forbidden) — likely bot/rate-limit protection' } };
    const updated = applyDeepCheckResult(outcome, { ok: false, status: 403, finalUrl: 'https://cckeweenaw-like.example.org', error: 'HTTP 403 (Forbidden)' });
    check('a 403 from the deep-check stays in likelyBlocked (not demoted to "confirmed broken")', updated.category === 'likelyBlocked');
    check('a 403 from the deep-check does NOT claim this is confirmed genuine', !updated.row.detail.includes('likely a genuine problem, not just bot-detection'));
    check('a 403 from the deep-check explains headless browsers can be detected too', updated.row.detail.toLowerCase().includes('automated') && updated.row.detail.toLowerCase().includes('your own regular browser'));
  }

  {
    const outcome = { category: 'likelyBlocked', deepCheckUrl: 'https://real429.example.org', row: { checkedUrl: 'https://real429.example.org', detail: 'HTTP 429 (Too Many Requests)' } };
    const updated = applyDeepCheckResult(outcome, { ok: false, status: 429, error: 'HTTP 429 (Too Many Requests)' });
    check('a 429 from the deep-check gets the same non-overclaiming treatment as 403', !updated.row.detail.includes('likely a genuine problem, not just bot-detection'));
  }

  {
    const outcome = { category: 'likelyBlocked', deepCheckUrl: 'https://untouched.example.org', row: { checkedUrl: 'https://untouched.example.org', detail: 'HTTP 403 (Forbidden)' } };
    const updated = applyDeepCheckResult(outcome, null);
    check('applyDeepCheckResult with no deepResult (e.g. Playwright unavailable) returns the outcome unchanged', updated === outcome);
  }

  // A real browser hitting the SAME interactive challenge (Larry's
  // calvarychapelbartlett.com screenshot, 2026-11-24) must stay right
  // where the fast check put it - never promoted to confirmedByBrowser
  // (we never saw the real page) and never demoted to "confirmed broken"
  // either (quite the opposite - it's extra evidence of bot-protection).
  {
    const outcome = { category: 'likelyBlocked', deepCheckUrl: 'https://challenged.example.org', row: { checkedUrl: 'https://challenged.example.org', detail: 'HTTP 403 (Forbidden) — likely bot/rate-limit protection' } };
    const updated = applyDeepCheckResult(outcome, { ok: false, challenged: true, challengeLabel: 'Cloudflare "Verify you are human" challenge', status: 403, finalUrl: 'https://challenged.example.org' });
    check('deep-check hitting the same bot challenge keeps the original category (not confirmedByBrowser)', updated.category === 'likelyBlocked');
    check('challenged-outcome detail names the challenge and says to check by hand', updated.row.detail.includes('Verify you are human') && updated.row.detail.toLowerCase().includes('open it yourself'));
    check('challenged-outcome detail does NOT claim this is confirmed fine', !updated.row.detail.toLowerCase().includes('confirmed fine') && !updated.row.detail.toLowerCase().includes('not actually broken'));
  }

  console.log('\nAll ' + passCount + ' checks passed.');
}

run().catch((err) => {
  console.error('TEST FAILURE:', err);
  process.exitCode = 1;
});
