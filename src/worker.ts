// Cloudflare Workers entry — Streamable HTTP MCP (stateless) plus discovery docs.

import { createMcpHandler } from '@modelcontextprotocol/server';
import { handleDiscoveryRequest } from './discovery.js';
import { createServer } from './server.js';

const mcp = createMcpHandler(createServer);

export default {
    async fetch(request: Request): Promise<Response> {
        return handleDiscoveryRequest(request) ?? mcp.fetch(request);
    },
};
