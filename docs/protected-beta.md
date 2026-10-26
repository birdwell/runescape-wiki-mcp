# Protected RuneScape planner beta

The beta runs separately from the public wiki MCP at `https://runescape-agent-beta.fly.dev/mcp`.
All routes require an invite bearer token except `GET /health`. There is no account
password or RuneScape login. The planner reads public account data and makes recommendations.

The protected beta requires Node.js 22.13+ with `node:sqlite` support. The public
server continues to support Node 20 and does not load SQLite when beta is disabled.

## Limits

Each user gets $0.25 of Jev reservations per UTC day. The whole beta has a $1 daily
limit and a $5 cumulative limit, plus 20 plans per user and 60 globally per day.
One plan per user and two globally can run simultaneously. Limits apply to
authenticated principals, independent of caller-controlled forwarding headers.

Before every provider attempt, including quest batches, a SQLite transaction
reserves $0.003. Failed calls retain their full reservation and are not retried.
This is deliberately conservative: the pinned `jev-1.14.0` model has a 64k input
context, costs $0.042 per million input tokens, and has free output according to
[TypeSafe's model documentation](https://docs.typesafe.ai/models), checked on
2026-10-25. Reservations are allowances rather than actual provider invoices.
Unexpected returned models or input counts above 65,536 pause further spending
persistently until operator review. Pricing changes require reviewing this policy.
Fly compute, storage, bandwidth and any other use of the same TypeSafe API key
are outside these limits. Prefer a dedicated provider key for the beta.

The persistent ledger contains principal IDs, UTC days, reserved amounts, call
counts and short-lived plan leases. It does not store usernames, goals, quest
journals or model responses. Debug account logging is prohibited in beta mode.
`GET /beta/usage`, with the same bearer token, returns the caller's usage and the
global budget totals. A limit rejection is an MCP tool error before the next
paid call; a plan can stop midway if it reaches a limit.

## Deploy and connect

1. Create the separate Fly app and one encrypted 1 GB `beta_data` volume in `dfw`.
2. Set `TYPESAFE_API_KEY` in the shell or ignored `.env.local`, then run
   `node scripts/configure-beta.mjs`. It stages the provider key and token hashes
   via stdin and writes private client credentials in ignored `.cache/beta/`.
   Existing credentials are reused. The `budget-check` principal has a zero
   allowance for exercising budget rejection without paid calls.
3. Run the test suite and `npm run build`. Deploy with
   `flyctl deploy --config fly.beta.toml --ha=false --strategy immediate`.
4. Verify exactly one machine and one volume. Use `.cache/beta/mcp.json` for clients
   supporting HTTP MCP config, or copy `.cache/beta/codex.toml` into your Codex MCP
   configuration. These files contain secrets; do not paste them in issues or chats.

Run `node scripts/smoke-beta.mjs --username "ACCOUNT"` against the deployed beta.
Add `--local` to test through a temporary authenticated local HTTP server. These
are real, budgeted Jev calls. Full account results remain in ignored local smoke
artifacts; do not publish them with the PR's generic validation summary.

Run exactly **one machine with one persistent volume**. Fly volumes are not a
replicated database. Do not scale out, clone the ledger, restore older budget
snapshots, change ledger paths, or delete its initialization marker. Those actions
can invalidate cumulative accounting. A missing or emptied initialized database,
unavailable database, or missing Fly `/data` mount fails closed. Hardware failure
can cause downtime. Use a shared transactional database before adding replicas.

For token rotation, keep the principal ID unchanged so its existing usage still
counts. Replace its SHA-256 digest in `RS3_BETA_TOKENS_JSON` and redeploy. Remove a
principal's digest to revoke access. Never copy the provider API key into clients.
Keep private credential files backed up outside the task checkout before cleanup.

Stop the beta machine or revoke its bearer credentials to pause access. Preserve
the volume and ledger. Rollbacks must retain the auth/budget guards, persistent
mount and pinned model; do not deploy an older public-only server with beta secrets.
