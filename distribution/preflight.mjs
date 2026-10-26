// Read-only transport checks. These do not test a model's response in a chat client.
// Run explicitly: node distribution/preflight.mjs > /tmp/rs3-preflight.json
import assert from 'node:assert/strict';

const endpoint = 'https://runescape-wiki-mcp.fly.dev/mcp';
const report = { checkedAt: new Date().toISOString(), endpoint, checks: [] };
let id = 0;

async function rpc(method, params) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            'MCP-Protocol-Version': '2025-03-26',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
        signal: AbortSignal.timeout(30000),
    });
    assert.equal(response.status, 200, `${method}: HTTP ${response.status}`);
    const body = await response.text();
    const messages = response.headers.get('content-type')?.includes('text/event-stream')
        ? body.split(/\r?\n/).filter(line => line.startsWith('data:'))
            .map(line => JSON.parse(line.slice(5).trim()))
        : [JSON.parse(body)];
    const message = messages.find(value => value.id === id);
    assert(message, `${method}: missing response`);
    assert(!message.error, `${method}: ${message.error?.message}`);
    return message.result;
}

async function call(name, args, expectedError = false) {
    const result = await rpc('tools/call', { name, arguments: args });
    assert.equal(Boolean(result.isError), expectedError, `${name}: unexpected isError`);
    return result;
}

async function check(name, run) {
    try {
        const detail = await run();
        report.checks.push({ name, passed: true, ...(detail ? { detail } : {}) });
    } catch (error) {
        report.checks.push({ name, passed: false, error: error.message });
    }
}

let whipId;
await check('Discovery and read-only annotations', async () => {
    const result = await rpc('tools/list', {});
    report.toolNames = result.tools.map(tool => tool.name);
    for (const tool of result.tools) {
        assert.equal(tool.annotations?.readOnlyHint, true, tool.name);
        assert.equal(tool.annotations?.destructiveHint, false, tool.name);
        assert.equal(tool.annotations?.openWorldHint, true, tool.name);
        assert.equal(typeof tool.annotations?.title, 'string', `${tool.name}: missing display title`);
    }
    assert.deepEqual([...report.toolNames].sort(), ['lookup_item','get_item_details','get_price_series','get_ge_info','browse_items','estimate_flip','get_player_stats','get_player_quests','recommend_next_activity','search_wiki','get_wiki_page_content','get_wiki_entity_facts','list_wiki_category_members','get_wiki_drop_table'].sort());
    return { tools: result.tools.map(tool => tool.name) };
});
await check('Item resolution and guide price', async () => {
    const lookup = await call('lookup_item', { query: 'Abyssal whip', limit: 1 });
    const match = lookup.structuredContent?.matches?.[0];
    assert(match?.name.toLowerCase() === 'abyssal whip');
    assert(Number.isInteger(match.id));
    whipId = match.id;
    const price = await call('get_item_details', { itemId: whipId });
    assert(price.structuredContent?.item?.current?.price !== undefined);
    return { itemId: whipId };
});
await check('Jagex graph', async () => {
    assert(Number.isInteger(whipId), 'Item lookup did not resolve');
    const result = await call('get_price_series', { itemId: whipId });
    assert(Object.keys(result.structuredContent?.daily ?? {}).length > 0);
});
await check('GE metadata, categories and catalogue', async () => {
    for (const [name, args] of [
        ['get_ge_info', {}], ['get_ge_info', { view: 'categories' }],
        ['get_ge_info', { view: 'category_counts', category: 0 }],
        ['browse_items', { category: 0, alpha: 'a', page: 1 }],
    ]) {
        const result = await call(name, args);
        assert(result.content?.length, `${name}: empty result`);
    }
});
await check('Seven-day history summary', async () => {
    assert(Number.isInteger(whipId), 'Item lookup did not resolve');
    const result = await call('get_price_series', { itemId: whipId, view: 'statistics', days: 7 });
    assert(result.structuredContent && result.content?.length);
});
await check('Comparison and hypothetical flip arithmetic', async () => {
    const ids = [];
    for (const query of ['Dragon bones', 'Frost dragon bones']) {
        const lookup = await call('lookup_item', { query, limit: 1 });
        const id = lookup.structuredContent?.matches?.[0]?.id;
        assert(Number.isInteger(id), `${query}: item not resolved`);
        ids.push(id);
    }
    const comparison = await call('get_item_details', { view: 'comparison', itemIds: ids });
    const rows = comparison.structuredContent?.rows;
    assert.equal(rows?.length, 2);
    assert(rows.every(row => !row.error && Number.isInteger(row.id)));
    assert.deepEqual(rows.map(row => row.id), ids, 'Comparison changed candidate order or IDs');
    const bones = rows.find(row => row.id === ids[0]);
    assert(bones, 'Resolved Dragon bones ID absent from comparison');
    const flip = await call('estimate_flip', {
        itemId: bones.id, buyPrice: 100, sellPrice: 120, quantity: 10,
    });
    assert.equal(flip.structuredContent?.netProfit, 180);
});
await check('Normal-mode hiscores', async () => {
    const result = await call('get_player_stats', { username: 'Zezima', gameMode: 'normal' });
    assert(result.content?.length);
    // Do not save a player's returned stats in the report.
});
await check('Wiki search and content', async () => {
    const search = await call('search_wiki', { query: 'Abyssal whip', limit: 1 });
    const page = search.structuredContent?.results?.[0];
    assert(page?.title && page.url.startsWith('https://runescape.wiki/'));
    const result = await call('get_wiki_page_content', { page: page.title });
    assert.equal(result.structuredContent?.contentStatus, 'link_only');
    assert.equal(result.structuredContent?.text, null);
    assert.equal(result.structuredContent?.attribution?.license, null);
    assert(result.structuredContent?.attribution?.sourceUrl.startsWith('https://runescape.wiki/'));
});
await check('Wiki content by exact title', async () => {
    const result = await call('get_wiki_page_content', { page: 'Abyssal whip' });
    assert.equal(result.structuredContent?.contentStatus, 'link_only');
    assert.equal(result.structuredContent?.text, null);
    assert.equal(result.structuredContent?.attribution?.license, null);
    assert(result.structuredContent?.attribution?.sourceUrl.startsWith('https://runescape.wiki/'));
});
await check('Invalid input fails safely', async () => {
    await call('get_item_details', {}, true);
    await call('estimate_flip', { itemId: whipId, quantity: -1 }, true);
});

report.passed = report.checks.every(check => check.passed);
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
