// Cloudflare Workers entry — Streamable HTTP MCP (stateless) plus discovery docs.

import { createMcpHandler } from '@modelcontextprotocol/server';
import { handleDiscoveryRequest } from './discovery.js';
import { consumeRateLimit, clientKeyFromHeaders, tooManyRequestsResponse } from './rateLimit.js';
import { createServer } from './server.js';

const mcp = createMcpHandler(createServer);

export default {
    async fetch(request: Request): Promise<Response> {
        const discovered = handleDiscoveryRequest(request);
        if (discovered) {
            return discovered;
        }
        const path = new URL(request.url).pathname;
        if (request.method === 'GET' && path === '/health') {
            return new Response('{"ok":true}', {
                headers: { 'content-type': 'application/json' },
            });
        }
        const limit = consumeRateLimit(clientKeyFromHeaders(request.headers));
        if (!limit.ok) {
            return tooManyRequestsResponse(limit.retryAfterSeconds);
        }
        return mcp.fetch(request);
    },
};
