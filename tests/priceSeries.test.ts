import { describe, it, expect, afterEach } from '@jest/globals';
import nock from 'nock';
import { handleItemTool } from '../src/tools/itemTools.js';

const midnight = Date.parse('2026-10-20T00:00:00Z');
function history(rows: unknown) {
    return nock('https://api.weirdgloop.org').get('/exchange/history/rs/last90d')
        .query({ id: '4151' }).reply(200, { '4151': rows });
}
afterEach(() => nock.cleanAll());
describe('Raw Weirdgloop observations', () => {
    it('sorts real millisecond timestamps, retains zero volume and omits unreported volume', async () => {
        const request = history([
            { timestamp: midnight + 1000, price: 120, volume: -1 },
            { timestamp: midnight, price: 100, volume: 0 },
            { timestamp: 'invalid', price: 999 }, { timestamp: midnight, price: -1 },
        ]);
        const result = await handleItemTool('get_item_graph', { itemId: 4151, source: 'weirdgloop' });
        expect(request.isDone()).toBe(true);
        expect(result.structuredContent).toEqual({ itemId: 4151, source: 'weirdgloop', samples: [
            { timestamp: midnight, price: 100, volume: 0 }, { timestamp: midnight + 1000, price: 120 },
        ] });
    });
    it('applies inclusive UTC days while excluding the following midnight', async () => {
        history([-1, 0, 86399999, 86400000].map(offset => ({ timestamp: midnight + offset, price: 100 })));
        const result = await handleItemTool('get_item_graph', { itemId: 4151, source: 'weirdgloop', from: '2026-10-20', to: '2026-10-20' });
        expect(result.structuredContent?.samples).toEqual([
            { timestamp: midnight, price: 100 }, { timestamp: midnight + 86399999, price: 100 },
        ]);
    });
    it('returns an empty series for unavailable dates without switching providers', async () => {
        history([{ timestamp: midnight, price: 100 }]);
        const result = await handleItemTool('get_item_graph', { itemId: 4151, source: 'weirdgloop', from: '2027-01-01' });
        expect(result.structuredContent).toEqual({ itemId: 4151, source: 'weirdgloop', samples: [] });
    });
    it('accepts an empty provider series', async () => {
        history([]);
        expect((await handleItemTool('get_item_graph', { itemId: 4151, source: 'weirdgloop' })).structuredContent?.samples).toEqual([]);
    });
    it.each([null, 'latest', 1])('rejects invalid source %s before any request', async source => {
        const result = await handleItemTool('get_item_graph', { name: 'Abyssal whip', source });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('source must be');
    });
    it('fails on malformed history instead of inventing observations', async () => {
        history([{ timestamp: 'bad', price: 100 }]);
        await expect(handleItemTool('get_item_graph', { itemId: 4151, source: 'weirdgloop' })).rejects.toThrow('no valid timestamped');
    });
    it('does not fall back to Jagex after a Weirdgloop error', async () => {
        nock('https://api.weirdgloop.org').get('/exchange/history/rs/last90d').query(true).reply(503);
        await expect(handleItemTool('get_item_graph', { itemId: 4151, source: 'weirdgloop' })).rejects.toThrow();
    });
});
