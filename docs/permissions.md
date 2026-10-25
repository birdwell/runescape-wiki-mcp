# Source review and outstanding permissions

Reviewed October 24, 2026. This is an implementation and evidence record, not a legal opinion or a provider approval. Changes in this branch still require release or deployment to reach users.

## What comparable projects actually document

| Project / source | Documented evidence | What we can learn |
| --- | --- | --- |
| [RuneLite's own FAQ](https://github.com/runelite/runelite/wiki/FAQ#will-using-runelite-get-me-banned) | Reports explicit Jagex approval and describes review of contributed code. | Keep a reviewable implementation and obtain approval for our own scope. Its OSRS client approval does not cover this RS3 service. |
| [RuneScape Wiki's 2018 launch announcement](https://runescape.wiki/w/Forum:Leaving_Wikia#Who_is_running_the_wiki?_How_much_are_Jagex_involved?) | Describes negotiations and a signed trademark agreement, with domain provisions in its contract summary. This is historical evidence, not verification of the current contract. | A game-branded domain can require its own agreement; the Wiki's arrangement is not transferable to us. |
| [Alt1's developer site](https://runeapps.org/alt1) | Explains screen-based access and its intended separation from botting. | Describe technical boundaries concretely. The developer's statement is not an approval letter for our project or proof of a transferable licence. |
| [Weird Gloop API documentation](https://api.weirdgloop.org/) | Explicitly describes use by third-party tools and directs API questions to its Discord's `#wiki-tech` channel. | This is relevant evidence for the documented exchange API, not blanket permission for all wiki automation or every downstream use. |

Our inference is that a precise technical description, accountable publisher and project-specific written confirmation are more useful than copying another project's disclaimer. These sources do not establish approval odds or prove which factors caused an approval.

## Scope verified in this repository

Birdwell Labs maintains an independent RS3 MCP server for public API lookups and calculations. It does not connect to the game client, collect Jagex login credentials, control characters or place trades. Tool results are sent to the requesting AI client for use in its answers. That client has separate data-handling terms. The server contains no model-training pipeline; this does not establish how an external AI provider handles results.

| Data / operation | Upstream and handling | Permission status / next evidence |
| --- | --- | --- |
| Guide prices, catalogue entries, examine text and price graphs | Jagex Grand Exchange API, `secure.runescape.com/m=itemdb_rs/api`. Responses can include third-party text and image URLs; MIT does not relicense them. | Confirm automated access, redistribution and AI-client use with Jagex. Do not infer permission from an endpoint working. |
| Player stats | Jagex public hiscores lite endpoint. The requested player name goes to Jagex, and the result goes to the requesting client. | Include public-player-data handling in the request. Do not imply access to private account information. |
| Daily price history and item lookup | Weird Gloop exchange history API. Its documentation supports third-party tools. | Confirm our hosted request pattern and downstream AI/commercial contexts where unclear. Do not interpret the documentation's software licence as a blanket licence for every data field. |
| RS3 reported transactions and numeric item mapping | Opt-in RS3 API v2 from `prices.runescape.wiki/api/v2/rs`. Quotes cache 30 seconds and numeric mapping 10 minutes per process; no mapping prose/media is exposed. | Its [API documentation](https://runescape.wiki/w/RuneScape:Real-time_Prices) expressly supports third-party projects within reasonable usage and requires an identifying User-Agent. This is endpoint-specific evidence, not blanket approval of the project or other Wiki content. |
| Wiki title search and item-name fallback | RuneScape Wiki MediaWiki API. Search returns titles/links without article snippets; item fallback uses opensearch titles. | Clarify consent for these automated requests with Weird Gloop. Returning links still involves API traffic. |
| Structured monster/quest index facts | Fixed title-filtered Bucket queries, capped at 11 indexed rows to return at most 10 variants. Only numeric/Boolean facts, controlled quest labels, dates and page references are exposed. | No article-text review or blanket data license is inferred. MediaWiki request consent remains an endpoint/use-case question; this does not enable narrative extraction. |
| Wiki article text | Empty review manifest by default. Text requires an exact reviewed title, main namespace, revision and extract hash; otherwise only a link is returned. | For each proposed extract, review the actual licence and imported material, preserve notices, and resolve intended downstream uses before enabling it. |
| Name and proposed domain | `runescapemcp.com` has been purchased by the maintainer. This review does not activate it or change the canonical endpoint. | Ask Jagex explicitly about the project name and domain. No approval is claimed. |

The code supplies an identifying User-Agent. Node HTTP and Worker entry points have an in-memory client request budget, defaulting to 60 requests per minute per client key and running server instance, configurable with `RATE_LIMIT_PER_MINUTE`. This is not a verified production setting or a global upstream limit. A tool call can generate several upstream requests. Smithery and stdio do not use those HTTP entry-point budgets. Catalog cache hints do not constitute an upstream data cache. Shared upstream caching, backoff and aggregate request budgets remain work to assess before promising a provider a particular load ceiling.

Optional Sentry instrumentation can receive request context. `DEBUG` logging can print tool arguments and returned data. Do not claim anonymous-only telemetry, zero retention or provider-wide training exclusions without verifying the actual deployment and contracts. See the [privacy policy](https://birdwellabs.com/privacy).

## Applicable policies and remaining decisions

- [Jagex Fan Content Policy](https://legal.jagex.com/docs/policies/fan-content-policy), sections 2.4, 6.1.3, 8 and 14–16: trademarks, companion-app restrictions, attribution and permission routes are separate issues. A free service and attribution do not establish authorization. Request scope-specific clarification rather than declaring compliance.
- [Weird Gloop terms](https://weirdgloop.org/terms/): automation without prior consent is restricted. Reconcile this with the exchange API's documented third-party use; seek clarification for MediaWiki requests and the hosted AI use case.
- [Wiki licensing](https://meta.weirdgloop.org/w/Licensing): check content and revision-specific terms. Article/history links identify contributors; preserve applicable licence and copyright notices. Do not treat all wiki content or media as MIT.
- [Creative Commons attribution guidance](https://wiki.creativecommons.org/wiki/Best_practices_for_attribution): identify title, author, source and licence, and explain changes. Our reviewed-extract format includes those fields. Do not assume free access or use within a paid AI client settles noncommercial restrictions.

Before describing the project as approved, record the granting party, written decision, date, covered endpoints/content, domain/name, AI-client uses, commercial conditions and any expiry or revocation terms. Link a public statement only with permission; keep private correspondence outside the repository. Silence, directory acceptance and other tools' permissions are not approval evidence.

Reassess before adding game assets, authenticated account access, gameplay automation, bulk article copying or monetization. Do not offer a provider commitments about pricing, future functionality or domain transfer without the maintainer agreeing to them.

## Contacts and preparation

[Official Jagex contacts](https://legal.jagex.com/docs/contact-us) list `ip@jagex.com` for intellectual-property questions and `whois@jagex.com` for domains, plus a commercial licensing application route. Weird Gloop's API documentation lists `#wiki-tech` on its Discord for API questions. Start with clarification of this specific service, not a claim to be an official partner.

[Unsent request drafts](permission-requests.md) describe the existing service and separate the requested permissions. Confirm the current business model, live behavior and measured traffic before sending. No request has been sent as part of this documentation work.

For support or rights concerns, contact [support@birdwellabs.com](mailto:support@birdwellabs.com), including the affected URL or tool, content/source, concern and requested correction. Do not post credentials or private correspondence in public issues.
