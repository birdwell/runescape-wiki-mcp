import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { BetaLedger, ProtectedBeta } from '../src/beta.js';
import { createHttpServer } from '../src/httpApp.js';

let directory: string;
let app: ReturnType<typeof createHttpServer>;
let base: string;
const token = randomBytes(32).toString('base64url');
const exhausted = randomBytes(32).toString('base64url');
const principal = (id: string, credential: string, dailyMicros?: number) => ({ id,
    sha256: createHash('sha256').update(credential).digest('hex'), dailyMicros });

beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'rs3-beta-http-'));
    const beta = new ProtectedBeta(new BetaLedger(join(directory, 'usage.sqlite')), [
        principal('owner', token), principal('exhausted', exhausted, 0),
    ]);
    app = createHttpServer(beta);
    await new Promise<void>((resolve, reject) => {
        app.server.once('error', reject);
        app.server.listen(0, '127.0.0.1', resolve);
    });
    base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
afterEach(async () => {
    await app.close();
    rmSync(directory, { recursive: true });
});

async function rpc(method: string, params: object, credential = token) {
    const response = await fetch(`${base}/mcp`, { method: 'POST',
        headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const body = await response.text();
    const payload = body.split('\n').find(line => line.startsWith('data: '))?.slice(6) ?? body;
    return { response, message: JSON.parse(payload) };
}

test('all beta content requires authentication except the minimal health check', async () => {
    for (const path of ['/', '/mcp', '/.well-known/mcp/server-card.json', '/beta/usage']) {
        const response = await fetch(base + path);
        expect(response.status).toBe(401);
        expect(response.headers.get('www-authenticate')).toContain('Bearer');
        expect(await response.text()).not.toContain('TYPESAFE');
    }
    expect((await fetch(`${base}/health`)).status).toBe(200);
    const bad = await rpc('tools/list', {}, randomBytes(32).toString('base64url'));
    expect(bad.response.status).toBe(401);
    const valid = await rpc('tools/list', {});
    expect(valid.response.status).toBe(200);
    expect(valid.message.result.tools.some((tool: { name: string }) => tool.name === 'recommend_next_activity')).toBe(true);
});

test('HTTP planner preserves authenticated context and rejects exhausted budgets before upstream work', async () => {
    const result = await rpc('tools/call', { name: 'recommend_next_activity', arguments: {
        goal: 'Train Mining to 70', goalType: 'skill_training', targetSkill: 'Mining', targetLevel: 70,
        context: { username: 'Example RS3' },
    } }, exhausted);
    expect(result.response.status).toBe(200);
    expect(result.message.result.isError).toBe(true);
    expect(JSON.stringify(result.message)).toContain('spending limit reached');
    const response = await fetch(`${base}/beta/usage`, { headers: { authorization: `Bearer ${exhausted}` } });
    const usage = await response.json() as { userJevCallsToday: number; userPlansToday: number };
    expect(usage.userJevCallsToday).toBe(0);
    expect(usage.userPlansToday).toBe(0);
    expect(response.headers.get('cache-control')).toBe('no-store');
});
