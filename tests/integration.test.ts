// Integration tests

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import { handleTool } from '../src/tools/index.js';
import { handleResource } from '../src/resources.js';
import { RESOURCE_URIS, RS3_GE_API } from '../src/constants.js';

describe('Integration Tests', () => {
    beforeEach(() => {
        nock.cleanAll();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    describe('Tool Integration', () => {
        it('should resolve name then fetch price', async () => {
            nock('https://api.weirdgloop.org')
                .get('/exchange/history/rs/latest')
                .query({ name: 'Abyssal whip' })
                .reply(200, {
                    'Abyssal whip': { id: '4151', price: 80797, volume: 10 },
                });

            nock(RS3_GE_API)
                .get('/catalogue/detail.json?item=4151')
                .reply(200, {
                    item: {
                        id: 4151,
                        name: 'Abyssal whip',
                        current: { price: '80k' },
                    },
                });

            const lookup = await handleTool('lookup_item', { query: 'Abyssal whip' });
            expect(lookup.content[0].text).toContain('4151');

            const price = await handleTool('get_item_price', { name: 'Abyssal whip' });
            expect(price.content[0].text).toContain('Abyssal whip');
        });

        it('should handle graph workflow', async () => {
            nock(RS3_GE_API)
                .get('/graph/4151.json')
                .reply(200, { daily: { '1640995200000': 2400000 } });

            const graph = await handleTool('get_item_graph', { itemId: 4151 });
            expect(graph.content[0].text).toContain('Price Graph');
        });
    });

    describe('Resource Integration', () => {
        it('should read GE info resource', async () => {
            nock(RS3_GE_API)
                .get('/info.json')
                .reply(200, { lastConfigUpdateRuneday: 8526 });

            const info = await handleResource({
                params: { uri: RESOURCE_URIS.GE_INFO },
            } as never);

            expect(info.contents[0].text).toContain('lastConfigUpdateRuneday');
        });

        it('should read categories resource without network', async () => {
            const categories = await handleResource({
                params: { uri: RESOURCE_URIS.GE_CATEGORIES },
            } as never);

            expect(categories.contents[0].text).toContain('Necromancy armour');
        });
    });

    describe('Error Recovery', () => {
        it('should convert API failures to isError via server path is separate; handlers throw', async () => {
            nock(RS3_GE_API)
                .get('/catalogue/detail.json?item=999999')
                .reply(404, { error: 'Item not found' });

            await expect(handleTool('get_item_price', { itemId: 999999 })).rejects.toThrow(
                'API request failed: 404'
            );
        });
    });
});
