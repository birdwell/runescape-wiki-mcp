# Usage analytics

Use the dedicated **RuneScape Wiki MCP** PostHog project. Existing Sentry instrumentation
continues to handle errors and traces. These counters measure service activity, not people.

The [usage dashboard](https://us.posthog.com/project/685914/dashboard/2255173) has seven
saved charts in project **685914**, using UTC. Their definitions are recorded in
[`analytics-dashboard.json`](analytics-dashboard.json). Download history is imported;
production service charts stay empty until the instrumented server is deployed.
Development smoke events were verified separately and are excluded from these charts.

## Enable on the hosted Node server

Set these environment variables on Fly, using the project's public ingestion key from
PostHog project settings. Do not use a personal API key. Use the ingestion host shown in
the project's setup page, especially for EU projects.

```dotenv
POSTHOG_ENABLED=true
POSTHOG_PROJECT_KEY=<project ingestion key>
POSTHOG_HOST=https://us.i.posthog.com
POSTHOG_ENVIRONMENT=production
```

Configure the key through Fly's secrets UI or a protected `fly secrets import` input.
Do not put it in source, chat, command-line arguments, or logs. Set the same key as the
GitHub Actions repository secret `POSTHOG_PROJECT_KEY`. For EU ingestion, also set the
repository variable `POSTHOG_HOST=https://eu.i.posthog.com`.

The HTTP entry initializes analytics once per process. Tool and upstream events are
batched every 5 seconds or 20 events. SIGTERM/SIGINT drains the batch on normal HTTP
shutdown. The in-memory queue is bounded to 1,000 events; delivery timeouts, process
crashes, queue overflow, and provider limits can lose events. These are usage analytics,
not billing or audit counters. Abrupt Fly stops may lose the last batch.

For local HTTP verification with an ignored `.env.local` configuration:

```sh
bun run build
node --env-file=.env.local dist/http.js
```

Node does not load `.env.local` automatically. Keep `POSTHOG_ENVIRONMENT=development`
for local verification. No production configuration or deployment is implied by a local run.

The stdio entry stays off even with hosted credentials. Local users must additionally
set `POSTHOG_STDIO_ENABLED=true` to opt in. No keys are embedded in the npm package.
The Smithery factory and Cloudflare Worker entry do not initialize this Node integration;
their traffic is not included. Server schema and tool descriptions are unchanged.

The custom tool event is namespaced `rs_mcp_tool_call` to avoid PostHog's legacy
`mcp_tool_call` catalog name. It uses our explicit event contract, not PostHog's native
`$mcp_tool_call` integration schema.

## Event contract

| Event | Count represents | Properties |
| --- | --- | --- |
| `mcp_http_request` | One finished or aborted request to `/mcp` or `/mcp/` | `request_id`, `method`, `route`, `status_code`, `outcome`, `duration_ms` |
| `rs_mcp_tool_call` | One tool invocation that reaches the shared handler | `request_id` when HTTP, `tool_call_id`, `tool_name`, `success`, `duration_ms` |
| `upstream_api_call` | One actual fetch through the shared JSON/text API helpers | `request_id` and tool context when applicable, `provider`, `status_code` when a response exists, `success`, `duration_ms`, `error_kind` on failure |
| `npm_downloads_daily` | One aggregate npm download record for a UTC day | `package`, `day`, `downloads`, `source` |

Live service events also include `service`, `service_version`, `environment`, and `transport`.
Provider values are `jagex_ge`, `jagex_hiscores`, `weirdgloop`, `runescape_wiki`, or `other`.
API duration includes response parsing. Failed requests and failed parsing are counted.
Tool failures include thrown errors and responses with `isError: true`. Unknown tool names
are normalized to `unknown` if they reach the handler. Requests rejected by the MCP SDK
before the handler appear only in the HTTP count.

HTTP counts exclude homepages, discovery documents, `/health`, and unrelated routes.
They include protocol discovery calls sent to `/mcp`, rejected requests, and rate limits.
Count `outcome=finished` to exclude interrupted responses. A successful HTTP status alone
does not mean the tool succeeded; use the tool event's `success` property.

We send no tool arguments/results, player names, searches, raw URLs, IPs, client headers,
or error messages. Random IDs correlate requests and tool calls, not users or installations.
All service events use a shared service identity, with person profiles and GeoIP disabled.
Never interpret PostHog unique-user or retention charts as actual users for these events.

## Dashboard

Create a dashboard named **RuneScape Wiki MCP usage**. Use daily intervals over the last
30 days. Filter service charts to `environment=production` and `transport=http`. Keep
development/smoke events out. Use UTC for parity with npm's daily buckets, or show the
npm chart separately if the project uses America/Chicago.

| Chart | Event | Aggregation | Breakdown/filter |
| --- | --- | --- | --- |
| Tool calls per day | `rs_mcp_tool_call` | Total count | `tool_name` |
| Failed tool calls per day | `rs_mcp_tool_call` | Total count | `success=false`, breakdown `tool_name` |
| Upstream API calls per day | `upstream_api_call` | Total count | `provider` |
| Failed API calls per day | `upstream_api_call` | Total count | `success=false`, breakdown `provider` |
| Hosted requests per day | `mcp_http_request` | Total count | `outcome=finished`, breakdown `status_code` |
| Tool latency | `rs_mcp_tool_call` | 95th percentile of `duration_ms` | `tool_name` |
| npm downloads per day | `npm_downloads_daily` | Sum of `downloads` | `package=runescape-wiki-mcp`, no transport filter |

For npm, the number of events is the number of imported days. **Sum the `downloads`
property** to get downloads. This does not identify installs or people, and hosted users
do not need npm downloads. Local installations without explicit telemetry are unobservable.

## Download collection

The GitHub workflow runs at 09:00 UTC daily after this change lands on the default branch.
It imports the UTC day from two days earlier to allow time for npm to publish totals.
It fails visibly when credentials are missing or ingestion fails. It has not run merely
because the workflow file exists locally.

Preview data without PostHog credentials or ingestion:

```sh
bun run analytics:downloads --dry-run last-month
```

Backfill using environment variables supplied securely by your shell or secret manager:

```sh
bun run analytics:downloads last-month
# Or an explicit range:
bun run analytics:downloads 2026-10-01:2026-10-22
```

Workflow dispatch accepts the same range in its optional `period` input. Each package/day
uses a deterministic UUID and timestamp for retry deduplication. Deduplication may be
eventually consistent. npm can revise historical figures; imports do not update an
already-ingested day's value. The public npm API remains the authority for corrections.

## Verify activation

1. Deploy the tested build with the production environment configuration.
2. Use an MCP client to call `get_all_categories`, then `get_ge_info`.
3. In PostHog Activity, confirm tool events for both, an upstream event for `get_ge_info`,
   and HTTP events. The category table is local and should generate no upstream call.
4. Confirm corresponding request/tool IDs and the absence of names, arguments, URLs, and results.
5. Dispatch the download workflow and confirm a daily record with the expected numeric
   `downloads` total. Normal collection starts after the workflow is merged and configured.

Reference: [PostHog Node SDK](https://posthog.com/docs/libraries/node),
[event deduplication](https://posthog.com/docs/data/events#event-deduplication),
[npm download API](https://github.com/npm/registry/blob/main/docs/download-counts.md).
