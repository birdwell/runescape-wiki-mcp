# RuneScape Wiki MCP Server

A Model Context Protocol (MCP) server for **RuneScape 3** Grand Exchange prices, item name lookup, player hiscores, and wiki page extracts.

Speaks MCP **2026-07-28** (stateless) via `serveStdio`, with legacy 2025-era clients still supported.

## Prerequisites

- Node.js 20+
- npm

## Install / Build / Run

```bash
npm install
npm run build
npm start          # stdio MCP server
npm test           # unit + protocol compliance
npm run inspector  # MCP Inspector
```

## Claude Desktop

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

## Tools

| Tool | Purpose |
|------|---------|
| `lookup_item` | **Name → ID + latest price** (Weirdgloop + wiki opensearch). Start here when you only know the name. |
| `get_item_price` | GE detail + trends by `itemId` **or** `name` |
| `get_item_graph` | 180-day price graph by `itemId` **or** `name` |
| `summarize_price_history` | Compact 7–90 day trend summary (min/max/avg/change/volume) |
| `compare_items` | Bulk compare up to 10 items by `names` or `itemIds` |
| `estimate_flip` | Flip profit estimate after RS3 2% GE sales tax |
| `browse_items` | Catalogue browse by category + starting letter (not a name search) |
| `get_all_categories` | Category ID → name map (0–43) |
| `get_category_info` | Letter counts for one category |
| `get_ge_info` | GE database metadata (`lastConfigUpdateRuneday`) |
| `get_player_stats` | RS3 hiscores by username (`gameMode`: `normal` works; ironman/hardcore currently 404 from Jagex) |
| `get_wiki_page_content` | Plain-text wiki extract (follows redirects) |

### Prompts (workflow templates)

| Prompt | Args |
|--------|------|
| `check_item_price` | `itemName` |
| `compare_ge_items` | `items` (comma-separated) |
| `estimate_item_flip` | `itemName`, optional `quantity` |
| `player_overview` | `username` |

### Typical agent flow

```
lookup_item { query: "abyssal whip" }
  → id 4151, price …
get_item_price { itemId: 4151 }   # or { name: "Abyssal whip" }
get_item_graph { itemId: 4151 }
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
`RuneScape Wiki MCP Server - github.com/joshbirdwell/runescape-wiki-mcp`

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
