import { describe, it, expect, afterEach } from '@jest/globals';
import nock from 'nock';
import { createLiveItemReader } from '../src/livePrices.js';
import { handlePriceTool } from '../src/tools/priceTools.js';
import { ApiRequestError } from '../src/utils.js';

const base = 'https://prices.runescape.wiki/api/v2/rs';
const instant = Date.parse('2026-10-25T08:00:00Z');
const trade = { high: 4_294_967_296, highTime: 1792915000, low: 72810, lowTime: 1792914000 };
const mapped = [{ id: 4151, limit: 10, highalch: 72000, lowalch: 48000, value: 120001,
    examine: 'UNREVIEWED_MAPPING_PROSE', name: 'UNREVIEWED_NAME', icon: 'UNREVIEWED_IMAGE' }];
afterEach(() => nock.cleanAll());

describe('RS3 API v2 opt-in data', () => {
    it('retains prices above 32 bits, seconds timestamps and only whitelisted numeric facts', async () => {
        const read = createLiveItemReader(async url => url.endsWith('/mapping') ? mapped : { data: { '4151': trade } }, () => instant);
        const result = await read(4151);
        expect(result.liveTrades).toEqual({ ...trade, sourceUrl: 'https://prices.runescape.wiki/rs/item/4151', fetchedAt: new Date(instant).toISOString() });
        expect(result.wikiFacts).toMatchObject({ buyLimit: 10, highAlchemy: 72000, lowAlchemy: 48000, value: 120001 });
        expect(JSON.stringify(result)).not.toContain('UNREVIEWED_');
    });
    it('coalesces mapping and same-item quote reads, then expires each at its own TTL', async () => {
        let clock = instant, mappingReads = 0, quoteReads = 0;
        const read = createLiveItemReader(async url => {
            if (url.endsWith('/mapping')) { mappingReads++; return mapped; }
            quoteReads++; return { data: { '4151': trade } };
        }, () => clock);
        const [first, same] = await Promise.all([read(4151), read(4151)]);
        expect({ mappingReads, quoteReads }).toEqual({ mappingReads: 1, quoteReads: 1 });
        first.liveTrades.high = 1;
        expect((await read(4151)).liveTrades.high).toBe(trade.high);
        clock += 30_000;
        const later = await read(4151);
        expect(later.liveTrades.fetchedAt).not.toBe(same.liveTrades.fetchedAt);
        expect(later.wikiFacts?.fetchedAt).toBe(same.wikiFacts?.fetchedAt);
        expect({ mappingReads, quoteReads }).toEqual({ mappingReads: 1, quoteReads: 2 });
        clock = instant + 600_000;
        await read(4151);
        expect({ mappingReads, quoteReads }).toEqual({ mappingReads: 2, quoteReads: 3 });
    });
    it('never invents a guide-price fallback when no trade or mapping was reported', async () => {
        const read = createLiveItemReader(async url => url.endsWith('/mapping') ? [] : { data: {} }, () => instant);
        const result = await read(4151);
        expect(result.liveTrades).toMatchObject({ high: null, highTime: null, low: null, lowTime: null });
        expect(result.wikiFacts).toBeNull();
    });
    it('retains a valid side when the other side has never traded', async () => {
        const read = createLiveItemReader(async url => url.endsWith('/mapping') ? mapped : {
            data: { '4151': { ...trade, low: null, lowTime: null } },
        });
        expect((await read(4151)).liveTrades).toMatchObject({ high: trade.high, low: null, lowTime: null });
    });
    it('does not cache failures or hide an upstream 429', async () => {
        let calls = 0;
        const limited = new ApiRequestError(429, 'Too Many Requests', '12');
        const read = createLiveItemReader(async url => {
            if (url.endsWith('/mapping')) return mapped;
            if (++calls === 1) throw limited;
            return { data: { '4151': trade } };
        });
        await expect(read(4151)).rejects.toBe(limited);
        expect((await read(4151)).liveTrades.high).toBe(trade.high);
        expect(calls).toBe(2);
    });
    it.each([
        { ...trade, high: -1 }, { ...trade, high: Number.MAX_SAFE_INTEGER + 1 },
        { ...trade, highTime: '1792915000' }, { ...trade, high: null },
    ])('rejects malformed pairs or unsafe precision rather than manufacturing prices', async bad => {
        const read = createLiveItemReader(async url => url.endsWith('/mapping') ? mapped : { data: { '4151': bad } });
        await expect(read(4151)).rejects.toThrow('invalid price/timestamp pair');
    });
    it('rejects malformed mapping payloads', async () => {
        const read = createLiveItemReader(async () => ({ error: 'unavailable' }));
        await expect(read(4151)).rejects.toThrow('mapping returned an invalid');
    });
    it('keeps simultaneous distinct-item reads at two upstream calls', async () => {
        let active = 0, peak = 0, mappingReads = 0;
        const read = createLiveItemReader(async url => {
            active++; peak = Math.max(peak, active);
            await new Promise(resolve => setTimeout(resolve, 5));
            active--;
            if (url.endsWith('/mapping')) { mappingReads++; return mapped; }
            const id = new URL(url).searchParams.get('id')!;
            return { data: { [id]: trade } };
        });
        await Promise.all([read(4151), read(536)]);
        expect(mappingReads).toBe(1);
        expect(peak).toBe(2);
    });
    it('enriches single and batch records only when requested, sharing one mapping read', async () => {
        const ids = [4151, 536, 18832];
        const mapping = nock('https://prices.runescape.wiki').get('/api/v2/rs/mapping')
            .matchHeader('User-Agent', /RuneScape Wiki MCP Server/)
            .reply(200, ids.map(id => ({ ...mapped[0], id })));
        for (const id of ids) {
            nock('https://secure.runescape.com').get('/m=itemdb_rs/api/catalogue/detail.json').query({ item: String(id) })
                .reply(200, { item: { id, name: 'Fixture', current: { price: '80k' } } });
            nock('https://prices.runescape.wiki').get('/api/v2/rs/latest').query({ id: String(id) })
                .reply(200, { data: { [id]: trade } });
        }
        const single = await handlePriceTool('get_item_price', { itemId: 4151, includeLiveData: true });
        expect(single.structuredContent).toMatchObject({ item: { current: { price: '80k' }, liveTrades: { high: trade.high }, wikiFacts: { buyLimit: 10 } } });
        const batch = await handlePriceTool('get_item_price', { itemIds: [536, 18832], includeLiveData: true });
        expect(batch.structuredContent).toMatchObject({ succeeded: 2, failed: 0, results: [
            { query: 536, data: { item: { liveTrades: { high: trade.high } } } },
            { query: 18832, data: { item: { liveTrades: { high: trade.high } } } },
        ] });
        expect(mapping.isDone()).toBe(true);
        expect(nock.isDone()).toBe(true);
        expect(JSON.stringify([single, batch])).not.toContain('UNREVIEWED_');
        nock('https://secure.runescape.com').get('/m=itemdb_rs/api/catalogue/detail.json').query({ item: '4151' })
            .reply(200, { item: { id: 4151 } });
        const guideOnly = await handlePriceTool('get_item_price', { itemId: 4151 });
        expect(guideOnly.structuredContent?.item).not.toHaveProperty('liveTrades');
        expect(guideOnly.structuredContent?.item).not.toHaveProperty('wikiFacts');
    });
    it.each([null, 'true', 1])('rejects a nonboolean enrichment flag before lookup', async includeLiveData => {
        const result = await handlePriceTool('get_item_price', { name: 'Abyssal whip', includeLiveData });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('includeLiveData must be a boolean');
    });
});
