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
│       ├── itemTools.ts      # lookup_item, get_price_series
│       ├── priceTools.ts     # get_item_details, browse_items, GE meta
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
| `get_item_details` | `itemId`, `name`, **or** `itemIds` (1–10) | GE catalogue metadata + guide prices/trends; optional batch |
| `get_price_series` | `itemId` **or** `name`, optional `from`/`to` | About 180 days of Jagex observations; inclusive UTC date bounds |
| `summarize_price_history` | `itemId` or `name`, optional `days` | Compact 7–90d trend summary |
| `compare_item_prices` | `names` **or** `itemIds` (1–10) | Bulk compare |
| `estimate_flip` | `itemId` or `name`, optional prices/qty/quota/duration | Profit after 2% tax; caller-supplied `buyLimitRemaining`/`fillTimeMinutes` scenarios |
| `browse_items` | `category`, optional `alpha`/`page` | Catalogue browse — **not** name search |
| `get_all_categories` | — | Category IDs 0–43 |
| `get_category_info` | `category` | Letter counts |
| `get_ge_info` | — | Catalogue configuration RuneDay, derived UTC date/age, fetch time, category count; not price freshness |
| `get_player_stats` | `username`, optional `gameMode` | Normal, ironman and hardcore boards; 404 is player/board-specific |
| `search_wiki` | `query`, optional `limit` | Wiki title search. Not a price search. |
| `get_wiki_page_content` | `page` **or** `pages` (1–10) | Single/batch references; text only for a reviewed revision and extract hash |
| `get_wiki_entity_facts` | `page`, `kind` (monster/quest), optional `limit` | Structured scalar facts and variant references; no article prose |

Prompts: `check_item_price`, `compare_ge_items`, `estimate_item_flip`, `player_overview`.

### Agent workflow

```
lookup_item { "query": "frost dragon bones" }
get_item_details { "itemId": 18832 }   # or name
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
RuneScape Wiki MCP Server - github.com/birdwell/runescape-wiki-mcp
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
bun run build
bun run debug
bun run test
bun run inspector
```

Wire smoke:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"t","version":"1"},"io.modelcontextprotocol/clientCapabilities":{}}}}' | node dist/index.js
```

## Category IDs (authoritative: `src/categories.ts`)

0 Miscellaneous · 1 Ammo · 2 Arrows · 3 Bolts · 4–5 Construction · 6 Cooking · 7 Costumes · 8 Crafting · 9 Familiars · 10 Farming · 11 Fletching · 12 Food · 13 Herblore · 14–15 Hunting · 16 Jewellery · 17–18 Magic · 19–21 Melee armour · 22–24 Melee weapons · 25 Mining/Smithing · 26 Potions · 27–28 Prayer · 29–30 Ranged · 31 Runecrafting · 32 Runes/Spells · 33 Seeds · 34 Summoning scrolls · 35 Tools · 36 Woodcutting · 37 Pocket · 38 Stone spirits · 39 Salvage · 40 Firemaking · 41 Archaeology · 42 Miscellaneous · 43 Necromancy armour

## Important notes

- RS3 only (not OSRS)
- Default prices are Jagex guide prices and Weirdgloop daily history. They lag the live high/low feed at prices.runescape.wiki. Do not describe them as real-time.
- Do not invent item IDs — call `lookup_item`
- Rebuild Smithery server card after tool schema changes
- Respect API rate limits

Raw history: `get_price_series` defaults to Jagex daily/average maps. Set `source: "weirdgloop"` for chronological daily `samples` with Unix-millisecond timestamps, prices and available volume. Inclusive UTC `from`/`to` bounds apply to either provider. Use `summarize_price_history` for computed statistics.

Wiki search defaults to articles. Query prefixes such as `prefix:Category:Weapons` select other Wiki namespaces. Search returns references only; page text remains subject to the existing exact revision/content review policy.


Opt-in `get_item_details.includeLiveData` uses `https://prices.runescape.wiki/api/v2/rs`: reported high/low transaction prices (Unix seconds), plus numeric buy-limit/alchemy/base-value mapping facts. It preserves guide defaults and works in batches. These are not active orders or guaranteed fill prices; buy limits are caps, not remaining account quota. Quotes cache 30 seconds; mapping caches 10 minutes per process. Do not use the obsolete v1 RS3 path or substitute OSRS data.

`get_wiki_entity_facts` adds structured `monster` combat statistics or `quest` metadata from a canonical Wiki page. Use page titles, not URLs/section fragments. limit is 1–10 variant rows (default 5). Numeric/Boolean facts, controlled labels and dates only; no article prose or images. Entity IDs are not GE item IDs.

Canonical discovery names are get_item_details, get_price_series and compare_item_prices. Legacy get_item_price/get_item_graph/compare_items calls remain accepted by the central dispatcher; keep those aliases when evolving implementation modules. Update tool-name allowlists for canonical discovery where necessary.
