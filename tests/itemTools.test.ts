// Tests for item tools

import nock from 'nock';
import { handleItemTool } from '../src/tools/itemTools.js';
import { mockResponses, validateToolResponse } from './testUtils.js';

describe('Item Tools', () => {

    beforeEach(() => {
        nock.cleanAll();
    });

    afterAll(() => {
        nock.restore();
    });

    describe('get_item_mapping', () => {
        it('should get item mapping', async () => {
            nock('https://prices.runescape.wiki')
                .get('/api/v1/rs/mapping')
                .reply(200, mockResponses.itemMapping);

            const response = await handleItemTool('get_item_mapping', {});

            validateToolResponse(response);
            expect(response.content[0].text).toContain('Item Mapping');
            expect(response.content[0].text).toContain('Abyssal whip');
        });

        it('should handle API errors', async () => {
            nock('https://prices.runescape.wiki')
                .get('/api/v1/rs/mapping')
                .reply(500, 'Internal Server Error');

            await expect(handleItemTool('get_item_mapping', {}))
                .rejects.toThrow('API request failed: 500');
        });
    });

    describe('get_item_detail', () => {
        it('should get item details', async () => {
            nock('https://services.runescape.com')
                .get('/m=itemdb_rs/api/catalogue/detail.json?item=4151')
                .reply(200, mockResponses.itemDetail);

            const response = await handleItemTool('get_item_detail', { itemId: 4151 });

            validateToolResponse(response);
            expect(response.content[0].text).toContain('Item Detail for 4151');
            expect(response.content[0].text).toContain('Abyssal whip');
        });

        it('should require itemId parameter', async () => {
            await expect(handleItemTool('get_item_detail', {}))
                .rejects.toThrow();
        });
    });

    describe('get_item_graph', () => {
        it('should get price graph data', async () => {
            const mockGraphData = {
                daily: { "1640995200000": 2400000 },
                average: { "1640995200000": 2380000 }
            };

            nock('https://services.runescape.com')
                .get('/m=itemdb_rs/api/graph/4151.json')
                .reply(200, mockGraphData);

            const response = await handleItemTool('get_item_graph', { itemId: 4151 });

            validateToolResponse(response);
            expect(response.content[0].text).toContain('Price Graph for Item 4151');
        });
    });

    describe('browse_items_by_category', () => {
        it('should browse items by category', async () => {
            const mockCategoryData = {
                total: 10,
                items: [mockResponses.itemDetail.item]
            };

            nock('https://services.runescape.com')
                .get('/m=itemdb_rs/api/catalogue/items.json?category=24&alpha=a&page=1')
                .reply(200, mockCategoryData);

            const response = await handleItemTool('browse_items_by_category', { category: 24 });

            validateToolResponse(response);
            expect(response.content[0].text).toContain('Items in Category 24');
        });

        it('should accept custom alpha and page parameters', async () => {
            const mockCategoryData = { total: 0, items: [] };

            nock('https://services.runescape.com')
                .get('/m=itemdb_rs/api/catalogue/items.json?category=24&alpha=z&page=5')
                .reply(200, mockCategoryData);

            const response = await handleItemTool('browse_items_by_category', {
                category: 24,
                alpha: 'z',
                page: 5
            });

            validateToolResponse(response);
            expect(response.content[0].text).toContain('Items in Category 24 (z, Page 5)');
        });
    });

    describe('get_ge_info', () => {
        it('should get Grand Exchange info', async () => {
            nock('https://services.runescape.com')
                .get('/m=itemdb_rs/api/info.json')
                .reply(200, mockResponses.geInfo);

            const response = await handleItemTool('get_ge_info', {});

            validateToolResponse(response);
            expect(response.content[0].text).toContain('Grand Exchange Database Information');
        });
    });

    it('should throw error for unknown tool', async () => {
        await expect(handleItemTool('unknown_tool', {}))
            .rejects.toThrow('Unknown item tool: unknown_tool');
    });
}); 