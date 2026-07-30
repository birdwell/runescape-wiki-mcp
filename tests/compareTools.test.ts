// Tests for compare tools

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import { compareTools, handleCompareTool } from '../src/tools/compareTools.js';

const WEIRDGLOOP_HOST = 'https://api.weirdgloop.org';
const WEIRDGLOOP_PATH = '/exchange/history/rs/latest';

function mockLatestByName(name: string, body: Record<string, unknown>) {
    nock(WEIRDGLOOP_HOST).get(WEIRDGLOOP_PATH).query({ name }).reply(200, body);
}

function mockLatestById(id: number, body: Record<string, unknown>) {
    nock(WEIRDGLOOP_HOST).get(WEIRDGLOOP_PATH).query({ id: String(id) }).reply(200, body);
}

function parsePayload(text: string): { compared: number; rows: Array<Record<string, unknown>> } {
    return JSON.parse(text.slice(text.indexOf('{')));
}

describe('Compare Tools', () => {
    beforeEach(() => {
        nock.cleanAll();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    it('exposes compare_items as a read-only tool', () => {
        const tool = compareTools.find(t => t.name === 'compare_items');
        expect(tool).toBeDefined();
        expect(tool?.annotations?.readOnlyHint).toBe(true);
    });

    describe('compare by names', () => {
        it('returns one row per name', async () => {
            mockLatestByName('Abyssal whip', {
                'Abyssal whip': {
                    id: '4151',
                    price: 80797,
                    volume: 1436,
                    timestamp: '2026-07-29T14:10:28.000Z',
                },
            });
            mockLatestByName('Dragon bones', {
                'Dragon bones': {
                    id: '536',
                    price: 2618,
                    volume: 90210,
                    timestamp: '2026-07-29T14:10:28.000Z',
                },
            });

            const result = await handleCompareTool('compare_items', {
                names: ['Abyssal whip', 'Dragon bones'],
            });

            expect(result.isError).toBeFalsy();
            const payload = parsePayload(result.content[0].text);
            expect(payload.compared).toBe(2);
            expect(payload.rows).toEqual([
                {
                    query: 'Abyssal whip',
                    id: 4151,
                    name: 'Abyssal whip',
                    price: 80797,
                    volume: 1436,
                    timestamp: '2026-07-29T14:10:28.000Z',
                },
                {
                    query: 'Dragon bones',
                    id: 536,
                    name: 'Dragon bones',
                    price: 2618,
                    volume: 90210,
                    timestamp: '2026-07-29T14:10:28.000Z',
                },
            ]);
        });

        it('rejects non-string entries', async () => {
            const result = await handleCompareTool('compare_items', { names: ['Abyssal whip', 7] });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toBe('names[1] must be a string');
        });

        it('rejects batches larger than 10', async () => {
            const names = Array.from({ length: 11 }, (_, index) => `Item ${index}`);
            const result = await handleCompareTool('compare_items', { names });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toBe('names must contain at most 10 items');
        });

        it('rejects an empty array', async () => {
            const result = await handleCompareTool('compare_items', { names: [] });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toBe('names must contain at least 1 item');
        });
    });

    describe('compare by itemIds', () => {
        it('returns one row per itemId', async () => {
            mockLatestById(4151, {
                'Abyssal whip': { id: '4151', price: 80797, volume: 1436 },
            });
            mockLatestById(18832, {
                'Frost dragon bones': { id: '18832', price: 21300, volume: 5000 },
            });

            const result = await handleCompareTool('compare_items', { itemIds: [4151, 18832] });

            expect(result.isError).toBeFalsy();
            const payload = parsePayload(result.content[0].text);
            expect(payload.compared).toBe(2);
            expect(payload.rows).toEqual([
                {
                    query: '4151',
                    id: 4151,
                    name: 'Abyssal whip',
                    price: 80797,
                    volume: 1436,
                },
                {
                    query: '18832',
                    id: 18832,
                    name: 'Frost dragon bones',
                    price: 21300,
                    volume: 5000,
                },
            ]);
        });

        it('rejects non-integer entries', async () => {
            const result = await handleCompareTool('compare_items', { itemIds: [4151, 'whip'] });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toBe('itemIds[1] must be an integer');
        });

        it('returns an error row when an id has no latest price', async () => {
            mockLatestById(4151, { 'Abyssal whip': { id: '4151', price: 80797 } });
            mockLatestById(999999, { success: false, error: 'Item(s) not found in the database' });

            const result = await handleCompareTool('compare_items', { itemIds: [4151, 999999] });

            expect(result.isError).toBeFalsy();
            const payload = parsePayload(result.content[0].text);
            expect(payload.rows[0].id).toBe(4151);
            expect(payload.rows[1]).toEqual({
                query: '999999',
                error: 'No latest price found for item 999999',
            });
        });
    });

    describe('input selection', () => {
        it('rejects both names and itemIds', async () => {
            const result = await handleCompareTool('compare_items', {
                names: ['Abyssal whip'],
                itemIds: [4151],
            });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toBe('Provide either names or itemIds, not both');
        });

        it('rejects neither names nor itemIds', async () => {
            const result = await handleCompareTool('compare_items', {});
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toBe('Either names or itemIds is required');
        });

        it('rejects unknown arguments', async () => {
            const result = await handleCompareTool('compare_items', { itemIds: [4151], limit: 2 });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Unexpected argument(s): limit');
        });
    });

    describe('partial failures', () => {
        it('keeps resolved rows when one name cannot be resolved', async () => {
            mockLatestByName('Abyssal whip', {
                'Abyssal whip': { id: '4151', price: 80797, volume: 1436 },
            });
            mockLatestByName('Nonexistent thing', {
                success: false,
                error: 'Item(s) not found in the database',
            });
            nock('https://runescape.wiki')
                .get('/api.php')
                .query(true)
                .reply(200, ['Nonexistent thing', [], [], []]);

            const result = await handleCompareTool('compare_items', {
                names: ['Abyssal whip', 'Nonexistent thing'],
            });

            expect(result.isError).toBeFalsy();
            const payload = parsePayload(result.content[0].text);
            expect(payload.compared).toBe(2);
            expect(payload.rows[0].id).toBe(4151);
            expect(payload.rows[1]).toEqual({
                query: 'Nonexistent thing',
                error: 'No Grand Exchange item found for "Nonexistent thing"',
            });
        });

        it('turns an upstream failure into an error row', async () => {
            mockLatestByName('Abyssal whip', {
                'Abyssal whip': { id: '4151', price: 80797 },
            });
            mockLatestByName('Broken lookup', {
                success: false,
                error: 'Item(s) not found in the database',
            });
            nock('https://runescape.wiki').get('/api.php').query(true).reply(500, 'boom');

            const result = await handleCompareTool('compare_items', {
                names: ['Abyssal whip', 'Broken lookup'],
            });

            expect(result.isError).toBeFalsy();
            const payload = parsePayload(result.content[0].text);
            expect(payload.rows[0].id).toBe(4151);
            expect(payload.rows[1].query).toBe('Broken lookup');
            expect(String(payload.rows[1].error)).toContain('API request failed: 500');
        });
    });

    it('throws for an unknown tool', async () => {
        await expect(handleCompareTool('unknown_tool', {})).rejects.toThrow(
            'Unknown compare tool: unknown_tool'
        );
    });
});
