import { expect, test } from '@jest/globals';
import * as Sentry from '@sentry/node';
import type { AddressInfo } from 'node:net';
import { createHttpServer } from '../src/httpApp.js';

test('public tool successes carry the smoke-test label on both protocol versions', async () => {
    const metrics: Sentry.Metric[] = [];
    Sentry.init({
        dsn: 'http://test@127.0.0.1:1/1',
        defaultIntegrations: false,
        enableRuntimeChannelInjection: false,
        skipOpenTelemetrySetup: true,
        beforeSendMetric(metric) {
            metrics.push(metric);
            return null;
        },
    });
    const app = createHttpServer();

    try {
        await new Promise<void>((resolve, reject) => {
            app.server.once('error', reject);
            app.server.listen(0, '127.0.0.1', resolve);
        });
        const port = (app.server.address() as AddressInfo).port;

        async function rpc(method: string, params: { name?: string; arguments?: object },
            { modern = false, smoke = false } = {}) {
            const headers = new Headers({ 'content-type': 'application/json', accept: 'application/json, text/event-stream' });
            if (smoke) headers.set('X-Runescape-Mcp-Smoke', '1');
            if (modern) {
                headers.set('MCP-Protocol-Version', '2026-07-28');
                headers.set('Mcp-Method', method);
                if (params.name) headers.set('Mcp-Name', params.name);
            }
            const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
                method: 'POST', headers,
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

        expect(metrics).toHaveLength(3);
        expect(metrics.map(({ name, type, value, attributes }) => ({
            name, type, value, tool: attributes?.tool_name, source: attributes?.traffic_source,
        }))).toEqual(expect.arrayContaining([
            { name: 'runescape.mcp.tool_call.success', type: 'counter', value: 1, tool: 'estimate_flip', source: 'public' },
            { name: 'runescape.mcp.tool_call.success', type: 'counter', value: 1, tool: 'get_ge_info', source: 'smoke_test' },
            { name: 'runescape.mcp.tool_call.success', type: 'counter', value: 1, tool: 'estimate_flip', source: 'smoke_test' },
        ]));
    } finally {
        await app.close();
        await Sentry.close(1_000);
    }
});
