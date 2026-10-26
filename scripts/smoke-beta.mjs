// Live, bounded smoke test. --local keeps the provider key on this computer.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const local = process.argv.includes('--local');
const directory = resolve('.cache/beta');
mkdirSync(directory, { recursive: true, mode: 0o700 });
chmodSync(directory, 0o700);
let app;
let base;
let credentials;
if (local) {
    if (existsSync('.env.local')) process.loadEnvFile('.env.local');
    const { configureBeta, BETA_MODEL } = await import('../dist/beta.js');
    const { createHttpServer } = await import('../dist/httpApp.js');
    credentials = { ownerToken: randomBytes(32).toString('base64url'), budgetCheckToken: randomBytes(32).toString('base64url') };
    const digest = token => createHash('sha256').update(token).digest('hex');
    const ledgerDirectory = resolve(directory, 'local-ledger');
    mkdirSync(ledgerDirectory, { recursive: true, mode: 0o700 });
    Object.assign(process.env, { RS3_BETA_ENABLED: 'true', RUNESCAPE_RECOMMENDATIONS_ENABLED: 'true',
        TYPESAFE_MODEL: BETA_MODEL, DEBUG: 'false', RS3_BETA_LEDGER_PATH: resolve(ledgerDirectory, 'usage.sqlite'),
        RS3_BETA_TOKENS_JSON: JSON.stringify([
            { id: 'owner', sha256: digest(credentials.ownerToken) },
            { id: 'budget-check', sha256: digest(credentials.budgetCheckToken), dailyMicros: 0 },
        ]) });
    app = createHttpServer(configureBeta());
    await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${app.server.address().port}`;
} else {
    credentials = JSON.parse(readFileSync(resolve(directory, 'credentials.json'), 'utf8'));
    const config = JSON.parse(readFileSync(resolve(directory, 'mcp.json'), 'utf8'));
    base = new URL(config.mcpServers.runescape_beta.url).origin;
}
const headers = token => ({ authorization: `Bearer ${token}` });
let nextId = 0;
async function rpc(method, params, token = credentials.ownerToken) {
    const response = await fetch(`${base}/mcp`, { method: 'POST',
        headers: { ...headers(token), 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++nextId, method, params }), signal: AbortSignal.timeout(360_000) });
    assert.equal(response.status, 200);
    const text = await response.text();
    const data = text.split('\n').find(line => line.startsWith('data: '))?.slice(6) ?? text;
    const message = JSON.parse(data);
    assert.equal(message.error, undefined, 'MCP protocol error');
    return message.result;
}
async function usage(token = credentials.ownerToken) {
    const response = await fetch(`${base}/beta/usage`, { headers: headers(token) });
    assert.equal(response.status, 200);
    return response.json();
}
const artifacts = { mode: local ? 'local HTTP beta' : 'deployed HTTP beta', base, testedAt: new Date().toISOString() };
try {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    for (const path of ['/', '/mcp', '/beta/usage', '/.well-known/mcp/server-card.json']) {
        assert.equal((await fetch(base + path)).status, 401);
    }
    assert.equal((await fetch(`${base}/mcp`, { headers: headers(randomBytes(32).toString('base64url')) })).status, 401);
    const tools = await rpc('tools/list', {});
    assert.ok(tools.tools.some(tool => tool.name === 'recommend_next_activity'));
    const blocked = await rpc('tools/call', { name: 'recommend_next_activity', arguments: {
        goal: 'Train Mining to 70', goalType: 'skill_training', targetSkill: 'Mining', targetLevel: 70, context: { username: 'killua 34' },
    } }, credentials.budgetCheckToken);
    assert.equal(blocked.isError, true);
    assert.match(JSON.stringify(blocked), /spending limit reached/);
    assert.equal((await usage(credentials.budgetCheckToken)).userJevCallsToday, 0);
    console.log('Auth, discovery, and zero-budget rejection passed.');
    const journal = await rpc('tools/call', { name: 'get_player_quests', arguments: { username: 'killua 34' } });
    assert.ok(!journal.isError, 'Public account journal failed');
    artifacts.journal = journal.structuredContent;
    console.log('killua 34 public quest journal fetched.');
    artifacts.plans = [];
    for (const goal of [
        { goal: 'Train Mining to level 70', goalType: 'skill_training', targetSkill: 'Mining', targetLevel: 70 },
        { goal: 'Unlock Invention', goalType: 'unlock_progression', unlock: 'Invention' },
        { goal: 'What is the best Mining quest for me?', goalType: 'quests', targetSkill: 'Mining' },
    ]) {
        const result = await rpc('tools/call', { name: 'recommend_next_activity', arguments: { ...goal, context: { username: 'killua 34' } } });
        assert.ok(!result.isError, JSON.stringify(result));
        const plan = result.structuredContent;
        assert.ok(plan && ['recommended', 'needs_context', 'no_match', 'goal_met'].includes(plan.status));
        artifacts.plans.push(plan);
        console.log(JSON.stringify({ goal: goal.goal, status: plan.status, next: plan.recommendation?.title,
            nextStep: plan.recommendation?.nextStep, usage: plan.usage }));
    }
    artifacts.budget = await usage();
    console.log(JSON.stringify({ budget: artifacts.budget }));
} finally {
    const path = resolve(directory, local ? 'local-smoke.json' : 'deployed-smoke.json');
    writeFileSync(path, JSON.stringify(artifacts, null, 2) + '\n', { mode: 0o600 });
    chmodSync(path, 0o600);
    await app?.close();
}
