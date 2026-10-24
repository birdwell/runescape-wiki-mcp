// Public homepage for the hosted server. The page is the pitch; GitHub is the source.

import { PUBLIC_ORIGIN, REPOSITORY_URL } from './constants.js';
import { CANONICAL_MCP_URL, serverCardUrl } from './discovery.js';

const SMITHERY_URL = 'https://smithery.ai/servers/birdwell/runescape-wiki-mcp';
const NPM_URL = 'https://www.npmjs.com/package/runescape-wiki-mcp';

// Cursor expects one server's config; VS Code expects a named server definition.
export const INSTALL_LINKS = {
    cursor: `https://cursor.com/en/install-mcp?name=runescape-wiki&config=${encodeURIComponent(
        Buffer.from(JSON.stringify({ url: CANONICAL_MCP_URL })).toString('base64')
    )}`,
    vscode: `vscode:mcp/install?${encodeURIComponent(JSON.stringify({
        name: 'runescape-wiki', type: 'http', url: CANONICAL_MCP_URL,
    }))}`,
};

// GitHub sanitizes custom URL schemes. Use Microsoft's own redirect for README buttons.
export const VSCODE_WEB_INSTALL_URL = `https://insiders.vscode.dev/redirect?url=${encodeURIComponent(INSTALL_LINKS.vscode)}`;

const CLAUDE_COMMAND = `claude mcp add --transport http --scope user runescape-wiki ${CANONICAL_MCP_URL}`;
const VSCODE_CONFIG = JSON.stringify({ servers: { 'runescape-wiki': { type: 'http', url: CANONICAL_MCP_URL } } }, null, 2);
const STDIO_CONFIG = JSON.stringify({ mcpServers: { 'runescape-wiki': { command: 'npx', args: ['-y', 'runescape-wiki-mcp'] } } }, null, 2);

function escapeHtml(value: string): string {
    return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

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
    :root {
      color-scheme: light dark;
      --ink: CanvasText;
      --surface: Canvas;
      --action: LinkText;
      --panel: color-mix(in srgb, Canvas 94%, CanvasText);
      --space: 0.5rem;
      --control-height: 2.75rem;
      --radius: 0.375rem;
    }
    body {
      font-family: ui-sans-serif, system-ui, sans-serif;
      line-height: 1.5;
      max-width: 40rem;
      margin: 2.5rem auto;
      padding: 0 1.25rem;
    }
    h1 { font-size: 1.75rem; line-height: 1.25; }
    h2 { margin-top: calc(var(--space) * 4); }
    a { color: var(--action); }
    .install-actions { display: flex; flex-wrap: wrap; gap: var(--space); }
    .install-button, button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: var(--control-height);
      padding: 0 calc(var(--space) * 2);
      border: 0;
      border-radius: var(--radius);
      background: var(--panel);
      color: var(--ink);
      font: inherit;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
    }
    .install-button:hover, button:hover { text-decoration: underline; }
    .install-button:active, button:active { transform: translateY(1px); }
    :is(a, button, summary):focus-visible { outline: 2px solid var(--ink); outline-offset: 3px; }
    details { margin: calc(var(--space) * 2) 0; }
    summary { cursor: pointer; padding: var(--space) 0; font-weight: 600; }
    .endpoint { display: flex; flex-wrap: wrap; gap: var(--space); align-items: center; }
    .endpoint code { overflow-wrap: anywhere; min-width: 0; }
    .hint { font-size: 0.9375rem; }
    #copy-status { min-height: 1.5em; margin: var(--space) 0; }
    .copy-button { display: none; }
    .js-copy .copy-button { display: inline-flex; }
    pre {
      overflow: auto;
      padding: 0.75rem 1rem;
      border: 1px solid color-mix(in srgb, CanvasText 18%, transparent);
      background: var(--panel);
    }
    .links { margin-top: 2.5rem; }
    .links a { margin-right: 1rem; }
  </style>
</head>
<body>
  <h1>Ask what it's worth, whether the flip clears tax, and what to train next.</h1>
  <p>Connect Claude or ChatGPT to RuneScape 3 Grand Exchange guide prices, 30-day history, flip math after the 2% tax, normal-mode hiscores, and wiki pages. RS3 only. Unofficial, and not affiliated with Jagex or the RuneScape Wiki.</p>
  <p>Prices are Jagex guide prices and Weirdgloop history. They lag the in-game market. Live high and low prices are a separate feed at <a href="https://prices.runescape.wiki/rs">prices.runescape.wiki</a>.</p>
  <h2 id="connect">Connect your assistant</h2>
  <p>Use the hosted server without installing a package or setting up an API key.</p>
  <div class="install-actions" aria-label="Install in your app">
    <a class="install-button" href="#claude-setup" data-open="claude-setup">Set up in Claude</a>
    <a class="install-button" href="#chatgpt-setup" data-open="chatgpt-setup">Set up in ChatGPT</a>
  </div>
  <p class="hint">Choose your chat app for setup instructions. Copy this server URL when it asks for one:</p>
  <div class="endpoint">
    <code id="server-url">${CANONICAL_MCP_URL}</code>
    <button class="copy-button" type="button" data-copy="server-url" data-label="server URL">Copy server URL</button>
  </div>
  <p id="copy-status" role="status" aria-live="polite"></p>
  <details id="claude-setup">
    <summary>Claude and Claude Desktop</summary>
    <ol>
      <li>Open <a href="https://claude.ai/customize/connectors" target="_blank" rel="noopener noreferrer">Claude's connectors</a>, then choose <strong>+ Add → Add custom connector</strong>.</li>
      <li>Name it <strong>RuneScape 3</strong> and paste the server URL above.</li>
      <li>Continue, choose <strong>No sign in</strong> for this public server, and finish adding it. Enable it from your chat's connectors menu.</li>
    </ol>
    <p class="hint">Organization settings may require an owner to add custom connectors. <a href="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp">Claude setup guide</a></p>
  </details>
  <details id="chatgpt-setup">
    <summary>ChatGPT on the web</summary>
    <ol>
      <li>Open <a href="https://chatgpt.com/plugins" target="_blank" rel="noopener noreferrer">ChatGPT Plugins</a>, select <strong>+</strong>, then <strong>Add custom MCP server</strong>.</li>
      <li>Name it <strong>RuneScape 3</strong>, paste the server URL above, and choose <strong>No authentication</strong>.</li>
      <li>Review the connection warning, then select <strong>Create as a plugin</strong>. Open the new plugin in your personal plugins and install it with <strong>+</strong>.</li>
      <li>Start a <strong>Work</strong> chat. Type <strong>@</strong> in the message box, select <strong>RuneScape 3</strong>, and ask your question.</li>
    </ol>
    <p class="hint">Custom MCP setup depends on your account and workspace permissions. If the option is missing, check your workspace settings or ask its owner. <a href="https://developers.openai.com/api/docs/guides/custom-mcp-server">Official ChatGPT setup guide</a></p>
  </details>
  <h2>Try your first question</h2>
  <p>Ask: <strong>“Use RuneScape 3 to look up the guide price of an Abyssal whip.”</strong></p>
  <p class="hint">Your assistant should use <code>lookup_item</code> or <code>get_item_price</code>. A guide-price answer confirms the connection works.</p>
  <h2>Questions to ask</h2>
  <ul>
    <li>What's the guide price of a Noxious scythe, and how did it move over 30 days?</li>
    <li>Compare a Noxious scythe, a Dragon rider lance, and an Abyssal whip.</li>
    <li>Estimate the profit from flipping 100 Dragon rider lances after tax.</li>
  </ul>
  <details id="other-apps">
    <summary>Other apps and local setup</summary>
    <p>Already using an editor or a local MCP client?</p>
    <div class="install-actions" aria-label="Editor install options">
      <a class="install-button" href="${escapeHtml(INSTALL_LINKS.cursor)}">Add to Cursor</a>
      <a class="install-button" href="${escapeHtml(INSTALL_LINKS.vscode)}">Add to VS Code</a>
    </div>
    <p class="hint">These buttons open the editor's install flow. Review the server in your app to finish adding it. Manual setup is below if the app does not open.</p>
  <details>
    <summary>Claude Code</summary>
    <p>Run this command to add it for your user account:</p>
    <pre><code id="claude-command">${escapeHtml(CLAUDE_COMMAND)}</code></pre>
    <button class="copy-button" type="button" data-copy="claude-command" data-label="Claude Code command">Copy command</button>
  </details>
  <details>
    <summary>Manual Cursor or VS Code setup</summary>
    <p>For Cursor, merge this into <code>~/.cursor/mcp.json</code>:</p>
    <pre><code id="cursor-config">${escapeHtml(CONNECT_CONFIG)}</code></pre>
    <button class="copy-button" type="button" data-copy="cursor-config" data-label="Cursor configuration">Copy Cursor config</button>
    <p>For VS Code, merge this into <code>.vscode/mcp.json</code>:</p>
    <pre><code id="vscode-config">${escapeHtml(VSCODE_CONFIG)}</code></pre>
    <button class="copy-button" type="button" data-copy="vscode-config" data-label="VS Code configuration">Copy VS Code config</button>
  </details>
  <details>
    <summary>Local npm install for stdio clients</summary>
    <p>Requires Node.js 20 or newer. Merge this into your client's MCP configuration:</p>
    <pre><code id="stdio-config">${escapeHtml(STDIO_CONFIG)}</code></pre>
    <button class="copy-button" type="button" data-copy="stdio-config" data-label="local npm configuration">Copy npm config</button>
  </details>
  </details>
  <p class="links">
    <a href="${REPOSITORY_URL}">GitHub</a>
    <a href="${NPM_URL}">npm</a>
    <a href="${SMITHERY_URL}">Smithery</a>
    <a href="${serverCardUrl(PUBLIC_ORIGIN)}">Server card</a>
  </p>
  <script>
    document.documentElement.classList.add('js-copy');
    const status = document.getElementById('copy-status');
    document.querySelectorAll('[data-copy]').forEach(button => {
      button.addEventListener('click', async () => {
        const target = document.getElementById(button.dataset.copy);
        try {
          await navigator.clipboard.writeText(target.textContent);
          status.textContent = 'Copied ' + button.dataset.label + '.';
        } catch {
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(target);
          selection.removeAllRanges();
          selection.addRange(range);
          status.textContent = 'Clipboard unavailable. The text is selected; copy it with your keyboard or touch menu.';
        }
      });
    });
    document.querySelectorAll('[data-open]').forEach(link => {
      link.addEventListener('click', event => {
        event.preventDefault();
        const details = document.getElementById(link.dataset.open);
        details.open = true;
        history.replaceState(null, '', link.getAttribute('href'));
        details.querySelector('summary').focus();
        details.scrollIntoView({ block: 'start' });
      });
    });
    const initialSetup = document.getElementById(location.hash.slice(1));
    if (initialSetup?.tagName === 'DETAILS') initialSetup.open = true;
  </script>
</body>
</html>`;
}
