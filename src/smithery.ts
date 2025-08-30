// Smithery-compatible entry point for RuneScape Wiki MCP Server

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ListResourcesRequestSchema,
    ReadResourceRequestSchema,
    CallToolRequest,
    ReadResourceRequest,
} from '@modelcontextprotocol/sdk/types.js';

import { SERVER_CONFIG } from './constants.js';
import { allTools, handleTool } from './tools/index.js';
import { resources, handleResource } from './resources.js';
import { createErrorResponse, debugLog } from './utils.js';

// Required: Export default createServer function for Smithery
export default function createServer({ config }: { config?: any }) {
    // Initialize the MCP server
    const server = new Server(
        SERVER_CONFIG,
        {
            capabilities: {
                tools: {},
                resources: {},
            },
        }
    );

    // Setup server request handlers
    setupServerHandlers(server);

    return server;
}

// Setup server request handlers
function setupServerHandlers(server: Server) {
    // Register tool handlers
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return { tools: allTools };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
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
            debugLog(`Tool ${name} failed`, error);
            const errorResponse = createErrorResponse(error);
            return {
                content: errorResponse.content,
                isError: errorResponse.isError,
            };
        }
    });

    // Register resource handlers
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
        return { resources };
    });

    server.setRequestHandler(ReadResourceRequestSchema, async (request: ReadResourceRequest) => {
        try {
            return await handleResource(request);
        } catch (error) {
            throw new Error(`Failed to read resource: ${error instanceof Error ? error.message : String(error)}`);
        }
    });
}
