// Node HTTP entry — Streamable HTTP MCP for remote hosts (Fly, etc.).

import './instrument.js';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { handleDiscoveryRequest } from './discovery.js';
import { homepageHtml } from './homepage.js';
import { clientKeyFromHeaders, consumeRateLimit } from './rateLimit.js';
import { createServer as createMcpServer } from './server.js';
import { initializeAnalytics, recordHttpRequest, shutdownAnalytics, withRequestContext } from './analytics.js';

await initializeAnalytics('http');

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '0.0.0.0';

const handler = createMcpHandler(createMcpServer);
const nodeHandler = toNodeHandler(handler);

function serveHomepage(_req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(homepageHtml());
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

    const requestId = randomUUID();
    if (path === '/mcp' || path === '/mcp/') {
        const started = performance.now();
        let recorded = false;
        const record = (outcome: 'finished' | 'aborted') => {
            if (recorded) return;
            recorded = true;
            recordHttpRequest({
                request_id: requestId,
                method: req.method ?? 'OTHER',
                status_code: res.statusCode,
                duration_ms: Math.round(performance.now() - started),
                outcome,
            });
        };
        res.once('finish', () => record('finished'));
        res.once('close', () => record('aborted'));
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

    withRequestContext(requestId, () => { void nodeHandler(req, res); });
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
    const address = server.address();
    const listeningPort = typeof address === 'object' && address ? address.port : port;
    console.error(`RuneScape 3 MCP Server listening on http://${host}:${listeningPort}/mcp`);
});

async function shutdown(): Promise<void> {
    await handler.close();
    await new Promise<void>((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
    });
    await shutdownAnalytics();
    process.exit(0);
}

process.on('SIGINT', () => {
    void shutdown();
});
process.on('SIGTERM', () => {
    void shutdown();
});
