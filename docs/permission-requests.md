# Provider request drafts

Unsent drafts prepared October 24, 2026. These are not approval records. Review the business model, deployed version, measured request volume and available controls before sending; do not claim pending code is already live. No future commercial model or domain-transfer condition is agreed by these drafts.

## Jagex project and domain clarification

Suggested recipient: `ip@jagex.com`. Jagex separately lists `whois@jagex.com` for domain questions; ask whether the domain question should be routed there. Source: [official contact page](https://legal.jagex.com/docs/contact-us).

Subject: Permission clarification for Birdwell Labs' independent RuneScape 3 data helper

Hello Jagex IP team,

I'm Josh Birdwell, maintaining RuneScape Wiki MCP through Birdwell Labs. It is an independent, open-source tool that lets a user ask an AI assistant such as Claude or ChatGPT about RS3 guide prices, price history, public hiscores and wiki source references.

The tool reads public APIs and performs calculations. It does not connect to the game client, request Jagex credentials, control characters or execute trades. A supplied player name goes to the public hiscores endpoint. API results return to the requesting AI client, which may use them to generate an answer under its own provider terms. This is an AI integration, not a Jagex product or an official partnership.

Could you clarify whether this scope is permitted, or what written permission and conditions you would require for:

1. Automated access to the public RS3 Grand Exchange and hiscores endpoints and delivery of their results, including examine text and other response fields, to AI clients.
2. Descriptive use of RuneScape in the project/package name and public listing.
3. Use of `runescapemcp.com`, which I purchased and would like to use for this service. I can use a Birdwell Labs address if the game-branded domain is not acceptable.
4. Any restrictions relating to AI-generated answers, paid AI clients, or future monetization that should be resolved separately.

Repository: https://github.com/birdwell/runescape-wiki-mcp
Current endpoint: https://runescape-wiki-mcp.fly.dev/mcp
Publisher: https://birdwellabs.com
Privacy: https://birdwellabs.com/privacy
Support: support@birdwellabs.com

The repository documents source attribution and outstanding permissions. Its wiki implementation returns links unless a specific revision and extract have been reviewed. I can provide a short demo, endpoint inventory and measured traffic. Please let me know which technical or branding changes would make this acceptable; I am not requesting that you endorse the project.

Thank you,
Josh Birdwell
Birdwell Labs

Before sending: add the actual current pricing/advertising/donation model, current traffic and deployed commit. Include screenshots showing the unofficial notice and a representative tool response. Do not substitute estimates presented as measurements.

## Weird Gloop API and wiki clarification

Suggested starting point: the `#wiki-tech` channel identified in the [API documentation](https://api.weirdgloop.org/). Confirm the right recipient for licensing questions before sending a longer request.

Hello Weird Gloop team,

I'm Josh Birdwell from Birdwell Labs. Our independent RuneScape Wiki MCP server lets a user request RS3 price/history data and wiki references through an AI assistant. We are not affiliated with Weird Gloop or Jagex.

We use the exchange history API for item lookup and prices, and the MediaWiki API for title search, item-name fallback and page metadata. The wiki implementation returns links by default. Text requires a review of a particular revision, licence, copyright notices and exact extract hash; the manifest currently contains no approved live pages. Tool results go to the requesting AI client and may inform generated answers.

Your exchange API documentation describes third-party tool use. Could you confirm which conditions apply to our hosted request pattern, the separate MediaWiki requests, and delivery of results through AI clients? We would also appreciate clarification of the intended noncommercial/share-alike treatment for any future reviewed extracts, including use through paid assistants or in commercial contexts. We do not want to assume the API software licence covers all underlying data or that general third-party API documentation settles wiki automation consent.

Repository: https://github.com/birdwell/runescape-wiki-mcp
Endpoint: https://runescape-wiki-mcp.fly.dev/mcp
User-Agent: RuneScape Wiki MCP Server - github.com/birdwell/runescape-wiki-mcp
Privacy: https://birdwellabs.com/privacy
Contact: support@birdwellabs.com

Please advise the acceptable request budget, caching/backoff expectations, attribution and any separate permission needed. We can provide measured traffic and adapt our implementation before committing to a particular load limit.

Thank you,
Josh Birdwell
Birdwell Labs

Before sending: confirm what is actually deployed and attach measured traffic, current business model and a sample source-attributed response. The repository's client request limiter is not a global upstream limiter; do not present it as one.
