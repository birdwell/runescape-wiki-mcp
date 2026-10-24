// Drive the built HTTP server with the real PostHog SDK and a local ingestion receiver.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { gunzipSync } from 'node:zlib';

test('hosted HTTP calls reach ingestion; health and discovery do not inflate counts', { timeout: 20_000 }, async () => {
    const events = [];
    const ingestion = createServer(async (req, res) => {
        try {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            let body = Buffer.concat(chunks);
            if (req.headers['content-encoding'] === 'gzip') body = gunzipSync(body);
            const payload = JSON.parse(body.toString());
            events.push(...(payload.batch ?? [payload]));
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end('{"status":1}');
        } catch {
            res.writeHead(400);
            res.end();
        }
    });
    ingestion.listen(0, '127.0.0.1');
    await once(ingestion, 'listening');
    const child = spawn(process.execPath, ['dist/http.js'], {
        cwd: new URL('..', import.meta.url),
        env: {
            ...process.env, PORT: '0', HOST: '127.0.0.1', SENTRY_DSN: '',
            POSTHOG_ENABLED: 'true', POSTHOG_PROJECT_KEY: 'phc_local_test',
            POSTHOG_HOST: `http://127.0.0.1:${ingestion.address().port}`,
            POSTHOG_ENVIRONMENT: 'test',
        },
        stdio: ['ignore', 'ignore', 'pipe'],
    });
    const exit = once(child, 'exit');
    let stderr = '';
    child.stderr.setEncoding('utf8');
    try {
        const origin = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`HTTP startup timeout: ${stderr}`)), 10_000);
            child.stderr.on('data', chunk => {
                stderr += chunk;
                const match = stderr.match(/listening on (http:\/\/127\.0\.0\.1:\d+)\/mcp/);
                if (match) { clearTimeout(timer); resolve(match[1]); }
            });
            child.once('exit', () => { clearTimeout(timer); reject(new Error(`HTTP exited early: ${stderr}`)); });
        });
        for (const path of ['/health', '/', '/.well-known/ai-catalog.json']) {
            const response = await fetch(`${origin}${path}`);
            assert.equal(response.status, 200);
            await response.text();
        }
        for (const name of ['get_all_categories', 'get_item_price']) {
            const response = await fetch(`${origin}/mcp?private=never-send-this`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
                    'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/call', 'Mcp-Name': name,
                },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
                    name, arguments: {},
                    _meta: {
                        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
                        'io.modelcontextprotocol/clientInfo': { name: 'private-client', version: '1' },
                        'io.modelcontextprotocol/clientCapabilities': {},
                    },
                } }),
            });
            assert.equal(response.status, 200);
            const body = await response.text();
            assert.match(body, /"result"/);
        }
        child.kill('SIGTERM');
        const [code] = await exit;
        assert.equal(code, 0, stderr);
        const tools = events.filter(event => event.event === 'rs_mcp_tool_call');
        const http = events.filter(event => event.event === 'mcp_http_request');
        assert.equal(tools.length, 2, JSON.stringify(events));
        assert.equal(http.length, 2, JSON.stringify(events));
        assert.equal(events.filter(event => event.event === 'upstream_api_call').length, 0);
        assert.equal(tools.find(event => event.properties.tool_name === 'get_all_categories').properties.success, true);
        assert.equal(tools.find(event => event.properties.tool_name === 'get_item_price').properties.success, false);
        for (const tool of tools) {
            assert.ok(http.some(event => event.properties.request_id === tool.properties.request_id));
            assert.equal(tool.properties.$process_person_profile, false);
        }
        assert.doesNotMatch(JSON.stringify(events), /never-send-this|private-client|"arguments"/);
    } finally {
        if (child.exitCode === null) { child.kill('SIGKILL'); await exit; }
        await new Promise(resolve => ingestion.close(resolve));
    }
});
