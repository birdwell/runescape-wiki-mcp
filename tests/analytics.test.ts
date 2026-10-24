import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';

const capture = jest.fn<(event: Record<string, any>) => void>();
const shutdown = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const createClient = jest.fn().mockImplementation(() => ({ capture, shutdown, on: jest.fn() }));
jest.unstable_mockModule('posthog-node', () => ({ PostHog: createClient }));

const { initializeAnalytics, observeTool, shutdownAnalytics, withRequestContext } = await import('../src/analytics.js');
const { makeApiRequest, makeTextApiRequest } = await import('../src/utils.js');
const { createServer } = await import('../src/server.js');
const { createMcpHandler } = await import('@modelcontextprotocol/server');
const originalEnv = { ...process.env };

async function enable(mode: 'http' | 'stdio' = 'http') {
    process.env.POSTHOG_ENABLED = 'true';
    process.env.POSTHOG_PROJECT_KEY = 'phc_test';
    process.env.POSTHOG_ENVIRONMENT = 'test';
    await initializeAnalytics(mode);
}

async function callTool(name: string, args: Record<string, unknown> = {}) {
    const handler = createMcpHandler(() => createServer());
    try {
        const response = await handler.fetch(new Request('http://test.local/mcp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
                'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/call', 'Mcp-Name': name,
            },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
                name, arguments: args,
                _meta: {
                    'io.modelcontextprotocol/protocolVersion': '2026-07-28',
                    'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1' },
                    'io.modelcontextprotocol/clientCapabilities': {},
                },
            } }),
        }));
        return await response.text();
    } finally {
        await handler.close();
    }
}

beforeEach(() => {
    delete process.env.POSTHOG_ENABLED;
    delete process.env.POSTHOG_STDIO_ENABLED;
    delete process.env.POSTHOG_PROJECT_KEY;
    capture.mockReset();
    createClient.mockClear();
    shutdown.mockClear();
    nock.cleanAll();
});
afterEach(async () => {
    await shutdownAnalytics();
    process.env = { ...originalEnv };
    nock.cleanAll();
});

describe('usage analytics', () => {
    it('is off without both the explicit switch and project key', async () => {
        await initializeAnalytics('http');
        process.env.POSTHOG_PROJECT_KEY = 'phc_test';
        await initializeAnalytics('http');
        await observeTool('get_all_categories', async () => ({ isError: false }));
        expect(createClient).not.toHaveBeenCalled();
        expect(capture).not.toHaveBeenCalled();
    });

    it('keeps local stdio off even with hosted credentials, unless separately opted in', async () => {
        await enable('stdio');
        expect(createClient).not.toHaveBeenCalled();
        process.env.POSTHOG_STDIO_ENABLED = 'true';
        await initializeAnalytics('stdio');
        expect(createClient).toHaveBeenCalledTimes(1);
    });

    it('records MCP tool results and API failures without leaking player names or payloads', async () => {
        await enable();
        nock('https://secure.runescape.com').get('/m=hiscore/index_lite.ws')
            .query({ player: 'PrivatePlayer' }).reply(500, 'sensitive upstream body');
        const output = await withRequestContext('request-test', () =>
            callTool('get_player_stats', { username: 'PrivatePlayer' }));
        expect(output).toContain('isError');
        const events = capture.mock.calls.map(([event]) => event);
        expect(events.map(event => event.event)).toEqual(['upstream_api_call', 'rs_mcp_tool_call']);
        expect(events[0].properties).toMatchObject({
            provider: 'jagex_hiscores', status_code: 500, success: false,
            request_id: 'request-test', tool_name: 'get_player_stats', error_kind: 'http',
        });
        expect(events[1].properties).toMatchObject({ success: false, $process_person_profile: false });
        expect(events[0].properties.tool_call_id).toBe(events[1].properties.tool_call_id);
        expect(JSON.stringify(events)).not.toMatch(/PrivatePlayer|sensitive upstream body|https:\/\/secure/);
    });

    it('counts validation failures as failed tool calls even when no exception is thrown', async () => {
        await enable();
        await callTool('get_item_price');
        expect(capture).toHaveBeenCalledTimes(1);
        expect(capture.mock.calls[0][0]).toMatchObject({
            event: 'rs_mcp_tool_call', properties: { tool_name: 'get_item_price', success: false },
        });
    });

    it('records successful JSON and text requests and preserves concurrent tool context', async () => {
        await enable();
        nock('https://runescape.wiki').get('/api.php').query({ search: 'secret' })
            .delay(10).reply(200, { content: 'private result' });
        nock('https://api.weirdgloop.org').get('/history').reply(200, 'csv');
        const result = await Promise.all([
            withRequestContext('r1', () => observeTool('search_wiki', () =>
                makeApiRequest('https://runescape.wiki/api.php?search=secret'))),
            withRequestContext('r2', () => observeTool('get_item_graph', async () => ({
                isError: false, text: await makeTextApiRequest('https://api.weirdgloop.org/history'),
            }))),
        ]);
        expect(result[0]).toEqual({ content: 'private result' });
        const events = capture.mock.calls.map(([event]) => event);
        expect(events).toHaveLength(4);
        for (const event of events) {
            const p = event.properties;
            expect(p.success).toBe(true);
            expect(p.tool_name).toBe(p.request_id === 'r1' ? 'search_wiki' : 'get_item_graph');
            expect(p.environment).toBe('test');
        }
        expect(JSON.stringify(events)).not.toMatch(/secret|private result/);
    });

    it('counts network and JSON parse failures exactly once and rethrows them', async () => {
        await enable();
        nock('https://runescape.wiki').get('/api.php').replyWithError('secret network error');
        await expect(makeApiRequest('https://runescape.wiki/api.php')).rejects.toThrow();
        nock('https://runescape.wiki').get('/api.php').reply(200, 'invalid json');
        await expect(makeApiRequest('https://runescape.wiki/api.php')).rejects.toThrow();
        expect(capture.mock.calls.map(([event]) => event.properties.error_kind)).toEqual(['network', 'parse']);
        expect(JSON.stringify(capture.mock.calls)).not.toContain('secret network error');
    });

    it('preserves thrown tool errors and successful responses when analytics capture fails', async () => {
        await enable();
        const originalError = new Error('original tool error');
        const log = jest.spyOn(console, 'error').mockImplementation(() => {});
        capture.mockImplementation(() => { throw new Error('SDK error'); });
        try {
            await expect(observeTool('search_wiki', async () => { throw originalError; }))
                .rejects.toBe(originalError);
            await expect(observeTool('get_all_categories', async () => ({ isError: false })))
                .resolves.toEqual({ isError: false });
        } finally {
            log.mockRestore();
        }
    });

    it('drains the analytics client during shutdown', async () => {
        await enable();
        await shutdownAnalytics();
        expect(shutdown).toHaveBeenCalledWith(5_000);
        await observeTool('get_all_categories', async () => ({ isError: false }));
        expect(capture).not.toHaveBeenCalled();
    });
});
