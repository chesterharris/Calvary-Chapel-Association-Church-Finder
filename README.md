# CCA USA Map + Conference Ticker

- `public/index.html` — the map page (Leaflet.js), including the scrolling conference ticker.
- `src/index.js` — Cloudflare Worker script. Serves everything in `public/` as static
  files, and handles `/conferences` itself by scraping calvarycca.org/conferences/
  server-side and returning JSON.
- `wrangler.jsonc` — Cloudflare configuration tying the two pieces together.

Deployed via Cloudflare's GitHub integration (Workers & Pages → Import a repository).
Every push to `main` redeploys automatically.
