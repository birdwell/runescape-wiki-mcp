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

Price questions use `lookup_item`, `get_item_details` current-data views, `get_price_series` history views, and `estimate_flip`. Stats questions use `get_player_stats` on the selected normal, ironman or hardcore board; the assistant turns those levels into a training suggestion. Wiki questions use `search_wiki`, then `get_wiki_page_content`.

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
- `get_price_series` — Explicit observations/statistics views over historical prices; ID-based preferred discovery.
- `estimate_flip` — Tax-adjusted flip profit, with optional remaining-quota and assumed-duration scenarios. Default prices lag the live market.
- `browse_items` — Browse one Grand Exchange category by starting letter. This is not a name search.
- `get_ge_info` — Catalogue metadata: default status, `view: "categories"` for IDs/names, or `view: "category_counts"` with `category` for letter counts.
- `get_player_stats` — RS3 hiscores for a username. `gameMode` selects normal, ironman or hardcore. A 404 means the player was not found on that board; no other board is substituted.
- `search_wiki` — Search RuneScape Wiki titles and source links when the page title is unknown.
- `get_wiki_page_content` — Source reference following redirects; text only for a reviewed revision and matching content hash.
- `get_wiki_entity_facts` — Structured monster combat statistics and quest metadata.
- `list_wiki_category_members` — Direct Wiki category members with category-bound continuation.
- `get_wiki_drop_table` — Indexed drop references, quantities, rolls and listed rarities; notes are excluded.
- `get_player_quests` — Complete public RuneMetrics journal with quest statuses and Jagex eligibility; no Jev key needed.
- `recommend_next_activity` — Opt-in paid goal-based planning using account context and Wiki evidence; requires the server configuration below.

### Try the Jev recommendation tool locally

The MCP server owns the loop. The calling assistant supplies a goal and whatever
account context it knows, then explains the structured result to the player.
No separate agent framework or text-generation model is needed inside the server.

Set these in a local, ignored `.env.local` file. Do not commit the API key:

```dotenv
RUNESCAPE_RECOMMENDATIONS_ENABLED=true
TYPESAFE_API_KEY=your-typesafe-key
# Optional; defaults to jev-latest
TYPESAFE_MODEL=jev-latest
```

```bash
bun run build
node --env-file=.env.local dist/index.js
# Or use dist/http.js for a local HTTP MCP endpoint.
```

The entry point does not automatically load dotenv files. For an MCP client's
stdio configuration, pass the same settings through its server `env` block or
include `--env-file=/absolute/path/to/.env.local` in the Node arguments.

Example `recommend_next_activity` arguments:

```json
{
  "goal": "Train Prayer toward bossing",
  "context": {
    "username": "YourName",
    "gameMode": "normal",
    "skills": { "Prayer": 50 },
    "budgetGp": 2000000,
    "sessionMinutes": 45,
    "playStyle": "active",
    "members": true,
    "completedQuests": ["The Restless Ghost"],
    "gear": [],
    "notes": "Prefer methods that help unlock future combat upgrades."
  }
}
```

Only `goal` is required. Public hiscores fill missing skill levels when a username
is supplied; caller-supplied levels take precedence and their provenance is returned.
Quest completion comes from RuneMetrics for quest goals; membership, gear and bank
contents remain unknown unless provided. For other goals, a caller-supplied completed
list records known completions only; absence does not mean a quest is unfinished.

For a quest question, supply the username and natural-language goal:

```json
{
  "goal": "What is the best mining quest to do?",
  "context": { "username": "YourName" }
}
```

The server reads the fresh public RuneMetrics journal and the wiki pages for its
quests, resolves title aliases and quest disambiguation, and reads the wiki's
shared prerequisite table. Completed quests are excluded. Every unfinished quest
is sent to Jev with completion rewards, separate conditional post-quest rewards,
skill and quest prerequisites, current status, eligibility, and known blockers.
Independent comparisons run in bounded batches, then a final comparison picks a
quest to do now and useful blocked targets. The planner fetches the finalists'
quick-guide checklists and returns their starting location, length, items, enemies,
and opening walkthrough steps. Started quests retain their status; the exact stage
must be read from the player's in-game journal.

Quest goals use at most 24 Jev requests, including routing, with two comparison
requests in flight at once. Individual request bodies stay below 40,000 serialized
characters. `questCoverage` reports journal totals, metadata coverage and the exact
number of unfinished quests evaluated. Missing/private journals and missing wiki
facts are reported explicitly. Skill/prerequisite checks and Jagex eligibility
constrain the choices; current membership, inventory, combat readiness, boost
alternatives and miscellaneous requirements may still need checking. A stale
caller-supplied completion list does not override the fresh official journal.
Public wiki quest metadata is cached for six hours; player journals are never cached.

For a skill training plan, use a goal such as "Train Mining to 70", or supply
`goalType: "skill_training"`, `targetSkill: "Mining"` and `targetLevel: 70`.
The server reads wiki training tables and the fresh public quest completion set when
a username is available, preserves separate rate assumptions such as
buying energy versus gathering it, and compares methods available at each milestone.
`trainingPlan` includes the next method, guide excerpts, source estimates, alternatives,
and the remaining XP when it can be calculated. Missing XP uses an explicitly labeled
level-floor upper bound. Invention's elite XP curve is not calculated with the standard formula.
Plans cover up to six milestones and report any remaining range. Recommended level
bands never become hard upper eligibility limits. Unsupported guide layouts remain explicit.

For unlock progression, use a goal such as "Help me unlock Invention", or supply
`goalType: "unlock_progression"` and `unlock: "Invention"`. The planner reads sourced
requirements, walks unfinished prerequisite quests in order, and returns every known
missing skill target. It selects one next action and fetches its training or quest guide.
The initial catalogue covers Invention, targets in the wiki PvM unlock guide, and named
quest rewards found in the account's quest catalogue. Broad comparisons cover the
closest 16 targets; this is not a catalogue of every RuneScape unlock. Quest completion
does not prove a reward was claimed or that additional challenges or ability levels are met.

Training goals use at most two Jev requests; unlock goals use at most three, including
training selection. Set `goalType: "activity"` to use the original general activity search.
Other activity goals make at most three Jev requests: route the goal, shortlist wiki
search results, then assess goal relevance, eligibility, budget and session fit
in one batch. The server performs up to two wiki searches, evaluates at most six
candidates, and reads at most three pages. Page excerpts are capped at 6,000
characters. Routing and non-quest requests have a 55-second deadline. Full quest
comparisons have a separate five-minute deadline after routing, to accommodate
the bounded batches and catalogue reads. MCP clients should allow that longer
timeout for quest requests. All paths have individual fetch timeouts and
an aggregate 20,000-character serialized JSON limit on caller input, checked before
paid calls. Excerpts are shortened further when needed to keep the complete Jev
request within 40,000 serialized characters; returned sources reflect those excerpts.
There are no automatic paid retries. Returned token counts let you measure actual usage;
this prototype does not promise a particular dollar cost.

The result includes `recommended`, `needs_context`, `no_match`, or `goal_met`, a recommendation
when supported, alternatives, wiki excerpts and links, missing context,
warnings, per-dimension Jev answers and token usage. Suggestions are wiki activities
or guides, not an exhaustive optimized progression plan. For general activity suggestions, requirements are model
assessments over excerpts, **not verified requirements**; `requirementsVerified`
is false. Quest suggestions report deterministic checks and their remaining limits
through `requirementChecks`, `blockers`, and `unknowns`. Training and unlock plans return
`trainingCoverage` and `unlockCoverage`; rates and profit figures are source estimates,
not current-price or personal-performance predictions. It does not invent costs or durations.
An assistant should communicate any conditions and ask for relevant missing facts.

Goals, supplied account context and retrieved evidence are sent to TypeSafe for
evaluation. The recommendation module keeps account data and decisions only for
the request. It caches general wiki extracts for five minutes, up to 64 pages, and public
training/unlock guides for six hours, up to 16 pages.
It does not cache goal searches or change the player's account. The other tools
continue working when recommendations are disabled. Use locally or behind access
control for the first trial; enabling this tool on a public server allows callers
to consume the operator's paid Jev quota.

### Prompts

- `check_item_price` — `itemName`
- `compare_ge_items` — `items` (comma-separated names)
- `estimate_item_flip` — `itemName`, optional `quantity`
- `player_overview` — `username`

### Typical agent flow

```
lookup_item { query: "abyssal whip" }
  → id 4151, price …
get_item_details { itemId: 4151 }
get_price_series { itemId: 4151, view: "statistics", days: 30 }
search_wiki { query: "abyssal whip special attack" }
```

Optional history bounds use UTC calendar dates, for example `get_price_series { "itemId": 4151, "from": "2026-10-01", "to": "2026-10-07" }`. Bounds filter available samples; they do not extend Jagex history.

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
bun run build:server-card # refresh local Smithery tool metadata after schema changes
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

Raw history: `get_price_series` defaults to Jagex daily/average maps. Set `source: "weirdgloop"` for chronological daily `samples` with Unix-millisecond timestamps, prices and available volume. Inclusive UTC `from`/`to` bounds apply to either provider. Use `view: "statistics"` for computed statistics.

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

Discovery groups current records and candidate comparisons under `get_item_details`, and dated observations and statistics under `get_price_series`. Existing calls to `get_item_price`, `get_item_graph`, `compare_item_prices`, `compare_items` and `summarize_price_history` remain accepted with the same arguments and results. Aliases are not duplicated in the 14-tool discovery list.

Clients or gateways with tool-name allowlists may need the new discovery names enabled. The connector ID and hosted endpoint remain the same. No legacy call name is removed.

### Wiki categories and indexed drops

`list_wiki_category_members { "category": "Category:Weapons", "limit": 20 }` returns direct member titles/IDs/namespace links. Pass its opaque `nextCursor` with the same category to continue. This does not recursively expand subcategories or fetch article bodies/images. Empty/missing categories can both return an empty set; concurrent Wiki edits can move page boundaries.

`get_wiki_drop_table { "page": "Abyssal demon", "limit": 20 }` returns indexed item references, quantity bounds, rolls and listed probabilities or controlled rarity labels. Unknown facts remain null. Use `nextOffset` to continue; optional `variant` must be an exact `sourceReference` from that article. Item references are not GE IDs: resolve them with `lookup_item`.

Drop facts come from the RS3 `dropsline` structured index. Editorial notes and alternative-rate annotations are discarded; `hasOmittedAnnotations` flags their presence. Listed probabilities describe individual rows, not an unconditional combined loot model. Follow `sourceUrl` for conditions, nested tables and source context. The exact revision/hash review gate for article text remains unchanged.

### Catalogue metadata views

`get_ge_info {}` preserves the original configuration-status response. Use `{ "view": "categories" }` to list GE IDs/names, or `{ "view": "category_counts", "category": 24 }` to choose nonempty starting letters before `browse_items`. Category IDs identify groups, not items; their entry counts are not available stock. These views each return their corresponding existing result shape.

Legacy `get_all_categories {}` and `get_category_info { "category": 24 }` calls remain accepted with unchanged results, alongside the pricing compatibility calls. The two catalogue helpers are no longer duplicated in discovery. All existing call names remain supported; the published surface has 14 tools.

Wiki attribute discovery uses existing classification queries, e.g. `search_wiki { "query": "incategory:\"Novice quests\"" }`. To traverse a category subtree, call `list_wiki_category_members` again on returned namespace-14 member titles; keep each category's cursor separate.

### Explicit history views and preferred ID inputs

Fresh discovery uses `lookup_item` as the name-resolution step. Pass its chosen GE ID to records, history, comparison and flip tools. Legacy name selectors—including `compare_items`/`compare_item_prices` name arrays—remain accepted by the server with unchanged results, but are not duplicated in the preferred schemas.

`get_price_series { "itemId": 4151 }` preserves the original observation response. `view: "observations"` supports Jagex (default) or Weirdgloop plus UTC `from`/`to` bounds. `view: "statistics"` uses Weirdgloop and optional `days` (default 30 trailing usable samples); it rejects Jagex and calendar-date bounds. Use one mode per call. The legacy `summarize_price_history` call remains accepted and returns exactly the same result as the statistics view.

Strict gateways or clients validating against fresh discovery must use the preferred ID-based schemas and history views. Compatibility names/selectors remain callable on the server for older clients; this does not bypass a gateway's own schema or allowlist policy.

### Current-data views

`get_item_details { "itemId": 4151 }` preserves the original catalogue-record response. Use `view: "records"` for single/batch Jagex records and optional recorded-trade enrichment. Use `{ "view": "comparison", "itemIds": [4151,536] }` for compact Weirdgloop daily snapshots; this view rejects `itemId` and live enrichment. Legacy `compare_item_prices` and `compare_items` calls remain accepted with unchanged results, including their older name-array selectors. They are no longer duplicated in the 14-tool discovery list.
