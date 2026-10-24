import { readFileSync } from 'node:fs';
import { describe, expect, it } from '@jest/globals';
import {
    PUBLIC_ORIGIN,
    REGISTRY_NAME,
    SERVER_CONFIG,
} from '../src/constants.js';
import {
    aiCatalog,
    handleDiscoveryRequest,
    serverCard,
    serverCardUrl,
} from '../src/discovery.js';
import { allTools } from '../src/tools/index.js';

describe('discovery documents', () => {
    it('keeps the package version and registry name aligned', () => {
        const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
            version: string;
            mcpName: string;
        };
        const serverJson = JSON.parse(readFileSync('server.json', 'utf8')) as {
            name: string;
            version: string;
            description: string;
            packages: Array<{ identifier: string; version: string }>;
        };

        expect(pkg.version).toBe(SERVER_CONFIG.version);
        expect(pkg.mcpName).toBe(REGISTRY_NAME);
        expect(serverJson.name).toBe(REGISTRY_NAME);
        expect(serverJson.packages[0]).toMatchObject({
            identifier: 'runescape-wiki-mcp',
            version: pkg.version,
        });
        expect(serverJson.description.length).toBeLessThanOrEqual(100);
        expect(SERVER_CONFIG.description.length).toBeLessThanOrEqual(100);
        expect(serverJson.description).toBe(SERVER_CONFIG.description);
        expect(serverJson.description.toLowerCase()).not.toContain('real-time');
    });

    it('publishes a server card for the canonical remote', () => {
        const card = serverCard(PUBLIC_ORIGIN);
        expect(card.name).toBe(REGISTRY_NAME);
        expect(card.remotes[0]).toMatchObject({
            type: 'streamable-http',
            url: 'https://runescape-wiki-mcp.fly.dev/mcp',
            supportedProtocolVersions: ['2026-07-28'],
        });
        expect(aiCatalog(PUBLIC_ORIGIN).entries[0].url).toBe(serverCardUrl(PUBLIC_ORIGIN));
    });

    it('serves the card and catalog with cache validators', async () => {
        const cardResponse = handleDiscoveryRequest(
            new Request('https://runescape-wiki-mcp.fly.dev/mcp/server-card')
        );
        expect(cardResponse?.status).toBe(200);
        expect(cardResponse?.headers.get('content-type')).toBe('application/mcp-server-card+json');
        expect(cardResponse?.headers.get('access-control-allow-origin')).toBe('*');

        const etag = cardResponse?.headers.get('etag');
        const cached = handleDiscoveryRequest(
            new Request('https://runescape-wiki-mcp.fly.dev/mcp/server-card', {
                headers: { 'if-none-match': etag ?? '' },
            })
        );
        expect(cached?.status).toBe(304);

        const catalog = handleDiscoveryRequest(
            new Request('https://runescape-wiki-mcp.fly.dev/.well-known/ai-catalog.json')
        );
        expect(catalog?.headers.get('content-type')).toBe('application/ai-catalog+json');
        expect(handleDiscoveryRequest(new Request('https://runescape-wiki-mcp.fly.dev/mcp'))).toBeUndefined();
    });

    it('marks every tool as a read-only open-world call', () => {
        expect(allTools.length).toBeGreaterThan(0);
        for (const tool of allTools) {
            expect(tool.annotations).toMatchObject({
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: true,
            });
        }
    });
});
