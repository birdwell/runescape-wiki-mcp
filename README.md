# RuneScape 3 MCP Server

[![npm](https://img.shields.io/npm/v/runescape-wiki-mcp)](https://www.npmjs.com/package/runescape-wiki-mcp)
[![CI](https://github.com/birdwell/runescape-wiki-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/birdwell/runescape-wiki-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/birdwell/runescape-wiki-mcp)](https://github.com/birdwell/runescape-wiki-mcp/blob/main/LICENSE)

[![RuneScape Wiki MCP Server MCP server – quality and maintenance score on Glama](https://glama.ai/mcp/servers/birdwell/runescape-wiki-mcp/badges/card.svg)](https://glama.ai/mcp/servers/birdwell/runescape-wiki-mcp)

[![RuneScape Wiki MCP server](https://mcprush.com/badge/runescape-wiki-mcp/card.svg)](https://mcprush.com/to/runescape-wiki-mcp?ref=badge)

**Ask what it's worth, whether the flip clears tax, and what to train next.**

Connect Claude, Cursor, and other assistants to RuneScape 3 Grand Exchange guide prices, 7–90 day history, flip math after the 2% tax, normal-mode hiscores, and wiki pages. RS3 only. Unofficial, and not affiliated with Jagex or the RuneScape Wiki.

Prices are Jagex guide prices and Weirdgloop history. They lag the in-game market. Live high and low prices are a separate feed at [prices.runescape.wiki](https://prices.runescape.wiki/rs).

## Questions to ask

- What's the guide price of a Noxious scythe, and how did it move over 30 days?
- Compare a Noxious scythe, a Dragon rider lance, and an Abyssal whip.
- Estimate the profit from flipping 100 Dragon rider lances after tax.
- Look up my stats and tell me the weakest skill to train. Normal mode.
- What does the special attack on an Abyssal whip actually do?

The server answers questions about items you name. It does not rank the whole Grand Exchange.

Price questions use `lookup_item`, `get_item_price`, `compare_items`, `summarize_price_history`, and `estimate_flip`. Stats questions use `get_player_stats` on the normal hiscores; the assistant turns those levels into a training suggestion. Wiki questions use `search_wiki`, then `get_wiki_page_content`.

## Connect

Use the hosted server without installing a package or setting up an API key.

[![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=runescape-wiki&config=eyJ1cmwiOiJodHRwczovL3J1bmVzY2FwZS13aWtpLW1jcC5mbHkuZGV2L21jcCJ9)
[![Add to VS Code](https://img.shields.io/badge/VS_Code-Add_server-007ACC?style=flat-square)](https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522runescape-wiki%2522%252C%2522type%2522%253A%2522http%2522%252C%2522url%2522%253A%2522https%253A%252F%252Frunescape-wiki-mcp.fly.dev%252Fmcp%2522%257D)

Review the server in your app to finish adding it. If a button does not open your app, use the matching manual setup below.

Hosted endpoint: `https://runescape-wiki-mcp.fly.dev/mcp`

### Claude and Claude Desktop

Open [Customize > Connectors](https://claude.ai/customize/connectors), choose **+ Add > Add custom connector**, and name it **RuneScape 3**. Paste the hosted endpoint, continue through setup, and choose **No sign in** for this public server. Enable it from your chat's connectors menu. Organization settings may require an owner to add the connector. [Claude setup guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

### Claude Code

```sh
claude mcp add --transport http --scope user runescape-wiki https://runescape-wiki-mcp.fly.dev/mcp
```

### Manual Cursor setup

Merge this into `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "runescape-wiki": {
      "url": "https://runescape-wiki-mcp.fly.dev/mcp"
    }
  }
}
```

### Manual VS Code setup

Merge this into `.vscode/mcp.json`:

```json
{
  "servers": {
    "runescape-wiki": {
      "type": "http",
      "url": "https://runescape-wiki-mcp.fly.dev/mcp"
    }
  }
}
```

### Confirm the connection

Ask: **"Use RuneScape 3 to look up the guide price of an Abyssal whip."** Your assistant should use `lookup_item` or `get_item_price` and return a guide-price answer.

### Local stdio

stdio via npm:

```json
{
  "mcpServers": {
    "runescape-wiki": {
      "command": "npx",
      "args": ["-y", "runescape-wiki-mcp"]
    }
  }
}
```

Local stdio, after `bun install` and `bun run build`:

```json
{
  "mcpServers": {
    "runescape-wiki": {
      "command": "node",
      "args": ["/path/to/runescape-wiki-mcp/dist/index.js"]
    }
  }
}
```

Also listed on:

- Server card: `https://runescape-wiki-mcp.fly.dev/mcp/server-card`
- AI Catalog: `https://runescape-wiki-mcp.fly.dev/.well-known/ai-catalog.json`
- Official MCP Registry: [`io.github.birdwell/runescape-wiki-mcp`](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.birdwell/runescape-wiki-mcp)
- npm: [`runescape-wiki-mcp`](https://www.npmjs.com/package/runescape-wiki-mcp)

Speaks MCP **2026-07-28** (stateless) via stdio and Streamable HTTP, with legacy 2025-era clients still supported.

## Tools

- `lookup_item` — Resolve an item name to a Grand Exchange ID and the latest guide or Weirdgloop price. Start here when you only know the name.
- `get_item_price` — Jagex guide price, trend, and examine text for one item, by `itemId` or `name`. Guide prices lag the live market.
- `get_item_graph` — About 180 days of daily prices, by `itemId` or `name`.
- `summarize_price_history` — Min, max, average, change, and volume over 7–90 days (default 30). History lags the live market.
- `compare_items` — Compare up to 10 items by `names` or `itemIds`.
- `estimate_flip` — Estimated flip profit after the RS3 2% Grand Exchange sales tax. Default prices lag the live market.
- `browse_items` — Browse one Grand Exchange category by starting letter. This is not a name search.
- `get_all_categories` — Category IDs 0–43 and their names.
- `get_category_info` — How many items sit under each letter in one category.
- `get_ge_info` — Grand Exchange database metadata (`lastConfigUpdateRuneday`), not prices.
- `get_player_stats` — RS3 hiscores for a username. `gameMode: normal` works. Ironman and hardcore currently return HTTP 404 from Jagex.
- `search_wiki` — Search RuneScape Wiki titles and snippets when the page title is unknown.
- `get_wiki_page_content` — Plain-text wiki extract. Follows redirects.

### Prompts

- `check_item_price` — `itemName`
- `compare_ge_items` — `items` (comma-separated names)
- `estimate_item_flip` — `itemName`, optional `quantity`
- `player_overview` — `username`

### Typical agent flow

```
lookup_item { query: "abyssal whip" }
  → id 4151, price …
get_item_price { itemId: 4151 }   # or { name: "Abyssal whip" }
summarize_price_history { name: "Abyssal whip", days: 30 }
search_wiki { query: "abyssal whip special attack" }
```

## Resources

| URI | Contents |
|-----|----------|
| `runescape://ge/info` | GE database info (not prices) |
| `runescape://ge/categories` | Canonical category list |

## Data sources

Guide prices come from Jagex. Daily history comes from Weirdgloop. Both lag the live high/low feed published at `https://prices.runescape.wiki/api/v2/rs`. This server does not call that feed.

- Jagex GE: `https://secure.runescape.com/m=itemdb_rs/api`
- Jagex hiscores lite: `https://secure.runescape.com/m=hiscore/index_lite.ws`
- Weirdgloop RS exchange: `https://api.weirdgloop.org/exchange/history/rs`
- RuneScape Wiki MediaWiki API: `https://runescape.wiki/api.php`

All requests send User-Agent:  
`RuneScape Wiki MCP Server - github.com/birdwell/runescape-wiki-mcp`

## Develop

- Node.js 20+
- bun

```bash
bun install
bun run build
bun run start          # stdio MCP server
bun run test           # unit + protocol compliance
bun run inspector      # MCP Inspector
```

## Project layout

```
src/
├── index.ts          # stdio entry (serveStdio)
├── smithery.ts       # Smithery HTTP factory
├── server.ts         # createServer() + handlers
├── itemResolve.ts    # name → ID resolution
├── categories.ts     # GE category table
├── tools/            # MCP tools
└── resources.ts      # MCP resources
```

## Notes

- **RS3 only**, not OSRS (different IDs and endpoints).
- Guide prices and Weirdgloop history lag the live market. Pass your own buy and sell prices to `estimate_flip` when you have them.
- Ironman/hardcore `index_lite` endpoints are documented by Jagex but currently return HTTP 404; the tool reports that instead of silently returning normal-mode data.
- Smithery hosts should rebuild the server card after tool changes so the published schema matches this README.

## License

MIT — unofficial; not affiliated with Jagex or the RuneScape Wiki.
