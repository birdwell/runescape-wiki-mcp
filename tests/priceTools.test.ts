// Tests for price tools

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import { handlePriceTool } from '../src/tools/priceTools.js';
import { RS3_GE_API } from '../src/constants.js';

describe('Price Tools', () => {
    beforeEach(() => {
        nock.cleanAll();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    describe('get_item_price', () => {
        it('should get price details for a specific item', async () => {
            nock(RS3_GE_API)
                .get('/catalogue/detail.json?item=4151')
                .reply(200, {
                    item: {
                        id: 4151,
                        name: 'Abyssal whip',
                        current: { price: 75000 },
                    },
                });

            const result = await handlePriceTool('get_item_price', { itemId: 4151 });
            expect(result.content[0].text).toContain('Item Detail for 4151');
            expect(result.content[0].text).toContain('Abyssal whip');
        });

        it('should resolve name to id then fetch detail', async () => {
            nock('https://api.weirdgloop.org')
                .get('/exchange/history/rs/latest')
                .query({ name: 'Abyssal whip' })
                .reply(200, {
                    'Abyssal whip': { id: '4151', price: 80797, volume: 1 },
                });

            nock(RS3_GE_API)
                .get('/catalogue/detail.json?item=4151')
                .reply(200, {
                    item: { id: 4151, name: 'Abyssal whip', current: { price: '80k' } },
                });

            const result = await handlePriceTool('get_item_price', { name: 'Abyssal whip' });
            expect(result.content[0].text).toContain('Abyssal whip');
        });

        it('should reject category above maximum', async () => {
            const result = await handlePriceTool('get_category_info', { category: 9999 });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('at most 43');
        });
    });

    describe('get_ge_info', () => {
        it('should get Grand Exchange database information', async () => {
            nock(RS3_GE_API)
                .get('/info.json')
                .reply(200, { lastConfigUpdateRuneday: 8526 });

            const result = await handlePriceTool('get_ge_info', {});
            expect(result.content[0].text).toContain('lastConfigUpdateRuneday');
        });
    });

    describe('browse_items', () => {
        it('should browse items by category and alpha', async () => {
            nock(RS3_GE_API)
                .get('/catalogue/items.json?category=1&alpha=a&page=1')
                .reply(200, { items: [{ id: 1, name: 'Abyssal whip' }] });

            const result = await handlePriceTool('browse_items', {
                category: 1,
                alpha: 'a',
                page: 1,
            });

            expect(result.content[0].text).toContain('Items in Category 1 starting with "a"');
        });

        it('should encode # for numbers', async () => {
            nock(RS3_GE_API)
                .get('/catalogue/items.json?category=1&alpha=%23&page=1')
                .reply(200, { items: [] });

            const result = await handlePriceTool('browse_items', {
                category: 1,
                alpha: '#',
            });

            expect(result.content[0].text).toContain('starting with "#"');
        });

        it('should default alpha to a', async () => {
            nock(RS3_GE_API)
                .get('/catalogue/items.json?category=24&alpha=a&page=1')
                .reply(200, { items: [] });

            const result = await handlePriceTool('browse_items', { category: 24 });
            expect(result.isError).toBeFalsy();
        });

        it('should reject invalid alpha', async () => {
            const result = await handlePriceTool('browse_items', {
                category: 1,
                alpha: 'abcdef',
            });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('at most 1');
        });

        it('should reject unexpected arguments', async () => {
            const result = await handlePriceTool('browse_items', {
                category: 1,
                query: 'whip',
            });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Unexpected argument');
        });
    });
});
