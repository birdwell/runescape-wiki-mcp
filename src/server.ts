// Server setup and request handling for RuneScape Wiki MCP Server

import {
    Server,
    ProtocolError,
    type CallToolRequest,
    type ReadResourceRequest,
} from '@modelcontextprotocol/server';

import { SERVER_CONFIG } from './constants.js';
import { allTools, handleTool } from './tools/index.js';
import { resources, handleResource } from './resources.js';
import { registerPromptHandlers } from './prompts.js';
import { createErrorResponse, debugLog } from './utils.js';

const SERVER_OPTIONS = {
    capabilities: {
        tools: {},
        resources: {},
        prompts: {},
    },
    // Tool/resource/prompt catalogs are static; GE-backed resource reads refresh ~every 5 minutes.
    cacheHints: {
        'tools/list': { ttlMs: 3_600_000, cacheScope: 'public' as const },
        'resources/list': { ttlMs: 3_600_000, cacheScope: 'public' as const },
        'resources/read': { ttlMs: 300_000, cacheScope: 'public' as const },
        'prompts/list': { ttlMs: 3_600_000, cacheScope: 'public' as const },
        'server/discover': { ttlMs: 3_600_000, cacheScope: 'public' as const },
    },
};

/**
 * Build a fully configured MCP server instance.
 * Used by stdio (`serveStdio`) and HTTP (`createMcpHandler` / Smithery) factories
 * so each request or connection gets a fresh instance for the 2026-07-28 era.
 */
export function createServer(): Server {
    const server = new Server(SERVER_CONFIG, SERVER_OPTIONS);
    setupServerHandlers(server);
    registerPromptHandlers(server);
    return server;
}

function setupServerHandlers(server: Server): void {
    server.setRequestHandler('tools/list', async () => {
        return { tools: allTools };
    });

    server.setRequestHandler('tools/call', async (request: CallToolRequest) => {
        const { name, arguments: args } = request.params;

        debugLog(`Tool called: ${name}`, args);

        try {
            const result = await handleTool(name, args || {});
            debugLog(`Tool ${name} succeeded`, result);
            return {
                content: result.content,
                isError: result.isError,
            };
        } catch (error) {
            if (error instanceof ProtocolError) {
                throw error;
            }
            debugLog(`Tool ${name} failed`, error);
            const errorResponse = createErrorResponse(error);
            return {
                content: errorResponse.content,
                isError: errorResponse.isError,
            };
        }
    });

    server.setRequestHandler('resources/list', async () => {
        return { resources };
    });

    server.setRequestHandler('resources/read', async (request: ReadResourceRequest) => {
        try {
            return await handleResource(request);
        } catch (error) {
            if (error instanceof ProtocolError) {
                throw error;
            }
            throw new Error(
                `Failed to read resource: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    });
}
