import { afterEach, describe, expect, it } from '@jest/globals';
import nock from 'nock';
import { handleWikiReferenceTool } from '../src/tools/wikiReferenceTools.js';
import { ApiRequestError } from '../src/utils.js';
const host = 'https://runescape.wiki';
function category(body: unknown, check: (q: Record<string, unknown>) => boolean = () => true) {
    return nock(host).get('/api.php').query(q => q.list === 'categorymembers' && q.formatversion === '2' && check(q)).reply(200, body);
}
function info(title = 'Fixture', extra = {}) {
    return nock(host).get('/api.php').query(q => q.action === 'query' && q.prop === 'info' && q.redirects === '1')
        .reply(200, { query: { pages: [{ pageid: 1, ns: 0, title, ...extra }] } });
}
function drops(rows: unknown[], check: (query: string) => boolean = () => true) {
    return nock(host).get('/api.php').query(q => q.action === 'bucket' && q.formatversion === '2' && check(String(q.query))).reply(200, { bucket: rows });
}
function row(item = 'Dragon bones', facts: object = {}, reference = 'Fixture') {
    return { page_name_sub: reference, item_name: item, rare_drop_table: false,
        drop_json: JSON.stringify({ 'Quantity Low': 1, 'Quantity High': 2, Rarity: '1/6,104', Rolls: 1, Approx: false, ...facts }) };
}
afterEach(() => nock.cleanAll());
describe('Wiki category metadata', () => {
    it('returns article/subcategory/file references, excludes extra content and binds the complete continuation token', async () => {
        category({ query: { categorymembers: [
            { pageid: 1, ns: 0, title: 'Weapon', extract: 'UNREVIEWED_PROSE' },
            { pageid: 2, ns: 14, title: 'Category:Subgroup' }, { pageid: 3, ns: 6, title: 'File:Weapon.png' },
        ] }, continue: { cmcontinue: 'subcat|ABC|123', continue: '-||' } }, q => q.cmtitle === 'Category:Weapons' && q.cmlimit === '3');
        const first = await handleWikiReferenceTool('list_wiki_category_members', { category: 'Category:Weapons', limit: 3 });
        expect(first.structuredContent).toMatchObject({ contentStatus: 'link_only', members: [{ namespace: 0 }, { namespace: 14 }, { namespace: 6 }], skippedRows: 0 });
        expect(JSON.stringify(first)).not.toContain('UNREVIEWED');
        const cursor = first.structuredContent?.nextCursor as string;
        category({ query: { categorymembers: [] } }, q => q.cmcontinue === 'subcat|ABC|123' && q.continue === '-||');
        const second = await handleWikiReferenceTool('list_wiki_category_members', { category: 'Category:Weapons', cursor });
        expect(second.structuredContent).toMatchObject({ members: [], nextCursor: null });
        const wrong = await handleWikiReferenceTool('list_wiki_category_members', { category: 'Category:Armour', cursor });
        expect(wrong.isError).toBe(true);
    });
    it.each(['Weapons', 'https://runescape.wiki/w/Category:Weapons', 'Category:Weapons#section', 'Category:Weapons|Foo', 'Category: '])('rejects invalid category selectors: %s', async category => {
        expect((await handleWikiReferenceTool('list_wiki_category_members', { category })).isError).toBe(true);
    });
    it('rejects malformed or forged continuation parameters before I/O', async () => {
        for (const cursor of ['not+base64', Buffer.from(JSON.stringify({ category: 'Category:Weapons', continuation: { cmcontinue: 'x', continue: '-||', titles: 'Injected' } })).toString('base64url')]) {
            expect((await handleWikiReferenceTool('list_wiki_category_members', { category: 'Category:Weapons', cursor })).isError).toBe(true);
        }
    });
    it('reports malformed metadata without silently claiming a complete empty list', async () => {
        category({ query: { categorymembers: [{ pageid: -1, ns: 0, title: 'Bad' }] } });
        await expect(handleWikiReferenceTool('list_wiki_category_members', { category: 'Category:Weapons' })).rejects.toThrow('no usable metadata');
    });
    it('reports skipped rows and rejects malformed upstream continuation', async () => {
        category({ query: { categorymembers: [{ pageid: 1, ns: 0, title: 'Valid' }, { pageid: 2, ns: 0, title: '<bad>' }] } });
        expect((await handleWikiReferenceTool('list_wiki_category_members', { category: 'Category:Weapons' })).structuredContent).toMatchObject({ skippedRows: 1 });
        category({ query: { categorymembers: [] }, continue: { cmcontinue: 'x', arbitrary: 'field' } });
        await expect(handleWikiReferenceTool('list_wiki_category_members', { category: 'Category:Weapons' })).rejects.toThrow('invalid continuation');
    });
    it('does not return an upstream cursor exceeding the callable input bound', async () => {
        category({ query: { categorymembers: [] }, continue: { cmcontinue: 'x'.repeat(2000), continue: 'y'.repeat(2000) } });
        await expect(handleWikiReferenceTool('list_wiki_category_members', { category: 'Category:Weapons' })).rejects.toThrow('cursor bounds');
    });
    it('propagates Wiki HTTP-200 rate-limit errors as 429', async () => {
        category({ error: { code: 'ratelimited', info: 'Not article content' } });
        await expect(handleWikiReferenceTool('list_wiki_category_members', { category: 'Category:Weapons' })).rejects.toMatchObject({ status: 429 });
    });
});
describe('Wiki indexed drop facts', () => {
    it('resolves redirects, pages rows and emits only numeric/controlled facts and source references', async () => {
        info(); drops([
            row('Dragon bones', { 'Name Notes': 'UNREVIEWED_PROSE', 'Rarity Notes': ['UNREVIEWED_PROSE'], image: 'UNREVIEWED_IMAGE' }),
            row('Coins', { 'Quantity Low': 100, 'Quantity High': 500, Rarity: 'Common' }),
            row('Next item'),
        ], q => (q.match(/\.orderBy\(/g)?.length === 1) && q.includes("bucket('dropsline')") && q.includes(".where('page_name',[[Fixture]])") && q.includes('.limit(3).offset(4)'));
        const result = await handleWikiReferenceTool('get_wiki_drop_table', { page: 'Redirect', limit: 2, offset: 4 });
        expect(result.structuredContent).toMatchObject({ page: 'Fixture', nextOffset: 6, skippedRows: 0, rows: [
            { itemTitle: 'Dragon bones', quantityMinimum: 1, quantityMaximum: 2, rolls: 1, approximate: false, rareDropTable: false, hasOmittedAnnotations: true, listedProbability: 1 / 6104 },
            { itemTitle: 'Coins', rarityLabel: 'Common', listedProbability: null },
        ] });
        expect(JSON.stringify(result)).not.toContain('UNREVIEWED');
    });
    it('filters an exact variant and keeps unknown rates/counts null rather than inventing zeros', async () => {
        info(); drops([row('Coins', { 'Quantity Low': -1, 'Quantity High': Number.MAX_SAFE_INTEGER + 1, Rarity: 'UNREVIEWED_TEXT', Rolls: 'wrong' }, 'Fixture#Variant')], q => q.includes(".where('page_name_sub',[[Fixture#Variant]])"));
        const result = await handleWikiReferenceTool('get_wiki_drop_table', { page: 'Fixture', variant: 'Fixture#Variant' });
        expect(result.structuredContent).toMatchObject({ nextOffset: null, rows: [{ quantityMinimum: null, quantityMaximum: null, listedProbability: null, rarityLabel: null, rolls: null }] });
        expect(JSON.stringify(result)).not.toContain('UNREVIEWED_TEXT');
    });
    it('does not select a variant from a different article', async () => {
        info();
        const result = await handleWikiReferenceTool('get_wiki_drop_table', { page: 'Fixture', variant: 'Other#Variant' });
        expect(result.isError).toBe(true);
    });
    it('uses a data-only Lua delimiter even when a title contains closing brackets or quotes', async () => {
        const title = "Odd ]] title ' .run()";
        info(title); drops([], q => q.includes(".where('page_name',[=[Odd ]] title ' .run()]=])"));
        expect((await handleWikiReferenceTool('get_wiki_drop_table', { page: title })).structuredContent?.rows).toEqual([]);
    });
    it('retains true Always probability and rejects impossible numeric rates/ranges', async () => {
        info(); drops([row('First', { Rarity: 'Always' }), row('Second', { Rarity: '2/1', 'Quantity Low': 5, 'Quantity High': 2 }), row('Third', { Rarity: '1/0' })]);
        const result = await handleWikiReferenceTool('get_wiki_drop_table', { page: 'Fixture' });
        expect(result.structuredContent?.rows).toMatchObject([{ rarityLabel: 'Always', listedProbability: 1 }, { listedProbability: null, quantityMinimum: null, quantityMaximum: null }, { listedProbability: null }]);
    });
    it('counts malformed index rows and fails closed on an entirely unusable page', async () => {
        info(); drops([row(), { ...row(), drop_json: '{bad json' }]);
        expect((await handleWikiReferenceTool('get_wiki_drop_table', { page: 'Fixture' })).structuredContent?.skippedRows).toBe(1);
        info(); drops([{ ...row(), drop_json: '{bad json' }]);
        await expect(handleWikiReferenceTool('get_wiki_drop_table', { page: 'Fixture' })).rejects.toThrow('no usable indexed facts');
    });
    it('allows an empty indexed table and rejects missing/non-article sources', async () => {
        info(); drops([]);
        expect((await handleWikiReferenceTool('get_wiki_drop_table', { page: 'Fixture' })).structuredContent).toMatchObject({ rows: [], nextOffset: null });
        info('Category:Fixture', { ns: 14 });
        expect((await handleWikiReferenceTool('get_wiki_drop_table', { page: 'Category:Fixture' })).isError).toBe(true);
        info('Missing', { missing: true });
        expect((await handleWikiReferenceTool('get_wiki_drop_table', { page: 'Missing' })).isError).toBe(true);
    });
    it('rejects invalid bounds, unknown arguments and URL selectors before lookup', async () => {
        for (const args of [{ page: 'https://runescape.wiki/w/Fixture' }, { page: 'Fixture', offset: 10001 }, { page: 'Fixture', limit: 0 }, { page: 'Fixture', cursor: 'x' }]) {
            expect((await handleWikiReferenceTool('get_wiki_drop_table', args)).isError).toBe(true);
        }
    });
    it('does not convert upstream API errors into a fabricated empty table', async () => {
        nock(host).get('/api.php').query(true).reply(200, { error: { code: 'ratelimited' } });
        await expect(handleWikiReferenceTool('get_wiki_drop_table', { page: 'Fixture' })).rejects.toBeInstanceOf(ApiRequestError);
    });
});
