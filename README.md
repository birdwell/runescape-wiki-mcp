# RuneScape 3 MCP Server

[![npm](https://img.shields.io/npm/v/runescape-wiki-mcp)](https://www.npmjs.com/package/runescape-wiki-mcp)
[![npm downloads per month](https://img.shields.io/npm/dm/runescape-wiki-mcp)](https://www.npmjs.com/package/runescape-wiki-mcp)
[![CI](https://github.com/birdwell/runescape-wiki-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/birdwell/runescape-wiki-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/birdwell/runescape-wiki-mcp)](https://github.com/birdwell/runescape-wiki-mcp/blob/main/LICENSE)
[![Glama connector quality and endpoint health](https://glama.ai/mcp/connectors/io.github.birdwell/runescape-wiki-mcp/badges/score.svg)](https://glama.ai/mcp/connectors/io.github.birdwell/runescape-wiki-mcp)

**Ask what it's worth, whether the flip clears tax, and what to train next.**

Connect Claude, ChatGPT, Cursor, and other assistants to RuneScape 3 Grand Exchange guide prices, 7–90 day history, flip math after the 2% tax, public RS3 hiscores, and wiki pages. RS3 only. Unofficial, and not affiliated with Jagex or the RuneScape Wiki.

An independent [Birdwell Labs](https://birdwellabs.com) project. No Jagex or Weird Gloop approval is claimed. [Support and rights concerns](mailto:support@birdwellabs.com) · [Permissions and source review](docs/permissions.md).

Prices are Jagex guide prices and Weirdgloop history. They lag the in-game market. Live high and low prices are a separate feed at [prices.runescape.wiki](https://prices.runescape.wiki/rs).

[![Claude setup](https://img.shields.io/badge/Claude-Setup-D97757?style=for-the-badge)](#claude-setup)
[![ChatGPT setup](https://img.shields.io/badge/ChatGPT-Setup-087F5B?style=for-the-badge)](#chatgpt-setup)

## Questions to ask

- What's the guide price of a Noxious scythe, and how did it move over 30 days?
- Compare a Noxious scythe, a Dragon rider lance, and an Abyssal whip.
- Estimate the profit from flipping 100 Dragon rider lances after tax.
- Look up my stats and tell me the weakest skill to train. Normal mode.
- Find the RuneScape Wiki source link for the Abyssal whip special attack.

The server answers questions about items you name. It does not rank the whole Grand Exchange.

Price questions use `lookup_item`, `get_item_price`, `compare_items`, `summarize_price_history`, and `estimate_flip`. Stats questions use `get_player_stats` on the selected normal, ironman or hardcore board; the assistant turns those levels into a training suggestion. Wiki questions use `search_wiki`, then `get_wiki_page_content`.

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
- `get_item_price` — Jagex guide price, trend, and examine text for one item, by `itemId` or `name`. Guide prices lag the live market.
- `get_item_graph` — About 180 days of daily prices, by `itemId` or `name`.
- `summarize_price_history` — Min, max, average, change, and volume over 7–90 days (default 30). History lags the live market.
- `compare_items` — Compare up to 10 items by `names` or `itemIds`.
- `estimate_flip` — Estimated flip profit after the RS3 2% Grand Exchange sales tax. Default prices lag the live market.
- `browse_items` — Browse one Grand Exchange category by starting letter. This is not a name search.
- `get_all_categories` — Category IDs 0–43 and their names.
- `get_category_info` — How many items sit under each letter in one category.
- `get_ge_info` — Grand Exchange database metadata (`lastConfigUpdateRuneday`), not prices.
- `get_player_stats` — RS3 hiscores for a username. `gameMode` selects normal, ironman or hardcore. A 404 means the player was not found on that board; no other board is substituted.
- `search_wiki` — Search RuneScape Wiki titles and source links when the page title is unknown.
- `get_wiki_page_content` — Source reference following redirects; text only for a reviewed revision and matching content hash.

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
