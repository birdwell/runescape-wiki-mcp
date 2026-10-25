// Tests for item tools

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import { handleItemTool } from '../src/tools/itemTools.js';
import { RS3_GE_API, WEIRDGLOOP_EXCHANGE_API } from '../src/constants.js';

describe('Item Tools', () => {
    beforeEach(() => {
        nock.cleanAll();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    describe('lookup_item', () => {
        it('should resolve an exact item name', async () => {
            nock('https://api.weirdgloop.org')
                .get('/exchange/history/rs/latest')
                .query({ name: 'Abyssal whip' })
                .reply(200, {
                    'Abyssal whip': {
                        id: '4151',
                        price: 80797,
                        volume: 1436,
                        timestamp: '2026-07-29T14:10:28.000Z',
                    },
                });

            const result = await handleItemTool('lookup_item', { query: 'Abyssal whip' });
            expect(result.isError).toBeFalsy();
            expect(result.content[0].text).toContain('4151');
            expect(result.content[0].text).toContain('Abyssal whip');
            expect(result.content[0].text).toContain('80797');
            expect(result.structuredContent).toMatchObject({
                matches: [{ id: 4151, name: 'Abyssal whip', price: 80797 }],
            });
        });

        it('should fall back to wiki opensearch when exact match fails', async () => {
            nock('https://api.weirdgloop.org')
                .get('/exchange/history/rs/latest')
                .query({ name: 'abyssal whi' })
                .reply(200, { success: false, error: 'Item(s) not found in the database' });

            nock('https://runescape.wiki')
                .get('/api.php')
                .query(true)
                .reply(200, [
                    'abyssal whi',
                    ['Abyssal whip'],
                    [''],
                    ['https://runescape.wiki/w/Abyssal_whip'],
                ]);

            nock('https://api.weirdgloop.org')
                .get('/exchange/history/rs/latest')
                .query({ name: 'Abyssal whip' })
                .reply(200, {
                    'Abyssal whip': { id: '4151', price: 80797, volume: 10 },
                });

            const result = await handleItemTool('lookup_item', { query: 'abyssal whi' });
            expect(result.isError).toBeFalsy();
            expect(result.content[0].text).toContain('4151');
        });

        it('should require query', async () => {
            const result = await handleItemTool('lookup_item', {});
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toBe('query is required');
        });
    });

    describe('get_item_graph', () => {
        it('should get price graph data by itemId', async () => {
            nock(RS3_GE_API)
                .get('/graph/4151.json')
                .reply(200, {
                    daily: {
                        '1640995200000': 2400000,
                    },
                });

            const result = await handleItemTool('get_item_graph', { itemId: 4151 });
            expect(result.content[0].text).toContain('Price Graph for Item 4151');
        });

        it.each([
            [{ from: '2026-10-02', to: '2026-10-02' }, [1, 2]],
            [{ from: '2026-10-02' }, [1, 2, 3]],
            [{ to: '2026-10-02' }, [0, 1, 2]],
            [{ from: '2020-01-01', to: '2020-01-02' }, []],
        ])('filters daily and average maps by inclusive UTC days: %j', async (bounds, selected) => {
            const timestamps = ['2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z',
                '2026-10-02T23:59:59.999Z', '2026-10-03T00:00:00Z'].map(value => String(Date.parse(value)));
            const daily = Object.fromEntries(timestamps.map((key, index) => [key, 100 + index]));
            const average = Object.fromEntries(timestamps.map((key, index) => [key, 200 + index]));
            nock(RS3_GE_API).get('/graph/4151.json').reply(200, { daily, average, source: 'fixture' });
            const result = await handleItemTool('get_item_graph', { itemId: 4151, ...bounds });
            expect(result.isError).toBeFalsy();
            expect(result.structuredContent).toEqual({
                daily: Object.fromEntries(selected.map(i => [timestamps[i], daily[timestamps[i]]])),
                average: Object.fromEntries(selected.map(i => [timestamps[i], average[timestamps[i]]])),
                source: 'fixture',
            });
        });

        it.each([
            { from: '2026-02-30' }, { from: 'not-a-date' }, { to: '2026-10-01T00:00:00Z' },
            { from: null }, { from: '2026-10-03', to: '2026-10-02' },
        ])('rejects invalid date bounds before requesting upstream data: %j', async bounds => {
            const result = await handleItemTool('get_item_graph', { itemId: 4151, ...bounds });
            expect(result.isError).toBe(true);
        });

        it('should resolve name then fetch graph', async () => {
            nock('https://api.weirdgloop.org')
                .get('/exchange/history/rs/latest')
                .query({ name: 'Abyssal whip' })
                .reply(200, {
                    'Abyssal whip': { id: '4151', price: 1, volume: 1 },
                });

            nock(RS3_GE_API)
                .get('/graph/4151.json')
                .reply(200, { daily: {}, average: {} });

            const result = await handleItemTool('get_item_graph', { name: 'Abyssal whip' });
            expect(result.content[0].text).toContain('Price Graph for Item 4151');
        });
    });

    describe('Error handling', () => {
        it('should handle API errors', async () => {
            nock(RS3_GE_API).get('/graph/999999.json').reply(404, { error: 'Item not found' });

            await expect(handleItemTool('get_item_graph', { itemId: 999999 })).rejects.toThrow(
                'API request failed: 404'
            );
        });

        it('should require itemId or name for graph', async () => {
            const result = await handleItemTool('get_item_graph', {});
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Either itemId or name is required');
        });

        it('should handle unknown tool', async () => {
            await expect(handleItemTool('unknown_tool', {})).rejects.toThrow(
                'Unknown item tool: unknown_tool'
            );
        });
    });

    it('keeps Weirdgloop constant available for nock hosts', () => {
        expect(WEIRDGLOOP_EXCHANGE_API).toContain('weirdgloop.org');
    });
});
