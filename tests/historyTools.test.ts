// Tests for price history tools

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import { handleHistoryTool, historyTools } from '../src/tools/historyTools.js';

const WEIRDGLOOP_HOST = 'https://api.weirdgloop.org';
const HISTORY_PATH = '/exchange/history/rs/last90d';
const LATEST_PATH = '/exchange/history/rs/latest';

function series(prices: number[], volume?: number) {
    return prices.map((price, index) => ({
        id: '4151',
        price,
        ...(volume === undefined ? {} : { volume }),
        timestamp: 1750000000000 + index * 86400000,
    }));
}

describe('History Tools', () => {
    beforeEach(() => {
        nock.cleanAll();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    it('exposes summarize_price_history with a strict schema', () => {
        const tool = historyTools.find(t => t.name === 'summarize_price_history');
        expect(tool).toBeDefined();
        expect(tool?.inputSchema.additionalProperties).toBe(false);
    });

    describe('summarize_price_history', () => {
        it('summarizes history by itemId', async () => {
            nock(WEIRDGLOOP_HOST)
                .get(HISTORY_PATH)
                .query({ id: '4151' })
                .reply(200, { '4151': series([100, 200, 300], 50) });

            const result = await handleHistoryTool('summarize_price_history', { itemId: 4151 });
            expect(result.isError).toBeFalsy();

            const summary = JSON.parse(result.content[0].text.split('\n\n')[1]);
            expect(summary).toMatchObject({
                itemId: 4151,
                windowDays: 3,
                sampleCount: 3,
                latestPrice: 300,
                oldestPriceInWindow: 100,
                minPrice: 100,
                maxPrice: 300,
                avgPrice: 200,
                changeAbs: 200,
                changePct: 200,
                avgDailyVolume: 50,
            });
            expect(summary.name).toBeUndefined();
        });

        it('limits the window to the requested number of days', async () => {
            nock(WEIRDGLOOP_HOST)
                .get(HISTORY_PATH)
                .query({ id: '4151' })
                .reply(200, { '4151': series([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) });

            const result = await handleHistoryTool('summarize_price_history', {
                itemId: 4151,
                days: 7,
            });

            const summary = JSON.parse(result.content[0].text.split('\n\n')[1]);
            expect(summary.windowDays).toBe(7);
            expect(summary.oldestPriceInWindow).toBe(4);
            expect(summary.latestPrice).toBe(10);
            expect(summary.avgDailyVolume).toBeUndefined();
        });

        it('resolves an item name before summarizing', async () => {
            nock(WEIRDGLOOP_HOST)
                .get(LATEST_PATH)
                .query({ name: 'Abyssal whip' })
                .reply(200, { 'Abyssal whip': { id: '4151', price: 80797, volume: 1436 } });

            nock(WEIRDGLOOP_HOST)
                .get(HISTORY_PATH)
                .query({ id: '4151' })
                .reply(200, { '4151': series([80000, 80797], 1000) });

            const result = await handleHistoryTool('summarize_price_history', {
                name: 'Abyssal whip',
            });

            const summary = JSON.parse(result.content[0].text.split('\n\n')[1]);
            expect(summary.name).toBe('Abyssal whip');
            expect(summary.itemId).toBe(4151);
        });

        it('errors when the item has no history', async () => {
            nock(WEIRDGLOOP_HOST)
                .get(HISTORY_PATH)
                .query({ id: '999999' })
                .reply(200, { success: false });

            const result = await handleHistoryTool('summarize_price_history', { itemId: 999999 });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('No price history available for item 999999');
        });

        it('requires itemId or name', async () => {
            const result = await handleHistoryTool('summarize_price_history', {});
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Either itemId or name is required');
        });

        it('rejects both itemId and name', async () => {
            const result = await handleHistoryTool('summarize_price_history', {
                itemId: 4151,
                name: 'Abyssal whip',
            });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Provide either itemId or name, not both');
        });

        it('rejects out-of-range days', async () => {
            const result = await handleHistoryTool('summarize_price_history', {
                itemId: 4151,
                days: 120,
            });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toBe('days must be at most 90');
        });

        it('rejects non-integer days', async () => {
            const result = await handleHistoryTool('summarize_price_history', {
                itemId: 4151,
                days: 12.5,
            });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toBe('days must be an integer');
        });

        it('rejects unknown arguments', async () => {
            const result = await handleHistoryTool('summarize_price_history', {
                itemId: 4151,
                window: 30,
            });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Unexpected argument(s): window');
        });
    });

    it('throws on an unknown tool name', async () => {
        await expect(handleHistoryTool('unknown_tool', {})).rejects.toThrow(
            'Unknown history tool: unknown_tool'
        );
    });
});
