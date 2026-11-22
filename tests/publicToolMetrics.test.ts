import { expect, test } from '@jest/globals';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gunzipSync } from 'node:zlib';

test('public tool counters flush with the smoke-test label on both protocol versions', async () => {
    const metrics: unknown[] = [];
    const collector = createServer(async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk);
        const bytes = Buffer.concat(chunks);
        const envelope = req.headers['content-encoding'] === 'gzip' ? gunzipSync(bytes) : bytes;
        const [, ...items] = envelope.toString().trimEnd().split('\n');
        for (let index = 0; index < items.length; index += 2) {
            if (JSON.parse(items[index]).type !== 'trace_metric') continue;
            for (const metric of JSON.parse(items[index + 1]).items) {
                metrics.push({ name: metric.name, type: metric.type, value: metric.value,
                    tool: metric.attributes.tool_name?.value, source: metric.attributes.traffic_source?.value });
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

        async function rpc(method: string, params: { name?: string; arguments?: object },
            { modern = false, smoke = false } = {}) {
            const headers = new Headers({ 'content-type': 'application/json', accept: 'application/json, text/event-stream' });
            if (smoke) headers.set('X-Runescape-Mcp-Smoke', '1');
            if (modern) {
                headers.set('MCP-Protocol-Version', '2026-07-28');
                headers.set('Mcp-Method', method);
                if (params.name) headers.set('Mcp-Name', params.name);
            }
            const response = await fetch(endpoint, {
                method: 'POST', headers,
                signal: AbortSignal.timeout(5000),
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: modern ? {
                    ...params,
                    _meta: {
                        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
                        'io.modelcontextprotocol/clientInfo': { name: 'metrics-test', version: '1' },
                        'io.modelcontextprotocol/clientCapabilities': {},
                    },
                } : params }),
            });
            const body = await response.text();
            expect(response.status).toBe(200);
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

        child.kill('SIGTERM');
        expect(await exited).toEqual([0, null]);
        expect(metrics).toHaveLength(3);
        expect(metrics).toEqual(expect.arrayContaining([
            { name: 'runescape.mcp.tool_call.success', type: 'counter', value: 1, tool: 'estimate_flip', source: 'public' },
            { name: 'runescape.mcp.tool_call.success', type: 'counter', value: 1, tool: 'get_ge_info', source: 'smoke_test' },
            { name: 'runescape.mcp.tool_call.success', type: 'counter', value: 1, tool: 'estimate_flip', source: 'smoke_test' },
        ]));
    } finally {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        await exited;
        await new Promise<void>(resolve => collector.close(() => resolve()));
    }
});
