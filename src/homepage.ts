// Public homepage for the hosted server. The page is the pitch; GitHub is the source.

import { PUBLIC_ORIGIN, REPOSITORY_URL, WIKI_LICENSE_URL, WIKI_LICENSING_URL, PRIVACY_POLICY_URL, JAGEX_CONTENT_NOTICE } from './constants.js';
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
  <p>Connect Claude or Cursor to RuneScape 3 Grand Exchange guide prices, 30-day history, flip math after the 2% tax, public RS3 hiscores, and wiki pages. RS3 only. Unofficial, and not affiliated with Jagex or the RuneScape Wiki.</p>
  <p>An independent <a href="https://birdwellabs.com">Birdwell Labs</a> project. No Jagex or Weird Gloop approval is claimed. <a href="mailto:support@birdwellabs.com">Support and rights concerns</a>.</p>
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
  <h2>Access and data handling</h2>
  <p>This is a read-only API helper. It does not connect to the game client, control characters or place trades, and never asks for your Jagex password, session cookies or bank PIN. Player-name lookups send the supplied name to Jagex's public hiscores endpoint.</p>
  <p>Your assistant receives tool results and may generate an answer from them. Its privacy, retention and model-training settings apply separately. Optional service diagnostics may receive request context. Read the <a href="${PRIVACY_POLICY_URL}">privacy policy</a> and check source links before acting on generated advice.</p>
  <h2>Sources and attribution</h2>
  <p>Grand Exchange guide prices and public hiscores come from <a href="https://www.runescape.com/">Jagex</a>. Daily price history and item lookup use the <a href="https://api.weirdgloop.org/">Weirdgloop API</a>.</p>
  <p>Wiki text is by <a href="https://runescape.wiki/">RuneScape Wiki contributors</a>, generally under <a href="${WIKI_LICENSE_URL}">CC BY-NC-SA 3.0</a>, subject to <a href="${WIKI_LICENSING_URL}">source-specific exceptions</a>. Unreviewed pages return links only. Text is returned only for a reviewed revision and matching content hash, with its license, source links and preserved copyright notices. Noncommercial and share-alike conditions apply where required by the source license.</p>
  <p>${JAGEX_CONTENT_NOTICE} See the <a href="https://legal.jagex.com/docs/policies/fan-content-policy">Fan Content Policy</a>. These credits do not establish additional permissions or a partnership.</p>
  <p>The MCP software is <a href="${REPOSITORY_URL}/blob/main/LICENSE">MIT licensed</a>; third-party content retains its own licenses and rights.</p>
  <p>Public API access and directory listings do not establish provider approval. See the <a href="${REPOSITORY_URL}/blob/main/docs/permissions.md">source review and outstanding permissions</a>.</p>
  <p class="links">
    <a href="${PRIVACY_POLICY_URL}">Privacy policy</a>
    <a href="${REPOSITORY_URL}">GitHub</a>
    <a href="${NPM_URL}">npm</a>
    <a href="${SMITHERY_URL}">Smithery</a>
    <a href="${serverCardUrl(PUBLIC_ORIGIN)}">Server card</a>
  </p>
</body>
</html>`;
}
