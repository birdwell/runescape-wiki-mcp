// Node HTTP entry — Streamable HTTP MCP for remote hosts (Fly, etc.).

import './instrument.js';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { PUBLIC_ORIGIN } from './constants.js';
import { CANONICAL_MCP_URL, handleDiscoveryRequest, serverCardUrl } from './discovery.js';
import { clientKeyFromHeaders, consumeRateLimit } from './rateLimit.js';
import { createServer as createMcpServer } from './server.js';

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '0.0.0.0';
const SMITHERY_URL = 'https://smithery.ai/servers/birdwell/runescape-wiki-mcp';

const handler = createMcpHandler(createMcpServer);
const nodeHandler = toNodeHandler(handler);

function serveHomepage(_req: IncomingMessage, res: ServerResponse): void {
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>RuneScape Wiki MCP</title>
</head>
<body>
  <h1>RuneScape Wiki MCP</h1>
  <p>RS3 Grand Exchange prices, item lookup, hiscores, and wiki tools over MCP.</p>
  <ul>
    <li><a href="${CANONICAL_MCP_URL}">MCP endpoint</a></li>
    <li><a href="${serverCardUrl(PUBLIC_ORIGIN)}">Server card</a></li>
    <li><a href="${SMITHERY_URL}">Smithery</a></li>
    <li><a href="https://github.com/birdwell/runescape-wiki-mcp">GitHub</a></li>
  </ul>
</body>
</html>`;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
}

const server = createServer((req, res) => {
    const path = req.url?.split('?')[0] ?? '/';
    if (req.method === 'GET' && (path === '/' || path === '')) {
        serveHomepage(req, res);
        return;
    }

    if (req.method === 'GET' && path === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"ok":true}');
        return;
    }

    const hostHeader = req.headers.host ?? `localhost:${port}`;
    const forwarded = req.headers['x-forwarded-proto'];
    const forwardedProto = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const proto =
        forwardedProto ??
        (hostHeader.startsWith('localhost') || hostHeader.startsWith('127.0.0.1') ? 'http' : 'https');
    const ifNoneMatch = req.headers['if-none-match'];
    const discovery = handleDiscoveryRequest(
        new Request(`${proto}://${hostHeader}${req.url ?? '/'}`, {
            method: req.method ?? 'GET',
            headers: {
                'if-none-match': Array.isArray(ifNoneMatch) ? ifNoneMatch[0] : (ifNoneMatch ?? ''),
            },
        })
    );
    if (discovery) {
        void writeWebResponse(discovery, res);
        return;
    }

    const limit = consumeRateLimit(
        clientKeyFromHeaders({
            get(name: string) {
                const value = req.headers[name.toLowerCase()];
                if (Array.isArray(value)) {
                    return value[0] ?? null;
                }
                return value ?? null;
            },
        })
    );
    if (!limit.ok) {
        res.writeHead(429, {
            'content-type': 'application/json',
            'retry-after': String(limit.retryAfterSeconds),
        });
        res.end(JSON.stringify({ error: 'Too many requests' }));
        return;
    }

    void nodeHandler(req, res);
});

async function writeWebResponse(response: Response, res: ServerResponse): Promise<void> {
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
        headers[key] = value;
    });
    res.writeHead(response.status, headers);
    res.end(Buffer.from(await response.arrayBuffer()));
}

server.listen(port, host, () => {
    console.error(`RuneScape Wiki MCP Server listening on http://${host}:${port}/mcp`);
});

async function shutdown(): Promise<void> {
    await handler.close();
    await new Promise<void>((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
    });
    process.exit(0);
}

process.on('SIGINT', () => {
    void shutdown();
});
process.on('SIGTERM', () => {
    void shutdown();
});
