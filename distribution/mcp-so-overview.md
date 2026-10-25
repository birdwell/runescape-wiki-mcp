## RuneScape Wiki MCP

Ask your assistant about RuneScape 3 guide prices, daily trends, public RS3 hiscores and wiki pages. All tools are read-only. Maintained independently by Birdwell Labs; unaffiliated with Jagex or the RuneScape Wiki. No Jagex or Weird Gloop approval is claimed.

## Connect in Claude or ChatGPT

Add a remote MCP server with this URL:

https://runescape-wiki-mcp.fly.dev/mcp

Use Streamable HTTP and no authentication. No API key, game login or local installation is needed. Follow the setup guidance at https://runescape-wiki-mcp.fly.dev or the repository README.

## Examples

- What is the RS3 guide price of an Abyssal whip?
- Compare Dragon bones and Frost dragon bones.
- Summarize the past 7 days of Abyssal whip prices.
- Estimate profit on 10 Dragon bones bought for 100 coins and sold for 120 coins each, after tax.
- Look up Zezima’s normal-mode RS3 hiscores.

## Tools

| Tool | Purpose |
| --- | --- |
| lookup_item | Resolve an item name to an ID, price and volume |
| get_item_price | Read a Grand Exchange guide price and trends |
| get_item_graph | Read Jagex historical price graph data |
| summarize_price_history | Summarize 7–90 days of daily price history |
| compare_items | Compare up to ten items |
| estimate_flip | Estimate hypothetical profit after the 2% seller tax |
| get_player_stats | Read public normal-mode RS3 hiscores |
| search_wiki | Find RuneScape Wiki titles and source links |
| get_wiki_page_content | Return a source link; text requires a reviewed revision and matching hash |
| browse_items | Browse the Grand Exchange catalogue by category |
| get_all_categories | List category IDs |
| get_category_info | Read category metadata |
| get_ge_info | Read Grand Exchange database metadata |

## Data sources and limitations

Sources are the Jagex Grand Exchange API, Jagex public RS3 hiscores, Weirdgloop daily history, and the RuneScape Wiki. Prices lag the live market. This server does not provide real-time bid/ask quotes or 5-minute/hourly price feeds, and it cannot place offers or execute trades. Flip results are estimates without guaranteed fills or profit.

RS3 only. Old School RuneScape is not supported. Historical coverage depends on upstream availability.

## Attribution and data handling

Jagex supplies Grand Exchange data and public hiscores. Weird Gloop supplies daily exchange history; wiki contributors retain their article rights. Wiki pages return links by default. Reviewed text includes source/history links and its applicable licence and notices. The project's MIT licence covers its original software, not third-party content or trademarks.

This server does not connect to the game client or request Jagex credentials. A player-name lookup sends the supplied name to Jagex. Your assistant receives tool results under its provider's own data-handling terms. Privacy: https://birdwellabs.com/privacy. Source review: https://github.com/birdwell/runescape-wiki-mcp/blob/main/docs/permissions.md.

## Support

Contact support@birdwellabs.com for support or rights concerns, or report technical problems at https://github.com/birdwell/runescape-wiki-mcp/issues. Local stdio installation is also documented in the repository for clients that require it.
