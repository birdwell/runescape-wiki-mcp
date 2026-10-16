// SEP-2127 server card and AI Catalog discovery for the remote MCP host.

import { createHash } from 'node:crypto';
import {
    MCP_PATH,
    PUBLIC_ORIGIN,
    REGISTRY_NAME,
    REPOSITORY_ID,
    REPOSITORY_URL,
    SERVER_CONFIG,
    SERVER_TITLE,
} from './constants.js';

export const SERVER_CARD_SCHEMA =
    'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json';
export const SERVER_CARD_MEDIA_TYPE = 'application/mcp-server-card+json';
export const AI_CATALOG_MEDIA_TYPE = 'application/ai-catalog+json';

const SERVER_CARD_PATHS = new Set(['/server-card', '/mcp/server-card', '/.well-known/mcp/server-card.json']);
const AI_CATALOG_PATH = '/.well-known/ai-catalog.json';

export function mcpUrl(origin: string): string {
    return `${origin}${MCP_PATH}`;
}

export function serverCardUrl(origin: string): string {
    return `${origin}${MCP_PATH}/server-card`;
}

export function serverCard(origin: string) {
    return {
        $schema: SERVER_CARD_SCHEMA,
        name: REGISTRY_NAME,
        title: SERVER_TITLE,
        description: SERVER_CONFIG.description,
        version: SERVER_CONFIG.version,
        websiteUrl: origin,
        repository: {
            url: REPOSITORY_URL,
            source: 'github',
            id: REPOSITORY_ID,
        },
        remotes: [
            {
                type: 'streamable-http' as const,
                url: mcpUrl(origin),
                supportedProtocolVersions: ['2026-07-28'],
            },
        ],
    };
}

export function aiCatalog(origin: string) {
    return {
        specVersion: '1.0',
        host: {
            displayName: SERVER_TITLE,
            identifier: 'did:web:runescape-wiki-mcp.fly.dev',
        },
        entries: [
            {
                identifier: 'urn:air:runescape-wiki-mcp.fly.dev:mcp:runescape-wiki',
                displayName: SERVER_TITLE,
                type: SERVER_CARD_MEDIA_TYPE,
                url: serverCardUrl(origin),
            },
        ],
    };
}

function documentFor(pathname: string, origin: string): { body: string; mediaType: string } | undefined {
    if (SERVER_CARD_PATHS.has(pathname)) {
        return {
            body: JSON.stringify(serverCard(origin)),
            mediaType: SERVER_CARD_MEDIA_TYPE,
        };
    }
    if (pathname === AI_CATALOG_PATH) {
        return {
            body: JSON.stringify(aiCatalog(origin)),
            mediaType: AI_CATALOG_MEDIA_TYPE,
        };
    }
    return undefined;
}

function etagFor(body: string): string {
    return `"${createHash('sha256').update(body).digest('hex').slice(0, 32)}"`;
}

function discoveryHeaders(mediaType: string, etag: string): Headers {
    return new Headers({
        'content-type': mediaType,
        etag,
        'cache-control': 'public, max-age=3600',
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, HEAD, OPTIONS',
        'access-control-allow-headers': 'Content-Type, If-None-Match',
        'access-control-expose-headers': 'ETag',
    });
}

/**
 * Serve the server card and AI Catalog. Returns undefined so the MCP
 * transport can handle every other request.
 */
export function handleDiscoveryRequest(request: Request): Response | undefined {
    const url = new URL(request.url);
    const document = documentFor(url.pathname, url.origin);
    if (!document) {
        return undefined;
    }

    const etag = etagFor(document.body);
    const headers = discoveryHeaders(document.mediaType, etag);

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method Not Allowed', {
            status: 405,
            headers: { allow: 'GET, HEAD, OPTIONS' },
        });
    }
    if (request.headers.get('if-none-match') === etag) {
        return new Response(null, { status: 304, headers });
    }
    if (request.method === 'HEAD') {
        return new Response(null, { status: 200, headers });
    }
    return new Response(document.body, { status: 200, headers });
}

export const CANONICAL_MCP_URL = mcpUrl(PUBLIC_ORIGIN);
