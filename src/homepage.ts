// Public homepage for the hosted server. The page is the pitch; GitHub is the source.

import { PUBLIC_ORIGIN, REPOSITORY_URL } from './constants.js';
import { CANONICAL_MCP_URL, serverCardUrl } from './discovery.js';

const SMITHERY_URL = 'https://smithery.ai/servers/birdwell/runescape-wiki-mcp';
const NPM_URL = 'https://www.npmjs.com/package/runescape-wiki-mcp';

const CONNECT_CONFIG = `{
  "mcpServers": {
    "runescape-wiki": {
      "url": "${CANONICAL_MCP_URL}"
    }
  }
}`;

export function homepageHtml(): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>RuneScape 3 MCP Server</title>
  <meta name="description" content="Ask what an RS3 item is worth, whether a flip clears the 2% tax, and what to train next. Guide prices, history, hiscores, and wiki pages." />
  <style>
    :root { color-scheme: light dark; }
    body {
      font-family: ui-sans-serif, system-ui, sans-serif;
      line-height: 1.5;
      max-width: 40rem;
      margin: 2.5rem auto;
      padding: 0 1.25rem;
    }
    h1 { font-size: 1.75rem; line-height: 1.25; }
    pre {
      overflow: auto;
      padding: 0.75rem 1rem;
      border: 1px solid color-mix(in srgb, CanvasText 18%, transparent);
      background: color-mix(in srgb, Canvas 94%, CanvasText);
    }
    .links { margin-top: 2.5rem; }
    .links a { margin-right: 1rem; }
  </style>
</head>
<body>
  <h1>Ask what it's worth, whether the flip clears tax, and what to train next.</h1>
  <p>Connect Claude or Cursor to RuneScape 3 Grand Exchange guide prices, 30-day history, flip math after the 2% tax, normal-mode hiscores, and wiki pages. RS3 only. Unofficial, and not affiliated with Jagex or the RuneScape Wiki.</p>
  <p>Prices are Jagex guide prices and Weirdgloop history. They lag the in-game market. Live high and low prices are a separate feed at <a href="https://prices.runescape.wiki/rs">prices.runescape.wiki</a>.</p>
  <h2>Questions to ask</h2>
  <ul>
    <li>What's the guide price of a Noxious scythe, and how did it move over 30 days?</li>
    <li>Compare a Noxious scythe, a Dragon rider lance, and an Abyssal whip.</li>
    <li>Estimate the profit from flipping 100 Dragon rider lances after tax.</li>
  </ul>
  <h2>Connect</h2>
  <p>Paste this into Claude Desktop or Cursor. The hosted URL needs no install.</p>
  <pre><code>${CONNECT_CONFIG}</code></pre>
  <p class="links">
    <a href="${REPOSITORY_URL}">GitHub</a>
    <a href="${NPM_URL}">npm</a>
    <a href="${SMITHERY_URL}">Smithery</a>
    <a href="${serverCardUrl(PUBLIC_ORIGIN)}">Server card</a>
  </p>
</body>
</html>`;
}
