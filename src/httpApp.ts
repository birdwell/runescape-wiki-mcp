// Node HTTP entry — Streamable HTTP MCP for remote hosts (Fly, etc.).

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { handleDiscoveryRequest } from './discovery.js';
import { homepageHtml } from './homepage.js';
import { clientKeyFromHeaders, consumeRateLimit } from './rateLimit.js';
import { createServer as createMcpServer } from './server.js';
import type { ProtectedBeta } from './beta.js';

export function createHttpServer(beta?: ProtectedBeta, port = 8080) {

    const handler = createMcpHandler(createMcpServer);
    const nodeHandler = toNodeHandler(handler);

    function serveHomepage(_req: IncomingMessage, res: ServerResponse): void {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(homepageHtml());
    }

    const server = createServer((req, res) => {
        res.setHeader('cache-control', 'no-store');
        const path = req.url?.split('?')[0] ?? '/';
        if (req.method === 'GET' && path === '/health') {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end('{"ok":true}');
            return;
        }

        if (beta) {
            const principal = beta.authenticate(req.headers.authorization);
            if (!principal) {
                res.writeHead(401, { 'content-type': 'application/json', 'www-authenticate': 'Bearer realm="RS3 beta"' });
                res.end('{"error":"Bearer authentication required"}');
                return;
            }
            if (req.method === 'GET' && path === '/beta/usage') {
                try {
                    const body = JSON.stringify(beta.ledger.usage(principal));
                    res.writeHead(200, { 'content-type': 'application/json' });
                    res.end(body);
                } catch {
                    res.statusCode = 503;
                    res.end('{"error":"Beta budget unavailable"}');
                }
                return;
            }
            beta.run(principal, () => serveRequest(req, res, `beta:${principal.id}`));
            return;
        }
        serveRequest(req, res);
    });

    function serveRequest(req: IncomingMessage, res: ServerResponse, authenticatedKey?: string): void {
        const path = req.url?.split('?')[0] ?? '/';
        if (req.method === 'GET' && (path === '/' || path === '')) {
            serveHomepage(req, res);
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
            authenticatedKey ?? clientKeyFromHeaders({
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

        void nodeHandler(req, res).catch(() => {
            if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
            res.end('{"error":"Request failed"}');
        });
    }

    async function writeWebResponse(response: Response, res: ServerResponse): Promise<void> {
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
            headers[key] = value;
        });
        res.writeHead(response.status, headers);
        res.end(Buffer.from(await response.arrayBuffer()));
    }

    return { server, async close(): Promise<void> {
        await handler.close();
        if (server.listening) await new Promise<void>((resolve, reject) => {
            server.close(error => (error ? reject(error) : resolve()));
            server.closeIdleConnections();
        });
        beta?.ledger.close();
    } };
}
