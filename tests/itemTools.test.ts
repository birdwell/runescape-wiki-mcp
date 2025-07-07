// Tests for item tools

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import { handleItemTool } from '../src/tools/itemTools.js';
import { RS_GE_API, RS3_PRICES_API } from '../src/constants.js';

describe('Item Tools', () => {
    beforeEach(() => {
        nock.cleanAll();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    describe('get_item_detail', () => {
        it('should get item details from official API', async () => {
            nock(RS_GE_API)
                .get('/catalogue/detail.json?item=4151')
                .reply(200, {
                    item: {
                        id: 4151,
                        name: 'Abyssal whip',
                        description: 'A weapon from the Abyss.',
                        current: { price: '75k' }
                    }
                });

            const result = await handleItemTool('get_item_detail', { itemId: 4151 });

            expect(result.content).toBeDefined();
            expect(result.content[0].text).toContain('Item Detail for 4151');
            expect(result.content[0].text).toContain('Abyssal whip');
        });
    });

    describe('get_item_graph', () => {
        it('should get price graph data', async () => {
            nock(RS_GE_API)
                .get('/graph/4151.json')
                .reply(200, {
                    daily: {
                        '1640995200000': 2400000,
                        '1641081600000': 2390000
                    }
                });

            const result = await handleItemTool('get_item_graph', { itemId: 4151 });

            expect(result.content).toBeDefined();
            expect(result.content[0].text).toContain('Price Graph for Item 4151');
        });
    });

    describe('browse_items_by_category', () => {
        it('should browse items by category', async () => {
            nock(RS_GE_API)
                .get('/catalogue/items.json?category=1&alpha=a&page=1')
                .reply(200, {
                    items: [
                        { id: 1, name: 'Item 1' },
                        { id: 2, name: 'Item 2' }
                    ]
                });

            const result = await handleItemTool('browse_items_by_category', {
                category: 1,
                alpha: 'a',
                page: 1
            });

            expect(result.content).toBeDefined();
            expect(result.content[0].text).toContain('Items in Category 1 (a, Page 1)');
        });
    });

    describe('get_ge_info', () => {
        it('should get Grand Exchange info', async () => {
            nock(RS_GE_API)
                .get('/info.json')
                .reply(200, {
                    lastConfigUpdateRuneday: 8526
                });

            const result = await handleItemTool('get_ge_info', {});

            expect(result.content).toBeDefined();
            expect(result.content[0].text).toContain('Grand Exchange Database Information');
            expect(result.content[0].text).toContain('lastConfigUpdateRuneday');
        });
    });

    describe('Error handling', () => {
        it('should handle API errors', async () => {
            nock(RS_GE_API)
                .get('/catalogue/detail.json?item=999999')
                .reply(404, { error: 'Item not found' });

            await expect(handleItemTool('get_item_detail', { itemId: 999999 }))
                .rejects.toThrow('API request failed: 404');
        });

        it('should handle unknown tool', async () => {
            await expect(handleItemTool('unknown_tool', {}))
                .rejects.toThrow('Unknown item tool: unknown_tool');
        });
    });
}); 