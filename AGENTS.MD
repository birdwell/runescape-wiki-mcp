# RuneScape Wiki MCP Server - Agent Instructions

## Overview

MCP server for **RuneScape 3** Grand Exchange prices, item name lookup, player hiscores, and wiki extracts. Uses `@modelcontextprotocol/server` v2 and speaks **MCP 2026-07-28** (stateless) via `serveStdio`, with legacy 2025-era support.

## Architecture

```
runescape-wiki-mcp/
├── src/
│   ├── index.ts          # stdio entry (serveStdio)
│   ├── smithery.ts       # Smithery HTTP factory
│   ├── server.ts         # createServer() + handlers
│   ├── itemResolve.ts    # name → ID (Weirdgloop + wiki opensearch)
│   ├── categories.ts     # GE category table (0-43)
│   ├── resources.ts      # MCP resources
│   └── tools/
│       ├── index.ts
│       ├── itemTools.ts      # lookup_item, get_item_graph
│       ├── priceTools.ts     # get_item_price, browse_items, GE meta
│       ├── playerTools.ts
│       └── wikiTools.ts
```

- **stdio:** `serveStdio(() => createServer())`
- **HTTP/Smithery:** default-export `createServer` factory (fresh instance per request)
- Protocol errors (`ProtocolError` / `ResourceNotFoundError`) vs tool `isError` results

## Tools

| Tool | Args | Notes |
|------|------|-------|
| `lookup_item` | `query`, optional `limit` | **Start here for names.** Returns id, price, volume. |
| `get_item_price` | `itemId` **or** `name` | GE detail + trends |
| `get_item_graph` | `itemId` **or** `name` | 180-day graph |
| `summarize_price_history` | `itemId` or `name`, optional `days` | Compact 7–90d trend summary |
| `compare_items` | `names` **or** `itemIds` (1–10) | Bulk compare |
| `estimate_flip` | `itemId` or `name`, optional prices/qty | Flip profit after 2% tax |
| `browse_items` | `category`, optional `alpha`/`page` | Catalogue browse — **not** name search |
| `get_all_categories` | — | Category IDs 0–43 |
| `get_category_info` | `category` | Letter counts |
| `get_ge_info` | — | `lastConfigUpdateRuneday` |
| `get_player_stats` | `username`, optional `gameMode` | `normal` works; ironman/hardcore currently HTTP 404 from Jagex |
| `get_wiki_page_content` | `page` | Plain text; follows redirects |

Prompts: `check_item_price`, `compare_ge_items`, `estimate_item_flip`, `player_overview`.

### Agent workflow

```
lookup_item { "query": "frost dragon bones" }
get_item_price { "itemId": 18832 }   # or name
get_player_stats { "username": "Zezima", "gameMode": "normal" }
```

## Resources

- `runescape://ge/info` — GE database metadata (not prices)
- `runescape://ge/categories` — canonical category list

## APIs

- GE: `https://secure.runescape.com/m=itemdb_rs/api`
- Hiscores: `https://secure.runescape.com/m=hiscore/index_lite.ws?player=`
- Weirdgloop: `https://api.weirdgloop.org/exchange/history/rs/latest`
- Wiki: `https://runescape.wiki/api.php`

User-Agent (required):

```
RuneScape Wiki MCP Server - github.com/joshbirdwell/runescape-wiki-mcp
```

## Common item IDs

```
Abyssal whip: 4151
Frost dragon bones: 18832
Dragon bones: 536
Bond: 29492
```

## Debugging

```bash
npm run build
npm run debug
npm test
npm run inspector
```

Wire smoke:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"t","version":"1"},"io.modelcontextprotocol/clientCapabilities":{}}}}' | node dist/index.js
```

## Category IDs (authoritative: `src/categories.ts`)

0 Miscellaneous · 1 Ammo · 2 Arrows · 3 Bolts · 4–5 Construction · 6 Cooking · 7 Costumes · 8 Crafting · 9 Familiars · 10 Farming · 11 Fletching · 12 Food · 13 Herblore · 14–15 Hunting · 16 Jewellery · 17–18 Magic · 19–21 Melee armour · 22–24 Melee weapons · 25 Mining/Smithing · 26 Potions · 27–28 Prayer · 29–30 Ranged · 31 Runecrafting · 32 Runes/Spells · 33 Seeds · 34 Summoning scrolls · 35 Tools · 36 Woodcutting · 37 Pocket · 38 Stone spirits · 39 Salvage · 40 Firemaking · 41 Archaeology · 42 Miscellaneous · 43 Necromancy armour

## Important notes

- RS3 only (not OSRS)
- Do not invent item IDs — call `lookup_item`
- Rebuild Smithery server card after tool schema changes
- Respect API rate limits
