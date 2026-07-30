// Tests for flip estimation tools

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import { flipTools, handleFlipTool, parseGuidePrice, salesTaxPerUnit } from '../src/tools/flipTools.js';
import { RS3_GE_API } from '../src/constants.js';

const WEIRDGLOOP_ORIGIN = 'https://api.weirdgloop.org';
const WEIRDGLOOP_PATH = '/exchange/history/rs/latest';

function payloadOf(text: string): any {
    return JSON.parse(text.slice(text.indexOf('{')));
}

describe('Flip Tools', () => {
    beforeEach(() => {
        nock.cleanAll();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    describe('tool definition', () => {
        it('should expose estimate_flip as a read-only tool with a strict schema', () => {
            const tool = flipTools.find(t => t.name === 'estimate_flip');
            expect(tool).toBeDefined();
            expect(tool?.annotations?.readOnlyHint).toBe(true);
            expect(tool?.description).toContain('ESTIMATE ONLY');

            const schema = tool?.inputSchema as any;
            expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
            expect(schema.additionalProperties).toBe(false);
            expect(Object.keys(schema.properties).sort()).toEqual([
                'buyPrice',
                'itemId',
                'name',
                'quantity',
                'sellPrice',
            ]);
        });
    });

    describe('parseGuidePrice', () => {
        it('should parse abbreviated and plain prices', () => {
            expect(parseGuidePrice('123')).toBe(123);
            expect(parseGuidePrice('75k')).toBe(75000);
            expect(parseGuidePrice('2.4m')).toBe(2400000);
            expect(parseGuidePrice('1.5b')).toBe(1500000000);
            expect(parseGuidePrice('1,234')).toBe(1234);
            expect(parseGuidePrice(' 80.5K ')).toBe(80500);
            expect(parseGuidePrice('-279')).toBe(-279);
            expect(parseGuidePrice(75000)).toBe(75000);
        });

        it('should return undefined for unparseable values', () => {
            expect(parseGuidePrice('n/a')).toBeUndefined();
            expect(parseGuidePrice('')).toBeUndefined();
            expect(parseGuidePrice('12x')).toBeUndefined();
            expect(parseGuidePrice(undefined)).toBeUndefined();
            expect(parseGuidePrice(null)).toBeUndefined();
            expect(parseGuidePrice(Number.NaN)).toBeUndefined();
        });
    });

    describe('salesTaxPerUnit', () => {
        it('should charge 2% rounded down', () => {
            expect(salesTaxPerUnit(4992, 4151)).toBe(99);
            expect(salesTaxPerUnit(100, 4151)).toBe(2);
        });

        it('should exempt items priced at 50 coins or less', () => {
            expect(salesTaxPerUnit(50, 4151)).toBe(0);
            expect(salesTaxPerUnit(49, 4151)).toBe(0);
        });

        it('should exempt bonds', () => {
            expect(salesTaxPerUnit(100_000_000, 29492)).toBe(0);
        });
    });

    describe('estimate_flip', () => {
        it('should use explicit buy/sell overrides without any network calls', async () => {
            const result = await handleFlipTool('estimate_flip', {
                itemId: 4151,
                buyPrice: 1000,
                sellPrice: 1100,
                quantity: 10,
            });

            expect(result.isError).toBeFalsy();
            const payload = payloadOf(result.content[0].text);
            expect(payload.taxPerUnit).toBe(22);
            expect(payload.grossProfit).toBe(1000);
            expect(payload.totalTax).toBe(220);
            expect(payload.netProfit).toBe(780);
            expect(payload.marginPct).toBe(7.8);
            expect(payload.priceSource.buyPrice).toBe('override');
            expect(payload.priceSource.sellPrice).toBe('override');
            expect(payload.assumptions.join(' ')).toContain('2% Grand Exchange sales tax');
        });

        it('should prefer the numeric weirdgloop price and report both sources', async () => {
            nock(RS3_GE_API)
                .get('/catalogue/detail.json?item=4151')
                .reply(200, {
                    item: { id: 4151, name: 'Abyssal whip', current: { price: '75k' } },
                });
            nock(WEIRDGLOOP_ORIGIN)
                .get(WEIRDGLOOP_PATH)
                .query({ id: '4151' })
                .reply(200, { 'Abyssal whip': { id: '4151', price: 80000, volume: 12 } });

            const result = await handleFlipTool('estimate_flip', { itemId: 4151 });

            const payload = payloadOf(result.content[0].text);
            expect(payload.itemName).toBe('Abyssal whip');
            expect(payload.priceSource.guidePrice).toBe(75000);
            expect(payload.priceSource.weirdgloopPrice).toBe(80000);
            expect(payload.buyPrice).toBe(80000);
            expect(payload.sellPrice).toBe(80000);
            expect(payload.quantity).toBe(1);
            expect(payload.netProfit).toBe(-1600);
        });

        it('should fall back to the parsed guide price when weirdgloop has nothing', async () => {
            nock(RS3_GE_API)
                .get('/catalogue/detail.json?item=536')
                .reply(200, {
                    item: { id: 536, name: 'Dragon bones', current: { price: '2.4m' } },
                });
            nock(WEIRDGLOOP_ORIGIN)
                .get(WEIRDGLOOP_PATH)
                .query({ id: '536' })
                .reply(404, { success: false });

            const result = await handleFlipTool('estimate_flip', {
                itemId: 536,
                sellPrice: 2_500_000,
                quantity: 2,
            });

            const payload = payloadOf(result.content[0].text);
            expect(payload.buyPrice).toBe(2_400_000);
            expect(payload.priceSource.buyPrice).toBe('jagex-guide');
            expect(payload.priceSource.sellPrice).toBe('override');
            expect(payload.taxPerUnit).toBe(50_000);
            expect(payload.grossProfit).toBe(200_000);
            expect(payload.netProfit).toBe(100_000);
        });

        it('should resolve an item name before estimating', async () => {
            nock(WEIRDGLOOP_ORIGIN)
                .get(WEIRDGLOOP_PATH)
                .query({ name: 'Abyssal whip' })
                .reply(200, { 'Abyssal whip': { id: '4151', price: 80000 } });
            nock(WEIRDGLOOP_ORIGIN)
                .get(WEIRDGLOOP_PATH)
                .query({ id: '4151' })
                .reply(200, { 'Abyssal whip': { id: '4151', price: 80000 } });
            nock(RS3_GE_API)
                .get('/catalogue/detail.json?item=4151')
                .reply(200, {
                    item: { id: 4151, name: 'Abyssal whip', current: { price: '80k' } },
                });

            const result = await handleFlipTool('estimate_flip', {
                name: 'Abyssal whip',
                sellPrice: 90000,
            });

            const payload = payloadOf(result.content[0].text);
            expect(payload.itemId).toBe(4151);
            expect(payload.buyPrice).toBe(80000);
            expect(payload.sellPrice).toBe(90000);
            expect(payload.netProfit).toBe(8200);
        });

        it('should still estimate when the Jagex detail endpoint fails', async () => {
            nock(RS3_GE_API).get('/catalogue/detail.json?item=4151').reply(503);
            nock(WEIRDGLOOP_ORIGIN)
                .get(WEIRDGLOOP_PATH)
                .query({ id: '4151' })
                .reply(200, { 'Abyssal whip': { id: '4151', price: 80000 } });

            const result = await handleFlipTool('estimate_flip', { itemId: 4151, sellPrice: 85000 });

            const payload = payloadOf(result.content[0].text);
            expect(payload.buyPrice).toBe(80000);
            expect(payload.priceSource.guidePriceError).toContain('503');
        });

        it('should error when no market price can be found', async () => {
            nock(RS3_GE_API)
                .get('/catalogue/detail.json?item=99999')
                .reply(200, { item: { id: 99999, name: 'Mystery', current: { price: 'n/a' } } });
            nock(WEIRDGLOOP_ORIGIN)
                .get(WEIRDGLOOP_PATH)
                .query({ id: '99999' })
                .reply(404, { success: false });

            const result = await handleFlipTool('estimate_flip', { itemId: 99999 });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('No market price available');
        });

        it('should apply no tax to items priced at 50 coins or less', async () => {
            const result = await handleFlipTool('estimate_flip', {
                itemId: 1965,
                buyPrice: 10,
                sellPrice: 50,
                quantity: 100,
            });

            const payload = payloadOf(result.content[0].text);
            expect(payload.totalTax).toBe(0);
            expect(payload.netProfit).toBe(4000);
            expect(payload.assumptions.join(' ')).toContain('tax exempt');
        });

        it('should report the after-tax break-even sell price', async () => {
            const result = await handleFlipTool('estimate_flip', {
                itemId: 4151,
                buyPrice: 1000,
                sellPrice: 1000,
            });

            const payload = payloadOf(result.content[0].text);
            expect(payload.breakEvenSellPrice).toBe(1020);
            expect(1020 - Math.floor(1020 * 0.02)).toBeGreaterThanOrEqual(1000);
            expect(1019 - Math.floor(1019 * 0.02)).toBeLessThan(1000);
        });

        it('should require itemId or name', async () => {
            const result = await handleFlipTool('estimate_flip', { buyPrice: 100 });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Either itemId or name is required');
        });

        it('should reject itemId and name together', async () => {
            const result = await handleFlipTool('estimate_flip', { itemId: 4151, name: 'whip' });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('not both');
        });

        it('should reject unexpected arguments', async () => {
            const result = await handleFlipTool('estimate_flip', { itemId: 4151, margin: 5 });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Unexpected argument');
        });

        it('should reject a non-integer quantity', async () => {
            const result = await handleFlipTool('estimate_flip', { itemId: 4151, quantity: 1.5 });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('quantity must be an integer');
        });

        it('should reject quantity below 1', async () => {
            const result = await handleFlipTool('estimate_flip', { itemId: 4151, quantity: 0 });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('quantity must be at least 1');
        });

        it('should reject a negative buyPrice', async () => {
            const result = await handleFlipTool('estimate_flip', { itemId: 4151, buyPrice: -5 });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('buyPrice must be at least 0');
        });
    });

    it('should throw for an unknown tool', async () => {
        await expect(handleFlipTool('not_a_tool', {})).rejects.toThrow('Unknown flip tool');
    });
});
