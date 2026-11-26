import { expect, test } from '@jest/globals';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gunzipSync } from 'node:zlib';

test('public MCP metrics distinguish setup, discovery and tool outcomes on both protocols', async () => {
    const metrics: Array<{ name: string; type: string; value: number; source: string;
        tool?: string; method?: string; outcome?: string }> = [];
    const requestSpans: Array<Record<string, unknown>> = [];
    const collector = createServer(async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk);
        const bytes = Buffer.concat(chunks);
        const envelope = req.headers['content-encoding'] === 'gzip' ? gunzipSync(bytes) : bytes;
        const [, ...items] = envelope.toString().trimEnd().split('\n');
        for (let index = 0; index < items.length; index += 2) {
            const type = JSON.parse(items[index]).type;
            if (type === 'span') {
                for (const span of JSON.parse(items[index + 1]).items) {
                    if (!span.is_segment || span.attributes['url.path']?.value !== '/mcp') continue;
                    requestSpans.push(Object.fromEntries(Object.entries(span.attributes)
                        .map(([key, attribute]) => [key, (attribute as { value: unknown }).value])));
                }
            }
            if (type !== 'trace_metric') continue;
            for (const metric of JSON.parse(items[index + 1]).items) {
                metrics.push({ name: metric.name, type: metric.type, value: metric.value,
                    tool: metric.attributes.tool_name?.value, source: metric.attributes.traffic_source?.value,
                    method: metric.attributes.rpc_method?.value, outcome: metric.attributes.outcome?.value });
            }
        }
        res.writeHead(200).end('{}');
    });
    collector.listen(0, '127.0.0.1');
    await once(collector, 'listening');
    const collectorPort = (collector.address() as AddressInfo).port;
    const child = spawn(process.execPath, ['dist/http.js'], {
        env: { HOST: '127.0.0.1', PORT: '0', SENTRY_DSN: `http://test@127.0.0.1:${collectorPort}/1` },
        stdio: ['ignore', 'ignore', 'pipe'],
    });
    const exited = once(child, 'exit');

    try {
        const endpoint = await new Promise<string>((resolve, reject) => {
            child.once('error', reject);
            child.once('exit', code => reject(new Error(`HTTP server exited before listening (${code})`)));
            child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
                const match = chunk.match(/http:\/\/127\.0\.0\.1:\d+\/mcp/);
                if (match) resolve(match[0]);
            });
        });

        async function post(body: unknown, headers: Headers) {
            return fetch(endpoint, {
                method: 'POST', headers, signal: AbortSignal.timeout(5000), body: JSON.stringify(body),
            });
        }

        async function rpc(method: string, params: Record<string, unknown>,
            { modern = false, smoke = false, notification = false } = {}) {
            const headers = new Headers({ 'content-type': 'application/json', accept: 'application/json, text/event-stream' });
            if (smoke) headers.set('X-Runescape-Mcp-Smoke', '1');
            if (modern) {
                headers.set('MCP-Protocol-Version', '2026-07-28');
                headers.set('Mcp-Method', method);
                if (typeof params.name === 'string') headers.set('Mcp-Name', params.name);
            }
            const response = await post({ jsonrpc: '2.0', ...(notification ? {} : { id: 1 }), method,
                params: modern ? {
                    ...params,
                    _meta: {
                        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
                        'io.modelcontextprotocol/clientInfo': { name: 'metrics-test', version: '1' },
                        'io.modelcontextprotocol/clientCapabilities': {},
                    },
                } : params }, headers);
            const body = await response.text();
            expect(response.status).toBe(notification ? 202 : 200);
            if (notification) return;
            return JSON.parse(/^data: (.+)$/m.exec(body)?.[1] ?? body);
        }

        const flip = { name: 'estimate_flip', arguments: { itemId: 4151, buyPrice: 1000, sellPrice: 1200 } };
        const categories = { name: 'get_ge_info', arguments: { view: 'categories' } };
        const results = await Promise.all([
            rpc('tools/call', flip),
            rpc('tools/call', categories, { smoke: true }),
            rpc('tools/call', flip, { modern: true, smoke: true }),
        ]);
        for (const result of results) {
            expect(result.result.structuredContent).toBeDefined();
            expect(result.result.isError).not.toBe(true);
        }

        const failed = await rpc('tools/call', { name: 'estimate_flip', arguments: {} });
        expect(failed.result.isError).toBe(true);
        const unknown = await rpc('tools/call', { name: 'unknown_tool' });
        expect(unknown.error).toBeDefined();
        await rpc('tools/list', {});
        await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'metrics-test', version: '1' } });
        await rpc('notifications/initialized', {}, { notification: true });
        await rpc('server/discover', {}, { modern: true });
        await rpc('tools/list', {}, { modern: true, smoke: true });
        const modernFailure = await rpc('tools/call', { name: 'estimate_flip', arguments: {} }, { modern: true });
        expect(modernFailure.result.isError).toBe(true);

        const legacyHeaders = new Headers({ 'content-type': 'application/json', accept: 'application/json, text/event-stream',
            'mcp-protocol-version': '2025-03-26' });
        const batch = await post([
            { jsonrpc: '2.0', id: 1, method: 'tools/list' },
            { jsonrpc: '2.0', id: 2, method: 'tools/call', params: categories },
            { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'estimate_flip', arguments: [] } },
        ], legacyHeaders);
        expect(batch.status).toBe(200);
        expect(await batch.text()).toContain('"error"');

        const cancelled = await post([
            { jsonrpc: '2.0', id: 1, method: 'tools/call', params: flip },
            { jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 1 } },
            { jsonrpc: '2.0', id: 2, method: 'ping' },
        ], legacyHeaders);
        expect(cancelled.status).toBe(200);
        const reader = cancelled.body!.getReader();
        try {
            const response = await reader.read();
            expect(new TextDecoder().decode(response.value)).toContain('"id":2');
        } finally {
            // The legacy stream otherwise waits for the suppressed reply.
            await reader.cancel();
        }

        const malformed = await fetch(endpoint, { method: 'POST', headers: legacyHeaders,
            signal: AbortSignal.timeout(5000), body: '{' });
        expect(malformed.status).toBe(400);
        await malformed.text();

        const rejected = await post({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: flip },
            new Headers({ 'content-type': 'application/json' }));
        expect(rejected.status).toBe(406);
        await rejected.text();

        child.kill('SIGTERM');
        expect(await exited).toEqual([0, null]);
        const toolSuccess = metrics.filter(metric => metric.name === 'runescape.mcp.tool_call.success');
        expect(toolSuccess).toHaveLength(4);
        expect(toolSuccess).toEqual(expect.arrayContaining([
            { name: 'runescape.mcp.tool_call.success', type: 'counter', value: 1, tool: 'estimate_flip', source: 'public' },
            { name: 'runescape.mcp.tool_call.success', type: 'counter', value: 1, tool: 'get_ge_info', source: 'public' },
            { name: 'runescape.mcp.tool_call.success', type: 'counter', value: 1, tool: 'get_ge_info', source: 'smoke_test' },
            { name: 'runescape.mcp.tool_call.success', type: 'counter', value: 1, tool: 'estimate_flip', source: 'smoke_test' },
        ]));

        const byMethod = new Map<string, number>();
        for (const metric of metrics.filter(metric => metric.name === 'runescape.mcp.rpc.message')) {
            expect(metric.type).toBe('counter');
            const key = `${metric.source} ${metric.method} ${metric.outcome}`;
            byMethod.set(key, (byMethod.get(key) ?? 0) + metric.value);
        }
        expect(Object.fromEntries(byMethod)).toEqual({
            'public tools/call success': 2,
            'public tools/call failed': 5,
            'public tools/call aborted': 1,
            'public tools/list received': 2,
            'public initialize received': 1,
            'public notifications/initialized received': 1,
            'public notifications/cancelled received': 1,
            'public ping received': 1,
            'public server/discover received': 1,
            'smoke_test tools/call success': 2,
            'smoke_test tools/list received': 1,
        });

        // Every tools/call outcome carries a bounded tool name; other methods carry none.
        const byTool = new Map<string, number>();
        for (const metric of metrics.filter(metric => metric.name === 'runescape.mcp.rpc.message')) {
            if (metric.method !== 'tools/call') {
                expect(metric.tool).toBeUndefined();
                continue;
            }
            const key = `${metric.source} ${metric.outcome} ${metric.tool}`;
            byTool.set(key, (byTool.get(key) ?? 0) + metric.value);
        }
        expect(Object.fromEntries(byTool)).toEqual({
            'public success get_ge_info': 1,
            'public success estimate_flip': 1,
            'public failed estimate_flip': 4,
            'public failed other': 1,
            'public aborted estimate_flip': 1,
            'smoke_test success get_ge_info': 1,
            'smoke_test success estimate_flip': 1,
        });

        // Root request spans let Sentry count unique callers that used a tool.
        const tagged = requestSpans.map(data => `${data['mcp.traffic_source']} ${data['mcp.tool_call'] ?? false}`);
        expect(tagged).toEqual(expect.arrayContaining(['public true', 'smoke_test true', 'public false']));
        expect(tagged.filter(tag => tag === 'public true').length).toBeGreaterThanOrEqual(5);
        expect(tagged).not.toContain('undefined true');
    } finally {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        await exited;
        await new Promise<void>(resolve => collector.close(() => resolve()));
    }
});
