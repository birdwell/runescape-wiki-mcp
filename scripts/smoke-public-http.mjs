// Exercise the built entry with the invoking Node runtime, without provider calls.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const entry = join(root, 'dist/http.js');
// Do not inherit credentials, telemetry, beta settings or Node preload hooks.
const env = { PORT: '0', HOST: '127.0.0.1', NODE_ENV: 'test', RS3_BETA_ENABLED: 'false' };
const child = spawn(process.execPath, [entry], { cwd: root, env, stdio: ['ignore', 'ignore', 'pipe'] });
const exited = once(child, 'exit');
let stderr = '';
try {
    const base = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => finish(new Error(`HTTP startup timed out: ${stderr}`)), 20_000);
        const finish = (error, url) => {
            clearTimeout(timer);
            child.off('error', onError);
            child.off('exit', onExit);
            child.stderr.off('data', onData);
            if (error) reject(error); else resolve(url);
        };
        const onError = error => finish(error);
        const onExit = code => finish(new Error(`HTTP exited before listening (${code}): ${stderr}`));
        const onData = chunk => {
            stderr += chunk;
            const match = /listening on (http:\/\/127\.0\.0\.1:\d+)\/mcp/.exec(stderr);
            if (match) finish(undefined, match[1]);
        };
        child.once('error', onError);
        child.once('exit', onExit);
        child.stderr.on('data', onData);
    });
    const health = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });
    const discovery = await fetch(`${base}/mcp`, {
        method: 'POST', signal: AbortSignal.timeout(5000),
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream',
            'mcp-protocol-version': '2026-07-28', 'mcp-method': 'server/discover' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'server/discover', params: {
            _meta: {
                'io.modelcontextprotocol/protocolVersion': '2026-07-28',
                'io.modelcontextprotocol/clientInfo': { name: 'public-http-smoke', version: '1' },
                'io.modelcontextprotocol/clientCapabilities': {},
            },
        } }),
    });
    const body = await discovery.text();
    assert.equal(discovery.status, 200, body);
    const payload = JSON.parse(/^data: (.+)$/m.exec(body)?.[1] ?? body);
    assert.equal(payload.id, 1);
    assert.equal(payload.error, undefined);
    assert.match(JSON.stringify(payload.result), /runescape-wiki-mcp/);
    assert.match(JSON.stringify(payload.result), /get_player_quests/);
} finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    timer.unref();
    try { await exited; } finally { clearTimeout(timer); }
}

const directory = mkdtempSync(join(tmpdir(), 'rs3-public-http-'));
try {
    // Deferring SQLite must not silently ignore stray protected-beta settings.
    const stray = spawnSync(process.execPath, [entry], { cwd: root,
        env: { ...env, RS3_BETA_LEDGER_PATH: join(directory, 'usage.sqlite') },
        encoding: 'utf8', timeout: 20_000 });
    assert.ifError(stray.error);
    assert.notEqual(stray.status, 0);
    assert.match(stray.stderr, /Beta settings require RS3_BETA_ENABLED=true/);
    assert.doesNotMatch(stray.stderr, /ERR_UNKNOWN_BUILTIN_MODULE/);
    if (Number(process.versions.node.split('.')[0]) === 20) {
        const path = join(directory, 'usage.sqlite');
        const enabled = spawnSync(process.execPath, [entry], { cwd: root, env: { ...env,
            RS3_BETA_ENABLED: 'true', RS3_BETA_LEDGER_PATH: path,
            RS3_BETA_TOKENS_JSON: JSON.stringify([{ id: 'fixture', sha256: '0'.repeat(64) }]),
            TYPESAFE_MODEL: 'jev-1.14.0', TYPESAFE_API_KEY: 'fixture-not-a-key',
            RUNESCAPE_RECOMMENDATIONS_ENABLED: 'true',
        }, encoding: 'utf8', timeout: 20_000 });
        assert.ifError(enabled.error);
        assert.notEqual(enabled.status, 0);
        assert.match(enabled.stderr, /Protected beta requires Node\.js 22\.13\+/);
        assert.equal(existsSync(path), false);
    }
} finally { rmSync(directory, { recursive: true, force: true }); }
console.log(`Public HTTP health/discovery and beta configuration checks passed on ${process.version}.`);
