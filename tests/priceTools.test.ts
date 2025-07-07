// Tests for price tools

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import { handlePriceTool } from '../src/tools/priceTools.js';
import { RS3_PRICES_API } from '../src/constants.js';

describe('Price Tools', () => {
    beforeEach(() => {
        nock.cleanAll();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    describe('get_item_price', () => {
        it('should get price details for a specific item', async () => {
            nock(RS3_PRICES_API)
                .get('/catalogue/detail.json?item=4151')
                .reply(200, {
                    item: {
                        id: 4151,
                        name: 'Abyssal whip',
                        current: { price: 75000 }
                    }
                });

            const result = await handlePriceTool('get_item_price', { itemId: 4151 });

            expect(result.content).toBeDefined();
            expect(result.content[0].text).toContain('Item Detail for 4151');
            expect(result.content[0].text).toContain('Abyssal whip');
        });
    });

    describe('get_ge_info', () => {
        it('should get Grand Exchange database information', async () => {
            nock(RS3_PRICES_API)
                .get('/info.json')
                .reply(200, {
                    lastConfigUpdateRuneday: 8526
                });

            const result = await handlePriceTool('get_ge_info', {});

            expect(result.content).toBeDefined();
            expect(result.content[0].text).toContain('Grand Exchange Database Information');
            expect(result.content[0].text).toContain('lastConfigUpdateRuneday');
        });
    });

    describe('get_category_info', () => {
        it('should get category information', async () => {
            nock(RS3_PRICES_API)
                .get('/catalogue/category.json?category=1')
                .reply(200, {
                    types: [],
                    alpha: [{ letter: 'a', items: 6 }]
                });

            const result = await handlePriceTool('get_category_info', { category: 1 });

            expect(result.content).toBeDefined();
            expect(result.content[0].text).toContain('Category 1 Information');
            expect(result.content[0].text).toContain('alpha');
        });
    });

    describe('search_items', () => {
        it('should search items by category and alpha', async () => {
            nock(RS3_PRICES_API)
                .get('/catalogue/items.json?category=1&alpha=a&page=1')
                .reply(200, {
                    items: [
                        { id: 1, name: 'Abyssal whip' }
                    ]
                });

            const result = await handlePriceTool('search_items', {
                category: 1,
                alpha: 'a',
                page: 1
            });

            expect(result.content).toBeDefined();
            expect(result.content[0].text).toContain('Items in Category 1 starting with "a"');
        });

        it('should handle # for numbers', async () => {
            nock(RS3_PRICES_API)
                .get('/catalogue/items.json?category=1&alpha=%23&page=1')
                .reply(200, {
                    items: []
                });

            const result = await handlePriceTool('search_items', {
                category: 1,
                alpha: '#',
                page: 1
            });

            expect(result.content).toBeDefined();
            expect(result.content[0].text).toContain('Items in Category 1 starting with "#"');
        });
    });
}); 