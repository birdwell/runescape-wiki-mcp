# RuneScape 3 MCP Server

[![npm](https://img.shields.io/npm/v/runescape-wiki-mcp)](https://www.npmjs.com/package/runescape-wiki-mcp)
[![npm downloads per month](https://img.shields.io/npm/dm/runescape-wiki-mcp)](https://www.npmjs.com/package/runescape-wiki-mcp)
[![CI](https://github.com/birdwell/runescape-wiki-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/birdwell/runescape-wiki-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/birdwell/runescape-wiki-mcp)](https://github.com/birdwell/runescape-wiki-mcp/blob/main/LICENSE)
[![Glama connector quality and endpoint health](https://glama.ai/mcp/connectors/io.github.birdwell/runescape-wiki-mcp/badges/score.svg)](https://glama.ai/mcp/connectors/io.github.birdwell/runescape-wiki-mcp)

**Ask what it's worth, whether the flip clears tax, and what to train next.**

Connect Claude, ChatGPT, Cursor, and other assistants to RuneScape 3 Grand Exchange guide prices, 7–90 day history, flip math after the 2% tax, public RS3 hiscores, and wiki pages. RS3 only. Unofficial, and not affiliated with Jagex or the RuneScape Wiki.

An independent [Birdwell Labs](https://birdwellabs.com) project. No Jagex or Weird Gloop approval is claimed. [Support and rights concerns](mailto:support@birdwellabs.com) · [Permissions and source review](docs/permissions.md).

Default prices are Jagex guide prices and Weirdgloop history. They lag the in-game market. Ask for reported instant-buy/sell prices to include the separate RS3 trade feed at [prices.runescape.wiki](https://prices.runescape.wiki/rs).

[![Claude setup](https://img.shields.io/badge/Claude-Setup-D97757?style=for-the-badge)](#claude-setup)
[![ChatGPT setup](https://img.shields.io/badge/ChatGPT-Setup-087F5B?style=for-the-badge)](#chatgpt-setup)

## Questions to ask

- What's the guide price of a Noxious scythe, and how did it move over 30 days?
- Compare a Noxious scythe, a Dragon rider lance, and an Abyssal whip.
- Estimate the profit from flipping 100 Dragon rider lances after tax.
- Look up my stats and tell me the weakest skill to train. Normal mode.
- Find the RuneScape Wiki source link for the Abyssal whip special attack.

The server answers questions about items you name. It does not rank the whole Grand Exchange.

Price questions use `lookup_item`, `get_item_details`, `compare_item_prices`, `summarize_price_history`, and `estimate_flip`. Stats questions use `get_player_stats` on the selected normal, ironman or hardcore board; the assistant turns those levels into a training suggestion. Wiki questions use `search_wiki`, then `get_wiki_page_content`.

Wiki pages return source links by default. Article text is available only for reviewed revisions; the server does not supply an article summary when text is withheld.

## Access and data handling

This server reads public APIs and performs calculations. It does not connect to the game client, control characters, place trades or ask for your Jagex password, session cookies or bank PIN. A player-name lookup sends the supplied name to Jagex's public hiscores endpoint.

Your assistant receives tool results and may use them to generate an answer. Its own privacy, retention and model-training settings apply separately; this project cannot promise how an AI provider handles those results. Check linked sources before acting on generated advice.

See the [privacy policy](https://birdwellabs.com/privacy) before using the hosted service. Optional diagnostics may receive request context, and enabling `DEBUG` can print tool arguments and returned data. Do not submit secrets or information you do not want processed by the service and your AI provider.

## Connect

Hosted endpoint: `https://runescape-wiki-mcp.fly.dev/mcp`

[Privacy policy](https://birdwellabs.com/privacy) describes the tool-request data, diagnostics and service providers involved.

No server account, API key, game login or local installation is needed. Use Streamable HTTP with no authentication.

### Claude setup

1. Open **Customize → Connectors**, then **+ Add → Add custom connector**.
2. Name it **RuneScape Wiki MCP** and enter the hosted endpoint above.
3. Choose **No sign in** when asked about authentication, then finish adding the connector.
4. In a chat, enable it through **+ → Connectors** and ask: “What is the RS3 guide price of an Abyssal whip?”

Team and Enterprise users may need an owner to add the connector first. See [Claude's custom connector guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) for your account's setup flow.

### ChatGPT setup

1. On ChatGPT web, open **Plugins**, select **+**, then **Add custom MCP server**.
2. Name it **RuneScape Wiki MCP**, enter the hosted endpoint above, and select **No authentication**.
3. Review the connection warning, then choose **Create as a plugin**.
4. Install the resulting personal plugin. In a chat, type **@**, select it, and ask: “Compare Dragon bones and Frost dragon bones.”

Custom MCP access depends on your workspace permissions and security settings. See [OpenAI's custom MCP guide](https://developers.openai.com/api/docs/guides/custom-mcp-server) if the option is unavailable.

### Other MCP clients

For clients that accept remote MCP configuration, use:

```json
{
  "mcpServers": {
    "runescape-wiki": {
      "url": "https://runescape-wiki-mcp.fly.dev/mcp"
    }
  }
}
```

For clients that require local stdio, install through npm:

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

- [Glama hosted connector](https://glama.ai/mcp/connectors/io.github.birdwell/runescape-wiki-mcp)
- [MCPRush](https://mcprush.com/to/runescape-wiki-mcp?ref=badge)
- Server card: `https://runescape-wiki-mcp.fly.dev/mcp/server-card`
- AI Catalog: `https://runescape-wiki-mcp.fly.dev/.well-known/ai-catalog.json`
- Official MCP Registry: [`io.github.birdwell/runescape-wiki-mcp`](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.birdwell/runescape-wiki-mcp)
- npm: [`runescape-wiki-mcp`](https://www.npmjs.com/package/runescape-wiki-mcp)

Speaks MCP **2026-07-28** (stateless) via stdio and Streamable HTTP, with legacy 2025-era clients still supported.

## Tools

- `lookup_item` — Resolve an item name to a Grand Exchange ID and the latest guide or Weirdgloop price. Start here when you only know the name.
- `get_item_details` — Single/batch Jagex catalogue records and guide prices, with optional recorded-trade and numeric-fact enrichment.
- `get_price_series` — Raw Jagex history (~180 days) or Weirdgloop daily observations (~90 days), with inclusive UTC date bounds.
- `summarize_price_history` — Statistics over the last 7–90 usable daily samples (default 30); history lags market activity.
- `compare_item_prices` — Compare up to 10 items by `names` or `itemIds`.
- `estimate_flip` — Tax-adjusted flip profit, with optional remaining-quota and assumed-duration scenarios. Default prices lag the live market.
- `browse_items` — Browse one Grand Exchange category by starting letter. This is not a name search.
- `get_ge_info` — Catalogue metadata: default status, `view: "categories"` for IDs/names, or `view: "category_counts"` with `category` for letter counts.
- `get_player_stats` — RS3 hiscores for a username. `gameMode` selects normal, ironman or hardcore. A 404 means the player was not found on that board; no other board is substituted.
- `search_wiki` — Search RuneScape Wiki titles and source links when the page title is unknown.
- `get_wiki_page_content` — Source reference following redirects; text only for a reviewed revision and matching content hash.
- `get_wiki_entity_facts` — Structured monster combat statistics and quest metadata.
- `list_wiki_category_members` — Direct Wiki category members with category-bound continuation.
- `get_wiki_drop_table` — Indexed drop references, quantities, rolls and listed rarities; notes are excluded.

### Prompts

- `check_item_price` — `itemName`
- `compare_ge_items` — `items` (comma-separated names)
- `estimate_item_flip` — `itemName`, optional `quantity`
- `player_overview` — `username`

### Typical agent flow

```
lookup_item { query: "abyssal whip" }
  → id 4151, price …
get_item_details { itemId: 4151 }   # or { name: "Abyssal whip" }
summarize_price_history { name: "Abyssal whip", days: 30 }
search_wiki { query: "abyssal whip special attack" }
```

Optional history bounds use UTC calendar dates, for example `get_price_series { "name": "Abyssal whip", "from": "2026-10-01", "to": "2026-10-07" }`. Bounds filter available samples; they do not extend Jagex history.

For flip scenarios, `buyLimitRemaining` is your remaining quota in the current window. The result separates quantity/profit within that quota from the full requested quantity. `fillTimeMinutes` is your assumed round-trip time for the full request, including any quota waits; it yields an assumed profit per hour. These inputs are assumptions, not observed limits or predicted fills.

Batch catalogue metadata with the `get_item_details` argument `itemIds` (GE IDs returned by `lookup_item`), or batch wiki references with `get_wiki_page_content { "pages": ["Abyssal whip", "Grand Exchange"] }`. Each accepts 1–10 entries, preserves order and returns per-row `data` or `error`, plus success/failure counts. At most two upstream requests run concurrently; a wholly failed batch is a tool error. An upstream 429 stops queued requests and preserves Retry-After guidance. Single-item/page calls keep their existing response shape. Wiki reviews apply separately to every page.

`get_ge_info` reports the catalogue configuration RuneDay, its derived UTC date and age, retrieval time and canonical category count. These describe catalogue configuration, not item-price freshness; `priceFreshness` is `not_reported`. RuneDate conversion uses the [documented UTC epoch](https://runescape.wiki/w/Runedate).

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

### Attribution and third-party content

Created using intellectual property belonging to Jagex Limited under the terms of Jagex's Fan Content Policy. This content is not endorsed by or affiliated with Jagex.

See [Jagex's Fan Content Policy](https://legal.jagex.com/docs/policies/fan-content-policy). These credits do not establish additional permissions or a partnership.

Price history and item lookup use the [Weirdgloop API](https://api.weirdgloop.org/). Wiki text is by [RuneScape Wiki contributors](https://runescape.wiki/), generally licensed under [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/), subject to [content and revision-specific exceptions](https://meta.weirdgloop.org/w/Licensing).

Wiki search returns titles and links without copying snippets. Unreviewed pages return links only, with `contentStatus: "link_only"`, `text: null` and `attribution.license: null`. Both text and structured results carry source and contributor-history links. The server does not infer content permissions from a site's footer or namespace.

Extracts require a content-specific review in `src/wikiContentPolicy.ts`: exact title and revision, SHA-256 of the API's untrimmed plain-text extract, the actual license, copyright notices, reviewer, date and supporting review notes. No live pages are approved by default. Even approved pages fall back to links if the revision, namespace or content hash changes. Review the entire extract for imported or separately licensed material and preserve its notices. A digest verifies the reviewed bytes; it does not establish legal permission.

Noncommercial use and share-alike conditions apply where required by the reviewed license. Images and other media have their own terms. Preserve the attribution and applicable license when redistributing wiki content; downstream summaries and adaptations must also respect those terms.

The MIT license covers this project's original software, not third-party article text, game data, artwork or trademarks. Attribution alone does not settle the outstanding API, commercial-use or branding permission questions.

Game names identify the subject of the tool; they do not indicate sponsorship. Public API access, an npm package or a directory listing does not establish provider approval. Do not advertise this project as officially approved, ban-safe or authorized for every commercial or AI use. See the [source review and outstanding permissions](docs/permissions.md) for the evidence and remaining questions.

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
- Normal, ironman and hardcore `index_lite` endpoints are supported. A player missing from the selected board returns a 404 tool error without falling back to another board.
- Smithery hosts should rebuild the server card after tool changes so the published schema matches this README.

## License

Original software: MIT. Third-party content retains its own licenses and rights; see [Attribution and third-party content](#attribution-and-third-party-content). Unofficial; not affiliated with Jagex or the RuneScape Wiki.

Raw history: `get_price_series` defaults to Jagex daily/average maps. Set `source: "weirdgloop"` for chronological daily `samples` with Unix-millisecond timestamps, prices and available volume. Inclusive UTC `from`/`to` bounds apply to either provider. Use `summarize_price_history` for computed statistics.

Wiki search defaults to articles. Query prefixes such as `prefix:Category:Weapons` select other Wiki namespaces. Search returns references only; page text remains subject to the existing exact revision/content review policy.

Catalogue records include `item.wikiUrl`, an official Wiki item-ID lookup link that redirects to the article. This does not fetch or reproduce article text.

### Reported trades and numeric item facts

`get_item_details { "itemId": 4151, "includeLiveData": true }` adds `item.liveTrades` (last reported instant-buy/high and instant-sell/low transactions) and `item.wikiFacts` (published buy-limit cap, alchemy values and base value). The flag also works with `itemIds` batches. Default Jagex guide-price fields stay unchanged.

This uses the [RS3 API v2](https://runescape.wiki/w/RuneScape:Real-time_Prices), not the OSRS API or the obsolete RS3 v1 path. Trade timestamps are Unix seconds. Missing sides remain null; recorded trades are not an order book or guaranteed executable offers. A published buy limit does not reveal a player's remaining quota.

Public trade snapshots cache for 30 seconds and the shared numeric mapping for 10 minutes per server process, with concurrent requests coalesced and at most 512 cached item snapshots. `fetchedAt` records the original retrieval time on cache hits. Only numeric mapping facts are exposed; mapping examine text, names and media are discarded. Wiki article text still requires the existing per-revision/content review.

### Structured monster and quest facts

`get_wiki_entity_facts { "page": "Abyssal demon", "kind": "monster" }` returns indexed numeric combat statistics. `kind: "quest"` returns quest IDs, membership, controlled difficulty/type labels and normalized release dates. Discover titles with `search_wiki`. Redirects resolve before querying; `limit` (1–10, default 5) caps variants, and `truncated` signals additional indexed rows. A mismatched page/kind is an error. Entity IDs are not GE item IDs.

This tool queries fixed, bounded datasets with title values kept inside data literals. It never fetches article prose, images or narrative summaries. Returned references identify the page/variant; attribution links identify the source without inferring an article-content license. The existing exact revision/hash policy still governs `get_wiki_page_content` text.

### Discovery names and legacy calls

Discovery now uses `get_item_details`, `get_price_series` and `compare_item_prices` to distinguish full catalogue records, raw dated observations and side-by-side snapshots. Existing calls to `get_item_price`, `get_item_graph` and `compare_items` remain accepted as aliases with the same arguments and results. Aliases are not duplicated in the 14-tool discovery list.

Clients or gateways with tool-name allowlists may need the new discovery names enabled. The connector ID and hosted endpoint remain the same. No legacy call name is removed.

### Wiki categories and indexed drops

`list_wiki_category_members { "category": "Category:Weapons", "limit": 20 }` returns direct member titles/IDs/namespace links. Pass its opaque `nextCursor` with the same category to continue. This does not recursively expand subcategories or fetch article bodies/images. Empty/missing categories can both return an empty set; concurrent Wiki edits can move page boundaries.

`get_wiki_drop_table { "page": "Abyssal demon", "limit": 20 }` returns indexed item references, quantity bounds, rolls and listed probabilities or controlled rarity labels. Unknown facts remain null. Use `nextOffset` to continue; optional `variant` must be an exact `sourceReference` from that article. Item references are not GE IDs: resolve them with `lookup_item`.

Drop facts come from the RS3 `dropsline` structured index. Editorial notes and alternative-rate annotations are discarded; `hasOmittedAnnotations` flags their presence. Listed probabilities describe individual rows, not an unconditional combined loot model. Follow `sourceUrl` for conditions, nested tables and source context. The exact revision/hash review gate for article text remains unchanged.

### Catalogue metadata views

`get_ge_info {}` preserves the original configuration-status response. Use `{ "view": "categories" }` to list GE IDs/names, or `{ "view": "category_counts", "category": 24 }` to choose nonempty starting letters before `browse_items`. Category IDs identify groups, not items; their entry counts are not available stock. These views each return their corresponding existing result shape.

Legacy `get_all_categories {}` and `get_category_info { "category": 24 }` calls remain accepted with unchanged results, alongside the three price-tool aliases. The two catalogue helpers are no longer duplicated in discovery. All existing call names remain supported; the published surface has 14 tools.

Wiki attribute discovery uses existing classification queries, e.g. `search_wiki { "query": "incategory:\"Novice quests\"" }`. To traverse a category subtree, call `list_wiki_category_members` again on returned namespace-14 member titles; keep each category's cursor separate.
