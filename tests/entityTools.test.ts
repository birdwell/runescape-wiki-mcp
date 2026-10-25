import { describe, it, expect, afterEach } from '@jest/globals';
import nock from 'nock';
import { handleEntityTool } from '../src/tools/entityTools.js';
import { ApiRequestError } from '../src/utils.js';
function info(title = 'Fixture', extra = {}) {
    return nock('https://runescape.wiki').get('/api.php')
        .query(q => q.action === 'query' && q.redirects === '1' && q.formatversion === '2')
        .reply(200, { query: { pages: [{ pageid: 1, title, ns: 0, ...extra }] } });
}
function bucket(rows: unknown[], check: (query: string) => boolean = () => true) {
    return nock('https://runescape.wiki').get('/api.php')
        .query(q => q.action === 'bucket' && q.formatversion === '2' && check(String(q.query)))
        .reply(200, { bucket: rows });
}
afterEach(() => nock.cleanAll());
describe('Structured Wiki entity facts', () => {
    it('resolves the page then returns numeric monster statistics without prose/media', async () => {
        info(); bucket([{ page_name_sub: 'Fixture', id: [1615, 29342], is_members_only: true,
            combat_level: 98, life_points: 8500, slayer_experience: 277.2,
            examine: 'UNREVIEWED_PROSE', image: 'UNREVIEWED_IMAGE', location: 'UNREVIEWED_LOCATION' }],
            q => q.includes("bucket('infobox_monster')") && !q.includes('examine') && !q.includes('image'));
        const result = await handleEntityTool('get_wiki_entity_facts', { page: 'Fixture redirect', kind: 'monster' });
        expect(result.structuredContent).toMatchObject({ page: 'Fixture', kind: 'monster', truncated: false, records: [
            { reference: 'Fixture', ids: [1615, 29342], isMembers: true, stats: { combatLevel: 98, lifePoints: 8500, slayerExperience: 277.2 } },
        ], attribution: { license: null } });
        expect(JSON.stringify(result)).not.toContain('UNREVIEWED_');
    });
    it('retains false membership and normalizes a controlled quest label/date', async () => {
        info("Cook's Assistant"); bucket([{ page_name_sub: "Cook's Assistant", id: 257,
            is_members_only: false, official_difficulty: 'Novice', quest_type: 'quest', release_date: '4 January 2001',
            overview: 'UNREVIEWED_PROSE' }]);
        const result = await handleEntityTool('get_wiki_entity_facts', { page: "Cook's Assistant", kind: 'quest' });
        expect(result.structuredContent).toMatchObject({ records: [{ ids: [257], isMembers: false,
            difficulty: 'Novice', questType: 'quest', releaseDate: '2001-01-04' }] });
        expect(JSON.stringify(result)).not.toContain('UNREVIEWED_');
    });
    it('does not copy uncontrolled labels or invalid calendar dates', async () => {
        info(); bucket([{ page_name_sub: 'Fixture', id: 257, official_difficulty: 'UNREVIEWED_TEXT',
            quest_type: 'UNREVIEWED_TEXT', release_date: '31 February 2001' }]);
        const result = await handleEntityTool('get_wiki_entity_facts', { page: 'Fixture', kind: 'quest' });
        expect(result.structuredContent?.records).toEqual([{ reference: 'Fixture', ids: [257] }]);
    });
    it('drops malformed variant identifiers instead of returning markup as reference text', async () => {
        info(); bucket([{ page_name_sub: 'Fixture#<p>UNREVIEWED_PROSE</p>', id: [1] }]);
        const result = await handleEntityTool('get_wiki_entity_facts', { page: 'Fixture', kind: 'monster' });
        expect(result.isError).toBe(true);
        expect(JSON.stringify(result)).not.toContain('UNREVIEWED_PROSE');
    });
    it('returns explicit variants and a truncation flag instead of choosing one', async () => {
        info(); bucket([{ page_name_sub: 'Fixture#A', id: [1], life_points: 100 },
            { page_name_sub: 'Fixture#B', id: [2], life_points: 200 }], q => q.includes('.limit(2)'));
        const result = await handleEntityTool('get_wiki_entity_facts', { page: 'Fixture', kind: 'monster', limit: 1 });
        expect(result.structuredContent).toMatchObject({ truncated: true, records: [{ reference: 'Fixture#A' }] });
        expect(result.structuredContent?.records).toHaveLength(1);
    });
    it('fails on a mismatched dataset rather than inventing zero statistics', async () => {
        info(); bucket([]);
        const result = await handleEntityTool('get_wiki_entity_facts', { page: 'Fixture', kind: 'monster' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('No monster facts indexed');
    });
    it('does not query entity data for non-article pages', async () => {
        info('Category:Fixture', { ns: 14 });
        expect((await handleEntityTool('get_wiki_entity_facts', { page: 'Category:Fixture', kind: 'monster' })).isError).toBe(true);
    });
    it('preserves upstream rate-limit failures', async () => {
        nock('https://runescape.wiki').get('/api.php').query(true).reply(200, { error: { code: 'ratelimited' } });
        await expect(handleEntityTool('get_wiki_entity_facts', { page: 'Fixture', kind: 'monster' })).rejects.toBeInstanceOf(ApiRequestError);
    });
    it('keeps delimiter-looking titles inside a data literal', async () => {
        const title = "Fixture]]; return 'UNSAFE' --";
        info(title); const request = bucket([{ page_name_sub: title, id: 1 }], q => q.includes(`[=[${title}]=]`));
        await handleEntityTool('get_wiki_entity_facts', { page: title, kind: 'monster' });
        expect(request.isDone()).toBe(true);
    });
    it.each([
        { page: 'https://runescape.wiki/w/Fixture', kind: 'monster' },
        { page: 'Fixture#part', kind: 'monster' }, { page: 'Fixture', kind: 'article' },
        { page: 'Fixture', kind: 'quest', limit: 11 },
    ])('validates unsupported requests before any API read', async args => {
        expect((await handleEntityTool('get_wiki_entity_facts', args)).isError).toBe(true);
    });
});
