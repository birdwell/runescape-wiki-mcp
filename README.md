# RuneScape 3 MCP Server

[![npm](https://img.shields.io/npm/v/runescape-wiki-mcp)](https://www.npmjs.com/package/runescape-wiki-mcp)
[![npm downloads per month](https://img.shields.io/npm/dm/runescape-wiki-mcp)](https://www.npmjs.com/package/runescape-wiki-mcp)
[![CI](https://github.com/birdwell/runescape-wiki-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/birdwell/runescape-wiki-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/birdwell/runescape-wiki-mcp)](https://github.com/birdwell/runescape-wiki-mcp/blob/main/LICENSE)
[![Glama connector quality and endpoint health](https://glama.ai/mcp/connectors/io.github.birdwell/runescape-wiki-mcp/badges/score.svg)](https://glama.ai/mcp/connectors/io.github.birdwell/runescape-wiki-mcp)

**Ask what it's worth, whether the flip clears tax, and what to train next.**

Connect Claude, ChatGPT, Cursor, and other assistants to RuneScape 3 Grand Exchange guide prices, 7–90 day history, flip math after the 2% tax, normal-mode hiscores, and wiki pages. RS3 only. Unofficial, and not affiliated with Jagex or the RuneScape Wiki.

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

Price questions use `lookup_item`, `get_item_price`, `compare_items`, `summarize_price_history`, and `estimate_flip`. Stats questions use `get_player_stats` on the normal hiscores; the assistant turns those levels into a training suggestion. Wiki questions use `search_wiki`, then `get_wiki_page_content`.

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
- `get_player_quests` — Complete public RuneMetrics quest journal, including completed/started/not-started status and Jagex eligibility. No Jev key required.
- `get_player_stats` — RS3 hiscores for a username. `gameMode: normal` works. Ironman and hardcore currently return HTTP 404 from Jagex.
- `search_wiki` — Search RuneScape Wiki titles and source links when the page title is unknown.
- `get_wiki_page_content` — Source reference following redirects; text only for a reviewed revision and matching content hash.
- `recommend_next_activity` — Opt-in Jev prototype for goal-based suggestions with wiki evidence, account context, alternatives and unknowns. Requires server-side configuration below; adding the source does not enable it on the hosted endpoint.

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
- Ironman/hardcore `index_lite` endpoints are documented by Jagex but currently return HTTP 404; the tool reports that instead of silently returning normal-mode data.
- Smithery hosts should rebuild the server card after tool changes so the published schema matches this README.

## License

Original software: MIT. Third-party content retains its own licenses and rights; see [Attribution and third-party content](#attribution-and-third-party-content). Unofficial; not affiliated with Jagex or the RuneScape Wiki.
