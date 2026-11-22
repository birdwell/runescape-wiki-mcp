// Server setup and request handling for RuneScape Wiki MCP Server

import {
    Server,
    ProtocolError,
    type CallToolRequest,
    type ReadResourceRequest,
    type RequestId,
} from '@modelcontextprotocol/server';
import * as Sentry from '@sentry/node';

import { SERVER_CONFIG, SERVER_INSTRUCTIONS } from './constants.js';
import { availableTools, handleTool } from './tools/index.js';
import { resources, handleResource } from './resources.js';
import { registerPromptHandlers } from './prompts.js';
import type { ToolOutcome } from './rpcMetrics.js';
import { createErrorResponse, debugLog } from './utils.js';

const SERVER_OPTIONS = {
    instructions: SERVER_INSTRUCTIONS,
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
    return createServerWithToolObserver();
}

type ToolObserver = (name: string, id: RequestId, outcome: ToolOutcome) => void;

export function createServerWithToolObserver(onToolResult?: ToolObserver): Server {
    const server = new Server(SERVER_CONFIG, SERVER_OPTIONS);
    setupServerHandlers(server, onToolResult);
    registerPromptHandlers(server);
    if (Sentry.isInitialized()) {
        return Sentry.wrapMcpServerWithSentry(server);
    }
    return server;
}

function setupServerHandlers(server: Server, onToolResult?: ToolObserver): void {
    server.setRequestHandler('tools/list', async () => {
        return { tools: availableTools() };
    });

    server.setRequestHandler('tools/call', async (request: CallToolRequest, { mcpReq }) => {
        const { name, arguments: args } = request.params;

        debugLog(`Tool called: ${name}`, args);

        try {
            const result = await handleTool(name, args || {});
            debugLog(`Tool ${name} succeeded`, result);
            observeToolResult(onToolResult, name, mcpReq.id, mcpReq.signal, result.isError ? 'failed' : 'success');
            return {
                content: result.content,
                structuredContent: result.structuredContent,
                isError: result.isError,
            };
        } catch (error) {
            observeToolResult(onToolResult, name, mcpReq.id, mcpReq.signal, 'failed');
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

function observeToolResult(observer: ToolObserver | undefined, name: string, id: RequestId, signal: AbortSignal,
    outcome: Exclude<ToolOutcome, 'aborted'>): void {
    try {
        observer?.(name, id, signal.aborted ? 'aborted' : outcome);
    } catch {
        debugLog('Could not record tool result');
    }
}
