import { createHash } from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import { runBatch } from '../src/batch.js';
import { createSuccessResponse } from '../src/utils.js';
import { handlePriceTool } from '../src/tools/priceTools.js';
import { handleWikiTool } from '../src/tools/wikiTools.js';
import { wikiContentReviews } from '../src/wikiContentPolicy.js';
import { RS3_GE_API } from '../src/constants.js';

describe('Bounded item and wiki batches', () => {
    beforeEach(() => { nock.cleanAll(); wikiContentReviews.splice(0); });
    afterEach(() => { nock.cleanAll(); wikiContentReviews.splice(0); });

    it('limits fan-out to two requests while preserving input order', async () => {
        let active = 0, peak = 0;
        const result = await runBatch('Test', [1, 2, 3], async id => {
            active++; peak = Math.max(peak, active);
            await new Promise(resolve => setTimeout(resolve, id === 1 ? 20 : 1));
            active--;
            return createSuccessResponse('Test', { id });
        });
        expect(peak).toBe(2);
        expect(result.structuredContent).toEqual({ succeeded: 3, failed: 0,
            results: [1, 2, 3].map(id => ({ query: id, data: { id } })) });
    });

    it.each([
        { itemIds: [] }, { itemIds: null }, { itemIds: Array(11).fill(4151) },
        { itemIds: [4151, 4151] }, { itemIds: [4151, '536'] },
        { itemIds: [4151], itemId: 536 }, { itemIds: [4151], name: 'Dragon bones' },
    ])('rejects invalid item batches before upstream work: %j', async args => {
        const result = await handlePriceTool('get_item_price', args);
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toMatch(/array|unique|integer|exactly one/);
    });

    it('returns catalogue metadata with a failed item isolated in its own row', async () => {
        nock(RS3_GE_API).get('/catalogue/detail.json?item=4151')
            .reply(200, { item: { id: 4151, name: 'Abyssal whip', members: 'true',
                description: 'Fixture examine text', type: 'Fixture category', current: { price: '80k' } } });
        nock(RS3_GE_API).get('/catalogue/detail.json?item=536').reply(404);
        const result = await handlePriceTool('get_item_price', { itemIds: [4151, 536] });
        expect(result.isError).toBeFalsy();
        expect(result.structuredContent).toMatchObject({ succeeded: 1, failed: 1,
            results: [{ query: 4151, data: { item: { members: 'true', description: 'Fixture examine text' } } },
                { query: 536, error: expect.stringContaining('404') }] });
        expect(nock.isDone()).toBe(true);
    });

    it('stops queued work after an upstream 429 and preserves Retry-After guidance', async () => {
        nock(RS3_GE_API).get('/catalogue/detail.json?item=4151').reply(429, '', { 'Retry-After': '60' });
        nock(RS3_GE_API).get('/catalogue/detail.json?item=536').delay(15)
            .reply(200, { item: { id: 536, name: 'Dragon bones' } });
        const unstarted = nock(RS3_GE_API).get('/catalogue/detail.json?item=18832')
            .reply(200, { item: { id: 18832 } });
        const result = await handlePriceTool('get_item_price', { itemIds: [4151, 536, 18832] });
        expect(unstarted.isDone()).toBe(false);
        expect(result.structuredContent).toMatchObject({ succeeded: 1, failed: 2, results: [
            { query: 4151, error: expect.stringContaining('retry after 60') },
            { query: 536, data: { item: { id: 536 } } },
            { query: 18832, error: expect.stringContaining('Skipped after upstream rate limit') },
        ] });
    });

    it('marks a wholly failed batch as a tool error without losing its error rows', async () => {
        nock(RS3_GE_API).get('/catalogue/detail.json?item=4151').reply(404);
        nock(RS3_GE_API).get('/catalogue/detail.json?item=536').reply(404);
        const result = await handlePriceTool('get_item_price', { itemIds: [4151, 536] });
        expect(result.isError).toBe(true);
        expect(result.structuredContent).toMatchObject({ succeeded: 0, failed: 2,
            results: [{ query: 4151, error: expect.any(String) }, { query: 536, error: expect.any(String) }] });
    });

    it.each([{ pages: [] }, { pages: null }, { pages: Array(11).fill('Fixture') },
        { pages: ['Fixture', 123] }, { page: 'Fixture', pages: ['Fixture'] }])
    ('rejects invalid wiki batches: %j', async args => {
        const result = await handleWikiTool('get_wiki_page_content', args);
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toMatch(/array|string|not both/);
    });

    it('applies the exact review gate to every page in a mixed batch', async () => {
        const extract = ' Fictional fixture content. ';
        wikiContentReviews.push({ title: 'Reviewed fixture', revisionId: 7,
            extractSha256: createHash('sha256').update(extract).digest('hex'),
            licenseName: 'Fixture license', licenseUrl: 'https://example.org/license', copyrightNotices: [],
            reviewedBy: 'Test fixture', reviewedAt: '2026-10-24', reviewNote: 'Fictional data only.' });
        for (const title of ['Reviewed fixture', 'Unreviewed fixture']) {
            nock('https://runescape.wiki').get('/api.php')
                .query(q => q.prop === 'info|revisions' && q.titles === title)
                .reply(200, { query: { pages: { '1': { title, ns: 0, revisions: [{ revid: 7 }],
                    extract: 'Unreviewed text must not escape' } } } });
        }
        nock('https://runescape.wiki').get('/api.php')
            .query(q => q.prop === 'extracts|revisions' && q.titles === 'Reviewed fixture')
            .reply(200, { query: { pages: { '1': { title: 'Reviewed fixture', ns: 0,
                revisions: [{ revid: 7 }], extract } } } });
        const result = await handleWikiTool('get_wiki_page_content',
            { pages: ['Reviewed fixture', 'Unreviewed fixture'] });
        expect(result.structuredContent).toMatchObject({ succeeded: 2, failed: 0, results: [
            { query: 'Reviewed fixture', data: { contentStatus: 'reviewed_extract', text: extract.trim() } },
            { query: 'Unreviewed fixture', data: { contentStatus: 'link_only', text: null } },
        ] });
        expect(JSON.stringify(result)).not.toContain('Unreviewed text must not escape');
        expect(nock.isDone()).toBe(true);
    });

    it('keeps a missing page separate from a valid reference', async () => {
        nock('https://runescape.wiki').get('/api.php').query(q => q.titles === 'Missing fixture')
            .reply(200, { query: { pages: { '-1': { missing: '' } } } });
        nock('https://runescape.wiki').get('/api.php').query(q => q.titles === 'Valid fixture')
            .reply(200, { query: { pages: { '1': { title: 'Valid fixture', ns: 0, revisions: [{ revid: 7 }] } } } });
        const result = await handleWikiTool('get_wiki_page_content', { pages: ['Missing fixture', 'Valid fixture'] });
        expect(result.structuredContent).toMatchObject({ succeeded: 1, failed: 1,
            results: [{ query: 'Missing fixture', error: expect.stringContaining('not found') },
                { query: 'Valid fixture', data: { contentStatus: 'link_only', text: null } }] });
    });
});
