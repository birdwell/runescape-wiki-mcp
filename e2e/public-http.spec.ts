import { expect, test } from '@playwright/test';

test('public homepage and health respond', async ({ page, request }) => {
    const health = await request.get('/health');
    expect(health.ok()).toBeTruthy();
    expect(await health.json()).toEqual({ ok: true });

    await page.goto('/');
    await expect(page).toHaveTitle('RuneScape 3 MCP Server');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        "Ask what it's worth, whether the flip clears tax, and what to train next.",
    );
    await expect(page.getByRole('link', { name: 'GitHub' })).toBeVisible();
});

test('mcp discovery advertises the server', async ({ request }) => {
    const discovery = await request.post('/mcp', {
        headers: {
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
            'mcp-protocol-version': '2026-07-28',
            'mcp-method': 'server/discover',
        },
        data: {
            jsonrpc: '2.0',
            id: 1,
            method: 'server/discover',
            params: {
                _meta: {
                    'io.modelcontextprotocol/protocolVersion': '2026-07-28',
                    'io.modelcontextprotocol/clientInfo': { name: 'playwright-smoke', version: '1' },
                    'io.modelcontextprotocol/clientCapabilities': {},
                },
            },
        },
    });
    expect(discovery.ok()).toBeTruthy();
    const body = await discovery.text();
    const payload = JSON.parse(/^data: (.+)$/m.exec(body)?.[1] ?? body) as {
        id: number;
        error?: unknown;
        result?: unknown;
    };
    expect(payload.id).toBe(1);
    expect(payload.error).toBeUndefined();
    const serialized = JSON.stringify(payload.result);
    expect(serialized).toContain('runescape-wiki-mcp');
    expect(serialized).toContain('get_player_quests');
});
