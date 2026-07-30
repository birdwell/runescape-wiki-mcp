// MCP specification compliance tests

import {
    ProtocolError,
    ProtocolErrorCode,
    createMcpHandler,
    type McpHttpHandler,
} from '@modelcontextprotocol/server';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import { handleTool } from '../src/tools/index.js';
import { handlePriceTool } from '../src/tools/priceTools.js';
import { createServer } from '../src/server.js';
import { RS3_GE_API, RESOURCE_URIS, SERVER_CONFIG } from '../src/constants.js';

const PROTOCOL_VERSION = '2026-07-28';

function parseSseOrJsonMessage(body: string): Record<string, unknown> {
    const dataLine = body.split('\n').find(line => line.startsWith('data: '));
    const payload = dataLine ? dataLine.slice('data: '.length) : body;
    return JSON.parse(payload) as Record<string, unknown>;
}

async function mcpFetch(
    handler: McpHttpHandler,
    method: string,
    options: {
        id?: number;
        name?: string;
        params?: Record<string, unknown>;
        legacy?: boolean;
    } = {}
): Promise<{ status: number; message: Record<string, unknown> }> {
    const { id = 1, name, params = {}, legacy = false } = options;

    const headers: Record<string, string> = {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
    };

    let body: Record<string, unknown>;

    if (legacy) {
        body = {
            jsonrpc: '2.0',
            id,
            method,
            params,
        };
    } else {
        headers['MCP-Protocol-Version'] = PROTOCOL_VERSION;
        headers['Mcp-Method'] = method;
        if (name !== undefined) {
            headers['Mcp-Name'] = name;
        }

        body = {
            jsonrpc: '2.0',
            id,
            method,
            params: {
                ...params,
                _meta: {
                    'io.modelcontextprotocol/protocolVersion': PROTOCOL_VERSION,
                    'io.modelcontextprotocol/clientInfo': {
                        name: 'compliance-test',
                        version: '1.0.0',
                    },
                    'io.modelcontextprotocol/clientCapabilities': {},
                },
            },
        };
    }

    const response = await handler.fetch(
        new Request('http://test.local/mcp', {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        })
    );

    return {
        status: response.status,
        message: parseSseOrJsonMessage(await response.text()),
    };
}

describe('MCP specification compliance', () => {
    let handler: McpHttpHandler;

    beforeEach(() => {
        nock.cleanAll();
        handler = createMcpHandler(() => createServer());
    });

    afterEach(() => {
        nock.cleanAll();
    });

    it('should throw protocol error for unknown tools', async () => {
        await expect(handleTool('not_a_real_tool', {})).rejects.toBeInstanceOf(ProtocolError);
        await expect(handleTool('not_a_real_tool', {})).rejects.toMatchObject({
            code: ProtocolErrorCode.InvalidParams,
            message: 'Unknown tool: not_a_real_tool',
        });
    });

    it('should return tool execution errors for missing required arguments', async () => {
        const result = await handlePriceTool('get_item_price', {});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe('Either itemId or name is required');
    });

    it('should return tool execution errors for invalid argument types', async () => {
        const result = await handlePriceTool('get_item_price', { itemId: 'not-a-number' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe('itemId must be an integer');
    });

    describe('2026-07-28 protocol (createMcpHandler)', () => {
        it('should answer server/discover with identity and cache hints', async () => {
            const { status, message } = await mcpFetch(handler, 'server/discover');

            expect(status).toBe(200);
            expect(message).toMatchObject({ jsonrpc: '2.0', id: 1 });

            const result = message.result as {
                supportedVersions: string[];
                ttlMs: number;
                cacheScope: string;
                _meta: Record<string, unknown>;
            };
            expect(result.supportedVersions).toContain(PROTOCOL_VERSION);
            expect(result.ttlMs).toBe(3_600_000);
            expect(result.cacheScope).toBe('public');
            expect(result._meta['io.modelcontextprotocol/serverInfo']).toMatchObject({
                name: SERVER_CONFIG.name,
                version: SERVER_CONFIG.version,
            });
        });

        it('should serve tools/list with cache hints', async () => {
            const { status, message } = await mcpFetch(handler, 'tools/list');

            expect(status).toBe(200);
            const result = message.result as {
                tools: Array<{ name: string }>;
                ttlMs: number;
                cacheScope: string;
            };
            expect(result.tools.some(t => t.name === 'get_item_price')).toBe(true);
            expect(result.ttlMs).toBe(3_600_000);
            expect(result.cacheScope).toBe('public');
        });

        it('should call tools successfully over the wire', async () => {
            nock(RS3_GE_API)
                .get('/catalogue/detail.json?item=4151')
                .reply(200, {
                    item: {
                        id: 4151,
                        name: 'Abyssal whip',
                        current: { price: '75k' },
                    },
                });

            const { status, message } = await mcpFetch(handler, 'tools/call', {
                name: 'get_item_price',
                params: {
                    name: 'get_item_price',
                    arguments: { itemId: 4151 },
                },
            });

            expect(status).toBe(200);
            const result = message.result as {
                content: Array<{ type: string; text: string }>;
                isError?: boolean;
            };
            expect(result.isError).toBeFalsy();
            expect(result.content[0].text).toContain('Abyssal whip');
        });

        it('should surface unknown tools as JSON-RPC InvalidParams', async () => {
            const { status, message } = await mcpFetch(handler, 'tools/call', {
                name: 'not_a_real_tool',
                params: {
                    name: 'not_a_real_tool',
                    arguments: {},
                },
            });

            expect(status).toBe(200);
            expect(message.error).toMatchObject({
                code: ProtocolErrorCode.InvalidParams,
                message: 'Unknown tool: not_a_real_tool',
            });
        });

        it('should convert thrown tool API failures into isError results', async () => {
            nock(RS3_GE_API)
                .get('/catalogue/detail.json?item=4151')
                .reply(500, 'Internal Server Error');

            const { status, message } = await mcpFetch(handler, 'tools/call', {
                name: 'get_item_price',
                params: {
                    name: 'get_item_price',
                    arguments: { itemId: 4151 },
                },
            });

            expect(status).toBe(200);
            const result = message.result as {
                content: Array<{ type: string; text: string }>;
                isError?: boolean;
            };
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('API request failed: 500');
        });

        it('should return validation failures as isError tool results', async () => {
            const { status, message } = await mcpFetch(handler, 'tools/call', {
                name: 'get_item_price',
                params: {
                    name: 'get_item_price',
                    arguments: {},
                },
            });

            expect(status).toBe(200);
            const result = message.result as {
                content: Array<{ type: string; text: string }>;
                isError?: boolean;
            };
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toBe('Either itemId or name is required');
        });

        it('should serve resources/list with cache hints', async () => {
            const { status, message } = await mcpFetch(handler, 'resources/list');

            expect(status).toBe(200);
            const result = message.result as {
                resources: Array<{ uri: string }>;
                ttlMs: number;
                cacheScope: string;
            };
            expect(result.resources.some(r => r.uri === RESOURCE_URIS.GE_INFO)).toBe(true);
            expect(result.resources.some(r => r.uri === RESOURCE_URIS.GE_CATEGORIES)).toBe(true);
            expect(result.ttlMs).toBe(3_600_000);
            expect(result.cacheScope).toBe('public');
        });

        it('should serve resources/read with cache hints', async () => {
            nock(RS3_GE_API)
                .get('/info.json')
                .reply(200, { lastConfigUpdateRuneday: 8526 });

            const { status, message } = await mcpFetch(handler, 'resources/read', {
                name: RESOURCE_URIS.GE_INFO,
                params: { uri: RESOURCE_URIS.GE_INFO },
            });

            expect(status).toBe(200);
            const result = message.result as {
                contents: Array<{ uri: string; text: string }>;
                ttlMs: number;
                cacheScope: string;
            };
            expect(result.contents[0].uri).toBe(RESOURCE_URIS.GE_INFO);
            expect(result.contents[0].text).toContain('lastConfigUpdateRuneday');
            expect(result.ttlMs).toBe(300_000);
            expect(result.cacheScope).toBe('public');
        });

        it('should return InvalidParams for unknown resources', async () => {
            const { status, message } = await mcpFetch(handler, 'resources/read', {
                name: 'runescape://unknown/resource',
                params: { uri: 'runescape://unknown/resource' },
            });

            expect(status).toBe(200);
            expect(message.error).toMatchObject({
                code: ProtocolErrorCode.InvalidParams,
                message: expect.stringContaining('Resource not found'),
            });
        });
    });

    describe('legacy 2025-era compatibility', () => {
        it('should still answer initialize without a modern envelope', async () => {
            const { status, message } = await mcpFetch(handler, 'initialize', {
                id: 9,
                legacy: true,
                params: {
                    protocolVersion: '2025-11-25',
                    capabilities: {},
                    clientInfo: { name: 'legacy-test', version: '1.0.0' },
                },
            });

            expect(status).toBe(200);
            expect(message.result).toMatchObject({
                protocolVersion: '2025-11-25',
                capabilities: {
                    tools: {},
                    resources: {},
                },
                serverInfo: {
                    name: SERVER_CONFIG.name,
                    version: SERVER_CONFIG.version,
                },
            });
        });
    });
});
