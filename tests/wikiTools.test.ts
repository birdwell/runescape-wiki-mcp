import { createHash } from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import { handleWikiTool, wikiTools } from '../src/tools/wikiTools.js';
import { wikiContentReviews, type WikiContentReview } from '../src/wikiContentPolicy.js';

const extract = '  Fictional fixture text. Copyright Fixture Contributors.  ';
function review(overrides: Partial<WikiContentReview> = {}) {
    wikiContentReviews.push({
        title: 'Fixture', revisionId: 42,
        extractSha256: createHash('sha256').update(extract).digest('hex'),
        licenseName: 'Fixture license', licenseUrl: 'https://example.org/license',
        copyrightNotices: ['Copyright Fixture Contributors.'],
        reviewedBy: 'Test reviewer', reviewedAt: '2026-10-24',
        reviewNote: 'Fictional test data, not approval of any live wiki content.', ...overrides,
    });
}
function pageReply(prop: string, page: Record<string, unknown>) {
    return nock('https://runescape.wiki').get('/api.php')
        .query(query => query.prop === prop && query.redirects === '1' && query.rvprop === 'ids')
        .reply(200, { query: { pages: { '1': { pageid: 1, title: 'Fixture', ns: 0,
            revisions: [{ revid: 42 }], ...page } } } });
}
async function getPage() {
    return handleWikiTool('get_wiki_page_content', { page: 'Fixture redirect' });
}
function expectLinks(result: Awaited<ReturnType<typeof getPage>>) {
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ contentStatus: 'link_only', text: null,
        attribution: { license: null, copyrightNotices: [] } });
    expect(JSON.stringify(result)).not.toContain(extract.trim());
}

describe('Wiki content boundaries', () => {
    beforeEach(() => { nock.cleanAll(); wikiContentReviews.splice(0); });
    afterEach(() => { nock.cleanAll(); wikiContentReviews.splice(0); });

    it('publishes both wiki output schemas', () => {
        expect(wikiTools).toHaveLength(2);
        for (const tool of wikiTools) expect(tool.outputSchema).toBeDefined();
    });

    it('suppresses upstream snippets and includes attribution in structured search results', async () => {
        const request = nock('https://runescape.wiki').get('/api.php')
            .query(q => q.list === 'search' && q.srprop === '' && q.srnamespace === '0' && q.srlimit === '3')
            .reply(200, { query: { search: [{ title: 'Fixture', snippet: '<b>Unreviewed text</b>' }] } });
        const result = await handleWikiTool('search_wiki', { query: 'fixture', limit: 3 });
        expect(request.isDone()).toBe(true);
        expect(result.structuredContent).toMatchObject({ results: [{ title: 'Fixture', snippet: '',
            url: 'https://runescape.wiki/w/Fixture', contentStatus: 'link_only',
            attribution: { author: 'RuneScape Wiki contributors', license: null,
                sourceUrl: 'https://runescape.wiki/w/Fixture',
                historyUrl: 'https://runescape.wiki/w/Fixture?action=history' } }] });
        expect(JSON.stringify(result)).not.toContain('Unreviewed text');
        expect(result.content[0].text).toContain('RuneScape Wiki contributors');
    });

    it('returns empty search results', async () => {
        nock('https://runescape.wiki').get('/api.php').query(true).reply(200, { query: { search: [] } });
        expect((await handleWikiTool('search_wiki', { query: 'unknown' })).structuredContent).toEqual({ results: [] });
    });

    it('uses the resolved title and never requests extracts for unreviewed pages', async () => {
        const metadata = pageReply('info|revisions', { title: 'Resolved title', extract });
        const result = await getPage();
        expectLinks(result);
        expect(metadata.isDone()).toBe(true);
        expect(result.structuredContent).toMatchObject({ title: 'Resolved title', revisionId: 42,
            url: 'https://runescape.wiki/w/Resolved_title' });
        expect(nock.pendingMocks()).toEqual([]);
    });

    it.each([6, 828, undefined])('returns links for namespace %s even with a matching review', async ns => {
        review(); pageReply('info|revisions', { ns });
        expectLinks(await getPage());
    });

    it('returns links without fetching extracts when the reviewed revision is stale', async () => {
        review(); pageReply('info|revisions', { revisions: [{ revid: 43 }] });
        expectLinks(await getPage());
    });

    it('preserves the reviewed license and notices in text and structured content', async () => {
        review(); pageReply('info|revisions', {}); pageReply('extracts|revisions', { extract });
        const result = await getPage();
        expect(result.structuredContent).toMatchObject({ contentStatus: 'reviewed_extract',
            text: extract.trim(), revisionId: 42, attribution: {
                license: { name: 'Fixture license', url: 'https://example.org/license' },
                sourceUrl: 'https://runescape.wiki/w/Fixture?oldid=42',
                copyrightNotices: ['Copyright Fixture Contributors.'],
                historyUrl: 'https://runescape.wiki/w/Fixture?action=history',
            } });
        expect(result.content[0].text).toContain('Copyright Fixture Contributors.');
        expect(result.content[0].text).toContain('https://example.org/license');
        expect(result.content[0].text).toContain('formatting omitted');
        expect(nock.isDone()).toBe(true);
    });

    it.each([
        { extract: `${extract} changed` },
        { extract, revisions: [{ revid: 43 }] },
        { extract, title: 'Unexpected redirect' },
        { extract, ns: 6 },
        { extract: '' },
        { extract, missing: '' },
        { extract, invalid: '' },
    ])('fails closed when the extract response changes: %j', async current => {
        review(); pageReply('info|revisions', {}); pageReply('extracts|revisions', current);
        expectLinks(await getPage());
        expect(nock.isDone()).toBe(true);
    });

    it.each([
        { extractSha256: 'invalid' }, { licenseUrl: 'http://example.org/license' },
        { reviewedBy: '' }, { reviewedAt: 'invalid' }, { reviewNote: '' },
    ])('ignores incomplete reviews: %j', async invalid => {
        review(invalid); pageReply('info|revisions', {}); expectLinks(await getPage());
    });

    it('handles missing pages without attributing nonexistent content', async () => {
        pageReply('info|revisions', { pageid: -1, missing: '' });
        const result = await getPage();
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('was not found');
    });

    it('validates required arguments and search bounds', async () => {
        for (const [tool, args] of [
            ['search_wiki', {}], ['get_wiki_page_content', {}],
            ['search_wiki', { query: 'test', limit: 0 }],
        ] as const) expect((await handleWikiTool(tool, args)).isError).toBe(true);
    });
    it.each(['https://runescape.wiki/w/Fixture', 'Fixture#Section', 'Fixture|Other'])
    ('rejects title syntax that is not one literal page before upstream work: %s', async page => {
        const result = await handleWikiTool('get_wiki_page_content', { page });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('without a URL, #fragment or |separator');
    });

    it('validates every batch title before fetching any page', async () => {
        const unused = pageReply('info|revisions', {});
        const result = await handleWikiTool('get_wiki_page_content', { pages: ['Fixture', 'Other#Section'] });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('pages[1]');
        expect(unused.isDone()).toBe(false);
    });

    it('treats an upstream invalid-title flag as an error', async () => {
        pageReply('info|revisions', { invalid: '' });
        const result = await getPage();
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('invalid');
    });

    it('distinguishes API search errors from an empty result set', async () => {
        nock('https://runescape.wiki').get('/api.php').query(q => q.list === 'search')
            .reply(200, { error: { code: 'badsearch', info: 'Invalid search syntax' } });
        const result = await handleWikiTool('search_wiki', { query: 'fixture' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Invalid search syntax');
        expect(result.structuredContent?.results).toBeUndefined();
    });

    it('does not invent a reference when the metadata API reports an error', async () => {
        nock('https://runescape.wiki').get('/api.php').query(q => q.prop === 'info|revisions')
            .reply(200, { error: { code: 'unavailable', info: 'Metadata unavailable' } });
        const result = await getPage();
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Metadata unavailable');
        expect(result.structuredContent).toBeUndefined();
    });

    it('classifies a Wiki API rate-limit response for batch backoff', async () => {
        nock('https://runescape.wiki').get('/api.php').query(q => q.list === 'search')
            .reply(200, { error: { code: 'ratelimited', info: 'Too many requests' } });
        await expect(handleWikiTool('search_wiki', { query: 'fixture' })).rejects.toMatchObject({ status: 429 });
    });

});
