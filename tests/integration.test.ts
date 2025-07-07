// Integration tests

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import { handleTool } from '../src/tools/index.js';
import { handleResource } from '../src/resources.js';
import { RESOURCE_URIS, RS3_PRICES_API, RS_GE_API } from '../src/constants.js';

describe('Integration Tests', () => {
    beforeEach(() => {
        nock.cleanAll();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    describe('Tool Integration', () => {
        it('should handle price tool workflow', async () => {
            // Mock get_item_price
            nock(RS3_PRICES_API)
                .get('/catalogue/detail.json?item=4151')
                .reply(200, {
                    item: {
                        id: 4151,
                        name: 'Abyssal whip',
                        current: { price: '75k' }
                    }
                });

            const priceResult = await handleTool('get_item_price', { itemId: 4151 });
            expect(priceResult.content[0].text).toContain('Abyssal whip');

            // Mock get_ge_info
            nock(RS3_PRICES_API)
                .get('/info.json')
                .reply(200, {
                    lastConfigUpdateRuneday: 8526
                });

            const infoResult = await handleTool('get_ge_info', {});
            expect(infoResult.content[0].text).toContain('lastConfigUpdateRuneday');
        });

        it('should handle item tool workflow', async () => {
            // Mock item detail
            nock(RS_GE_API)
                .get('/catalogue/detail.json?item=4151')
                .reply(200, {
                    item: {
                        id: 4151,
                        name: 'Abyssal whip',
                        description: 'A weapon from the Abyss.'
                    }
                });

            const detailResult = await handleTool('get_item_detail', { itemId: 4151 });
            expect(detailResult.content[0].text).toContain('Abyssal whip');

            // Mock price graph
            nock(RS_GE_API)
                .get('/graph/4151.json')
                .reply(200, {
                    daily: {
                        '1640995200000': 2400000
                    }
                });

            const graphResult = await handleTool('get_item_graph', { itemId: 4151 });
            expect(graphResult.content[0].text).toContain('Price Graph');
        });
    });

    describe('Resource Integration', () => {
        it('should read latest prices resource', async () => {
            nock(RS3_PRICES_API)
                .get('/info.json')
                .reply(200, {
                    lastConfigUpdateRuneday: 8526
                });

            const prices = await handleResource({
                params: { uri: RESOURCE_URIS.LATEST_PRICES }
            } as any);

            expect(prices.contents).toHaveLength(1);
            expect(prices.contents[0].text).toContain('lastConfigUpdateRuneday');
        });

        it('should read item mapping resource', async () => {
            nock(RS3_PRICES_API)
                .get('/catalogue/category.json?category=1')
                .reply(200, {
                    types: [],
                    alpha: [
                        { letter: 'a', items: 6 }
                    ]
                });

            const mapping = await handleResource({
                params: { uri: RESOURCE_URIS.ITEM_MAPPING }
            } as any);

            expect(mapping.contents).toHaveLength(1);
            expect(mapping.contents[0].text).toContain('alpha');
        });
    });

    describe('Error Recovery', () => {
        it('should handle API failures gracefully', async () => {
            nock(RS3_PRICES_API)
                .get('/catalogue/detail.json?item=999999')
                .reply(404, { error: 'Item not found' });

            await expect(handleTool('get_item_price', { itemId: 999999 }))
                .rejects.toThrow('API request failed: 404');
        });

        it('should handle network errors', async () => {
            nock(RS3_PRICES_API)
                .get('/info.json')
                .replyWithError({ code: 'ECONNREFUSED' });

            await expect(handleTool('get_ge_info', {}))
                .rejects.toThrow();
        });
    });
}); 