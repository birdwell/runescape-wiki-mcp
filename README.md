# RuneScape 3 MCP Server

[![npm](https://img.shields.io/npm/v/runescape-wiki-mcp)](https://www.npmjs.com/package/runescape-wiki-mcp)
[![CI](https://github.com/birdwell/runescape-wiki-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/birdwell/runescape-wiki-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/birdwell/runescape-wiki-mcp)](https://github.com/birdwell/runescape-wiki-mcp/blob/main/LICENSE)

[![RuneScape Wiki MCP Server MCP server – quality and maintenance score on Glama](https://glama.ai/mcp/servers/birdwell/runescape-wiki-mcp/badges/card.svg)](https://glama.ai/mcp/servers/birdwell/runescape-wiki-mcp)

**RuneScape 3 MCP Server (RS3)** — Connect Claude, ChatGPT, Cursor, and other AI assistants to RuneScape Wiki, Grand Exchange prices, player hiscores, item comparisons, and money-making tools. Available as a hosted MCP server or npm package.

The GitHub repository is `runescape-wiki-mcp`. The server covers Grand Exchange market data and player hiscores as well as the wiki.

## What it does

Connects an AI assistant to RuneScape 3 data: item prices, 7–90 day trends, side-by-side comparisons, flip estimates after the 2% Grand Exchange tax, player hiscores, and RuneScape Wiki pages.

## Why use it

Research items, compare prices, estimate a flip, and look up a player without leaving the assistant. Ask in plain language. The assistant calls the tools.

## Example questions

- What's the current price of a Noxious scythe?
- Compare the price trends of a Noxious scythe, a Dragon rider lance, and an Abyssal whip.
- How has the price of a Noxious scythe changed over the past 30 days?
- Estimate the profit from flipping 100 Dragon rider lances.
- Look up my RuneScape stats and recommend what to train next.

Price questions use `lookup_item`, `get_item_price`, `compare_items`, `summarize_price_history`, and `estimate_flip`. Stats questions use `get_player_stats`; the assistant turns those levels into a training suggestion. Wiki questions use `search_wiki`, then `get_wiki_page_content`.

The server summarizes items you name. It does not rank the whole Grand Exchange by 30-day gain.

## Connect

Hosted endpoint: `https://runescape-wiki-mcp.fly.dev/mcp`

Cursor, Claude Desktop, and other clients that accept a remote MCP URL:

```json
{
  "mcpServers": {
    "runescape-wiki": {
      "url": "https://runescape-wiki-mcp.fly.dev/mcp"
    }
  }
}
```

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

Discovery:

- Server card: `https://runescape-wiki-mcp.fly.dev/mcp/server-card`
- AI Catalog: `https://runescape-wiki-mcp.fly.dev/.well-known/ai-catalog.json`
- Official MCP Registry: [`io.github.birdwell/runescape-wiki-mcp`](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.birdwell/runescape-wiki-mcp)
- npm: [`runescape-wiki-mcp`](https://www.npmjs.com/package/runescape-wiki-mcp)

Speaks MCP **2026-07-28** (stateless) via stdio and Streamable HTTP, with legacy 2025-era clients still supported.

## Tools

- `lookup_item` — Resolve an item name to a Grand Exchange ID and the latest price. Start here when you only know the name.
- `get_item_price` — Current Grand Exchange detail and trend for one item, by `itemId` or `name`.
- `get_item_graph` — About 180 days of daily prices, by `itemId` or `name`.
- `summarize_price_history` — Min, max, average, change, and volume over 7–90 days (default 30).
- `compare_items` — Compare up to 10 items by `names` or `itemIds`.
- `estimate_flip` — Estimated flip profit after the RS3 2% Grand Exchange sales tax.
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

- Jagex GE: `https://secure.runescape.com/m=itemdb_rs/api`
- Jagex hiscores lite: `https://secure.runescape.com/m=hiscore/index_lite.ws`
- Weirdgloop RS exchange: `https://api.weirdgloop.org/exchange/history/rs`
- RuneScape Wiki MediaWiki API: `https://runescape.wiki/api.php`

All requests send User-Agent:  
`RuneScape Wiki MCP Server - github.com/birdwell/runescape-wiki-mcp`

## Develop

- Node.js 20+
- npm

```bash
bun install
bun run build
bun run start          # stdio MCP server
bun run test           # unit + protocol compliance
bun run inspector  # MCP Inspector
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
- Ironman/hardcore `index_lite` endpoints are documented by Jagex but currently return HTTP 404; the tool reports that instead of silently returning normal-mode data.
- Smithery hosts should rebuild the server card after tool changes so the published schema matches this README.

## License

MIT — unofficial; not affiliated with Jagex or the RuneScape Wiki.
