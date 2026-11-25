#!/usr/bin/env node
// Review-flagged: opens, one at a time, every link from the most recent
// check-links.mjs run that the report said was worth a human glance (see
// the `needsManualCheck` field in check-links.mjs - 403/429, a Cloudflare-
// style challenge page, Facebook links, and similar genuinely-ambiguous
// results). You look at the page, close its window, and the next one opens
// automatically - no copy/pasting URLs out of the HTML report by hand.
//
// This is NOT trying to get past any site's bot-detection or challenge
// page (see check-links.mjs's detectBotChallenge comment for why this
// project never does that) - every window here is a real, visible,
// interactive browser window that YOU look at and close yourself. It's
// just automating the tedious part (opening each one, one after another)
// of the manual check the report already asks you to do.
//
// Usage:
//   node review-flagged.mjs                 - reviews the most recent run
//   node review-flagged.mjs --file=<path>    - reviews a specific .review.json
//   node review-flagged.mjs --category=parked  - only that category (repeatable: --category=parked,facebook)
//
// Requires Playwright (same one-time `npm install` + `npx playwright
// install chromium` setup as check-links.mjs's --deep-check).

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (m) args[m[1]] = m[2] === undefined ? true : m[2];
  }
  return args;
}

// Finds the most recently generated *.review.json in reports/ (same
// convention as check-links.mjs's dated report filenames), so Larry can
// just run this with no arguments right after a check-links.mjs run.
async function findLatestReviewFile(reportsDir) {
  let entries;
  try {
    entries = await readdir(reportsDir);
  } catch {
    return null;
  }
  const candidates = entries.filter((f) => f.endsWith('.review.json')).sort();
  return candidates.length ? path.join(reportsDir, candidates[candidates.length - 1]) : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const reportsDir = path.join(__dirname, 'reports');
  const filePath = args.file ? path.resolve(args.file) : await findLatestReviewFile(reportsDir);

  if (!filePath) {
    console.log('No .review.json found in ' + reportsDir + '.');
    console.log('Run check-links.mjs first (or pass --file=<path to a .review.json>).');
    process.exitCode = 1;
    return;
  }

  let data;
  try {
    data = JSON.parse(await readFile(filePath, 'utf8'));
  } catch (err) {
    console.log('Could not read/parse ' + filePath + ': ' + (err && err.message ? err.message : err));
    process.exitCode = 1;
    return;
  }

  let entries = data.entries || [];
  if (args.category) {
    const wanted = new Set(String(args.category).split(',').map((s) => s.trim()));
    entries = entries.filter((e) => wanted.has(e.category));
  }

  if (!entries.length) {
    console.log('Nothing to review in ' + filePath + (args.category ? ' for category "' + args.category + '"' : '') + ' - nice.');
    return;
  }

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.log('Playwright is not installed, so there is no browser to open these with.');
    console.log('Run "npm install" then "npx playwright install chromium" once in this folder, then try again.');
    process.exitCode = 1;
    return;
  }

  console.log('Reviewing ' + entries.length + ' link(s) from ' + path.basename(filePath) + ' (generated ' + (data.generatedAt || 'unknown time') + ').');
  console.log('Each one opens in its own browser window - look it over, then just close that window');
  console.log('(the X, Alt+F4, however you normally close a window) and the next one opens automatically.');
  console.log('Press Ctrl+C here at any time to stop early.\n');

  let stopped = false;
  let reviewedCount = 0;
  process.on('SIGINT', () => {
    stopped = true;
    console.log('\nStopping - no more windows will open.');
  });

  for (let i = 0; i < entries.length && !stopped; i++) {
    const entry = entries[i];
    console.log('[' + (i + 1) + '/' + entries.length + '] ' + entry.name + (entry.city ? ' (' + entry.city + ')' : '') + ' - ' + entry.url);
    if (entry.detail) console.log('    ' + entry.detail);

    // A fresh, visible (headless: false) browser instance per entry, not a
    // new tab in a shared one - that's what lets us tell "this specific
    // window closed" apart from "some other window closed".
    let browser;
    try {
      browser = await chromium.launch({ headless: false, args: ['--start-maximized'] });
      const page = await browser.newPage({ viewport: null });
      try {
        await page.goto(entry.url, { timeout: 20000 });
      } catch (err) {
        // You don't have to wait for the page to finish loading before
        // closing it - closing early (seen in practice, 2026-11-24: Larry
        // closed one before it had fully rendered, already satisfied it
        // was the real church site) makes page.goto() itself reject,
        // since the thing it was loading into no longer exists. That's
        // not a real error - say so plainly instead of the generic
        // "window is still open" message, which would be wrong here.
        if (page.isClosed()) {
          console.log('    (you closed the window before it finished loading - that\'s fine, moving right along)');
        } else {
          console.log('    (page did not finish loading: ' + (err && err.message ? err.message.split('\n')[0] : err) + ' - the window is still open for you to look at whatever did load)');
        }
      }
      // If you closed the window WHILE it was still loading (the case
      // above), the page (and often the whole browser, since it's the
      // only window) is already closed by this point - its 'close'/
      // 'disconnected' events already fired, before the listeners below
      // could possibly have been attached to hear them. Waiting on those
      // events here would then hang forever on an already-closed window
      // (the bug behind this fix, 2026-11-24) - so check for that first
      // and skip straight past the wait when it's already happened.
      if (!page.isClosed() && browser.isConnected()) {
        await new Promise((resolve) => {
          // page 'close' fires the instant the user closes THIS window -
          // the signal we actually want. browser 'disconnected' (the whole
          // Chromium process exiting) is kept only as a backup: on
          // Windows, closing the last window doesn't always make the
          // process exit right away (a background/GPU/network-service
          // process can keep it alive a while, or indefinitely), so
          // waiting on 'disconnected' alone - what this used to do - could
          // hang here even after you'd already closed the window (seen in
          // practice, 2026-11-24: Larry closed window 1 of 83 and nothing
          // else happened). The periodic check also re-tests isClosed/
          // isConnected, not just `stopped`, as a safety net for the same
          // already-closed race described above. Whichever fires first
          // must clear the polling interval before resolving, or it's left
          // running forever and the process never exits on its own once
          // the review is done.
          let settled = false;
          const check = setInterval(() => {
            if (stopped || page.isClosed() || !browser.isConnected()) settle();
          }, 300);
          function settle() {
            if (settled) return;
            settled = true;
            clearInterval(check);
            resolve();
          }
          page.once('close', settle);
          browser.once('disconnected', settle);
        });
      }
    } catch (err) {
      console.log('    (could not open a browser window for this one: ' + (err && err.message ? err.message : err) + ' - skipping to the next)');
    } finally {
      // Force the whole browser instance closed here regardless of why we
      // got this far - this is what actually cleans up a lingering
      // background process after the page itself closes, rather than
      // hoping the OS already did it.
      if (browser) await browser.close().catch(() => {});
    }
    if (!stopped) reviewedCount++;
  }

  console.log('\nDone' + (stopped ? ' (stopped early)' : '') + ' - reviewed ' + reviewedCount + ' of ' + entries.length + ' link(s).');
}

main().catch((err) => {
  console.error('\nFailed: ' + (err && err.message ? err.message : err));
  process.exitCode = 1;
});
