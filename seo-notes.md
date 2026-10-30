# seo-notes.md

Basic search-engine and link-sharing setup (added 2026-10-30). Everything is
static - no Worker code involved.

## What is in place

- `public/index.html` head: `<html lang="en">`; a descriptive `<title>`
  ("Find Calvary Chapel Churches, Live Streams & Radio"); a meta description
  (139 characters); a canonical link; Open Graph and Twitter tags (so a link
  texted or posted shows a card with a title, description and picture).
- `public/og-image.png` (1200 x 630): the share-preview picture - green
  background, the yellow radio tower, "Find Calvary Chapel Churches", "Church
  map - Live streams - Radio", "An independent project".
- `public/robots.txt`: allows everything except `/api/`, `/conferences` and
  `/radio-now-playing` (data feeds, no value to a crawler) and points at the
  sitemap.
- `public/sitemap.xml`: one URL, the home page. No `lastmod` on purpose (a stale
  date is worse than none).

## Decisions

- The new text deliberately avoids "CCA" (see the naming discussion with the
  calvarycca.org admin, Oct 2026). "Calvary Chapel" is used as the descriptive,
  overarching name. No `og:site_name` was set, so the tags do not establish a
  product name.
- The page's own address still contains "cca" (`cca-finder.calvary.workers.dev`),
  and the canonical/og addresses must match the real address, so they contain it
  too. That goes away only with a custom domain.

## When the name or address changes

Update: the canonical and `og:url` links, the `og:image` and `twitter:image`
addresses (all in the `<head>` of `public/index.html`), the Sitemap line in
`public/robots.txt`, and the address in `public/sitemap.xml`. Redo the preview
picture if its wording changes.

## Not done yet / ideas

- Google Search Console: free; needs Larry to sign in and verify the site (a
  small meta tag goes in the head), then submit `sitemap.xml`. Shows which
  searches actually reach the site.
- A short visible "about" paragraph in the page itself (the page is mostly built
  by JavaScript, so crawlers see little text).
- The big lever: a separate page per church (name, address, map) - what ranks
  for searches like "Calvary Chapel in Bend, Oregon". A real project, not a
  quick change.
- A custom domain (also helps if the site is renamed).
- Structured data (schema.org JSON-LD) - minor payoff for now.
