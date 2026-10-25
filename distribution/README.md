# Directory corrections and native chat submissions

Prepared October 24, 2026. `listing.json` contains copy for the hosted service;
`review-cases.json` contains five positive and three negative chat review cases.
These are proposed cases, not proof of successful Claude or ChatGPT conversations.
`mcp-market-draft.json` preserves the editor fields, and `mcp-so-overview.md`
preserves the replacement overview. Both use the hosted endpoint.

## Correct existing listings

Use the direct endpoint `https://runescape-wiki-mcp.fly.dev/mcp`, Streamable HTTP,
and **no authentication**. No local Node installation is needed for chat clients.
The npm/local option remains available for clients that require stdio.

Replace these inaccurate claims wherever they appear:

| Old claim | Replacement |
| --- | --- |
| Real-time, 5-minute or hourly prices | Jagex guide prices and Weirdgloop daily history; prices lag the live market |
| All game modes | Normal-mode RS3 hiscores; ironman/hardcore currently unsupported |
| `get_latest_prices` | `lookup_item`, then `get_item_price` |
| Arbitrary historical intervals | 7–90 day summaries from daily samples; Jagex historical graph |
| All-item live market scans or automated trading | Read-only lookups, comparisons and hypothetical flip estimates |
| `prices.runescape.wiki/api/v1/rs` | Jagex GE/hiscores, Weirdgloop daily history and RuneScape Wiki |
| Local `/path/to/.../dist/index.js` as the only setup | Hosted endpoint with no authentication |
| Smithery proxy endpoint | Direct Fly endpoint; Smithery's proxy retirement is announced for October 31 |

| Destination | Listing or management page | Status at preparation |
| --- | --- | --- |
| MCP Market | https://mcpmarket.com/manage/tool/runescape-wiki | Claimed; corrections drafted, save blocked by temporary GitHub ownership-check failure. Hosted-endpoint listing is a separate paid product; no purchase made. |
| MCP.so | https://mcp.so/servers/runescape-wiki-mcp | Owner edits attempted, including Remote Server type and direct endpoint; changes did not persist after reload, with no visible save error. Public copy remains stale. |
| Smithery | https://smithery.ai/servers/birdwell/runescape-wiki-mcp | Existing listing; description/endpoint still need owner refresh |
| Glama | https://glama.ai/mcp/servers/birdwell/runescape-wiki-mcp | Existing listing; tool scan is not proof of hosted deployment parity |
| Official MCP Registry | https://registry.modelcontextprotocol.io | Existing active records for `io.github.birdwell/runescape-wiki-mcp`; use registry search |
| awesome-mcp-servers | https://github.com/punkpeye/awesome-mcp-servers | Existing repository entry |
| FindMCP | https://findmcp.app/servers/runescape-wiki-mcp | Stale syndicated copy; refresh still needed |
| PulseMCP / MCPServers.org | Their directories | Presence not confirmed; do not claim a listing without its public URL |

## Verify before submitting

Run `node distribution/preflight.mjs > /tmp/rs3-preflight.json`. This makes a small
set of read-only requests to production. It checks the current 13-tool contract,
annotations, name resolution, price/history, comparison, tax arithmetic, public
hiscores, wiki search/content and invalid input. It exits nonzero on any failure;
keep failures visible rather than substituting local behavior for production.

The October 24 production check found only 12 tools: `search_wiki` was missing.
The repository already defines that tool. Claude connected to the direct Fly URL
with no sign-in and detected 12 read-only tools, 4 prompts and 2 resources. Its
directory scanner suggested adding `annotations.title` for each tool; this change
adds that compatibility metadata alongside the existing top-level titles.
Deploy the reviewed current server
through the normal release process, then rerun preflight before review. This kit
does not deploy the server or authorize a release.

After transport checks pass, install the hosted endpoint in a fresh Claude and
ChatGPT conversation. Run all eight review prompts in each client, record the
actual tools/results and date, and verify the refusal/clarification behavior.
Do not use fixed live prices or ranks as acceptance criteria. The explicit flip
example is deterministic: 10 × (120 − 100 − floor(120 × 0.02)) = 180 coins.

## Claude

Open https://claude.ai/directory/manage/new with the publishing account. Use the
single-MCP connector path and the fields in `listing.json`; no OAuth credentials
or reviewer game account are needed. Inspect the actual scanned tool set and fix
any findings. The public directory submission remains pending until the test
results and required metadata are complete. Approval and publication are separate.
Do not assume the OpenAI ZIP format is a Claude submission format.

The direct Fly connector was added to the publishing account on October 24.
The existing separate Smithery connector was left in place; its proxy URL should
not be selected for this submission. A connection scan is not a completed chat
test or public directory approval.

The Claude draft has its listing copy, categories (Media & Entertainment and
Data & Analytics), use cases and public support/docs links filled. A published
privacy URL is required before the Listing step validates. The publisher selected
by the maintainer is **Birdwell Labs**, recorded in `submission-config.json`.
The company website is https://birdwellabs.com. Data-handling review, real-client
testing and compliance acknowledgments remain.
The form warns that uncontrolled third-party API wrappers are typically not
accepted. The draft accurately identifies our use of third-party APIs; it does
not claim Jagex/Wiki ownership or a partnership. Include evidence of legitimate
API use for review before representing the connector as eligible for publication.

## ChatGPT

Current instructions use an Agent Plugins ZIP and the publishing dashboard at
https://platform.openai.com/plugins. The builder follows the documented portable
`plugin.json` / `mcp.json` layout, includes the review cases and an original square
SVG icon, and contains no credentials, hooks or local execution.

Run `node distribution/build-plugin.mjs --draft` to create a fresh ZIP in the
system temporary directory; the command prints its exact path. This is an incomplete review draft:
do not upload it as a finished submission. Its plugin version is independent of
the npm/server version.

Before creating the final ZIP, complete `distribution/submission-config.json`
with the following **real, reviewed values**, not placeholder URLs. Birdwell Labs
is the selected publisher; the publishing platform still needs to verify that identity:

```json
{
  "developerName": "Birdwell Labs",
  "publisherURL": "https://birdwellabs.com",
  "category": "an applicable category selected in the dashboard",
  "privacyPolicyURL": "the published HTTPS privacy policy URL",
  "termsOfServiceURL": "the published HTTPS terms URL",
  "demo_recording_url": "a reviewer-accessible HTTPS demo recording URL"
}
```

Then run `node distribution/build-plugin.mjs`. It refuses to build without those
fields. A completed ZIP is still subject to domain verification, tool scans,
successful chat tests and the publisher's review of policy attestations. It does
not submit or publish anything automatically.

Host the exact domain-verification token provided by OpenAI at the challenge URL
shown in its dashboard. Do not invent a token, reuse another plugin's challenge,
or replace a verification file owned by another app.

## Policy and demo work still required

The repo currently has no published privacy or terms pages. Before writing public
commitments, verify production Fly logging, Sentry configuration/retention, and
whether opt-in PostHog analytics has actually been enabled. API requests include
the item, wiki or public player identifier needed by the relevant upstream;
infrastructure can receive connection metadata. Do not promise "no data stored"
or a retention period that has not been checked. Analytics PR #25 is separate
from this kit and is not evidence of production analytics configuration.

A basic privacy page for the company website and RuneScape MCP is prepared in
https://github.com/birdwell/birdwell-labs/pull/2. Its proposed URL is
https://birdwellabs.com/privacy. Leave `privacyPolicyURL` unset until the website
change is approved, deployed and checked. Terms of service still need separate
preparation.

Read-only Fly secret-name inspection on October 24 found `SENTRY_DSN` and
`SENTRY_ENVIRONMENT`, and no PostHog secret names. Values were not read. This
confirms configured Sentry secret names, not retention settings or every possible
runtime configuration source.

Record the demo in the real chat client after the install and transport checks
pass: show setup, the five positive prompts, and the three negative prompts.
Use public/sample game data and exclude account details, keys and private chats.
Verify the recording URL works for reviewers without a private account.

## Sources checked October 24, 2026

- OpenAI submission, packaging and review fields: https://developers.openai.com/plugins/deploy/submission
- OpenAI remote MCP review requirements: https://developers.openai.com/plugins/deploy/app-review
- Portable manifest schema: https://agent-plugins.org/schemas/1.0.0/plugin.schema.json
- Claude submission flow: https://claude.com/resources/articles/build-plugins-for-claude
- Claude connector criteria and API ownership: https://claude.com/docs/connectors/building/review-criteria
- Smithery proxy retirement: https://smithery.ai/future

Requirements and directory status can change; recheck them at submission time.
