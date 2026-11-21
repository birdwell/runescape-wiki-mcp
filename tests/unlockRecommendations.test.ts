import { afterAll, afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import nock from 'nock';
import { JevSession } from '../src/jev.js';
import { recommendUnlocks } from '../src/unlockRecommendations.js';
import { recommendationInput } from '../src/tools/recommendationTools.js';
import { playerDataPath, playerDataQuests } from './testUtils.js';

beforeEach(() => {
    nock.cleanAll(); nock.disableNetConnect();
    // These failure scenarios have no source for the named target and must never call Jev.
    nock('https://runescape.wiki').get('/api.php').query(q => q.page === 'Invention')
        .reply(200, { error: { code: 'missingtitle' } });
});
afterEach(() => nock.cleanAll());
afterAll(() => nock.enableNetConnect());

async function recommend(username: string | undefined = 'Fixture') {
    const input = recommendationInput.parse({ goal: 'Unlock Test city', unlock: 'Test city',
        context: { username: username || undefined, members: true, skills: {} } });
    const session = new JevSession({ apiKey: 'test-key', model: 'jev-test' });
    const result = await recommendUnlocks(input, { ...input.context, skills: {}, skillExperience: {} },
        session, AbortSignal.timeout(5000));
    expect(result.status).toBe('no_match');
    expect(result.recommendation).toBeNull();
    expect(session.usage.rounds).toBe(0);
    return result;
}

describe('unlock recommendation source failures', () => {
    it.each([
        ['PLAYER_NOT_FOUND', 404, 'does not exist or is hidden', true],
        ['PLAYER_NOT_MEMBER', 403, 'only returns quest data for members', false],
        ['INTERNAL_ERROR', 500, 'request failed (500 INTERNAL_ERROR)', false],
    ] as const)('preserves the specific %s warning and only requests actionable context', async (error, status, reason, actionable) => {
        const player = nock('https://secure.runescape.com').get(playerDataPath('Fixture'))
            .query({ includeQuests: 'true' }).reply(status, { error });
        const result = await recommend();
        player.done();
        expect(result.warnings).toEqual(expect.arrayContaining([expect.stringContaining(reason),
            expect.stringContaining('Quest unlock coverage is unavailable')]));
        expect(result.missingContext).toEqual(actionable ? [expect.stringContaining('Public username')] : []);
    });

    it('requests a username when none was supplied', async () => {
        const result = await recommend('');
        expect(result.missingContext).toEqual([expect.stringContaining('Public username')]);
        expect(result.warnings).toContainEqual(expect.stringContaining('Quest unlock coverage is unavailable'));
    });

    it('does not request another username for a malformed journal', async () => {
        nock('https://secure.runescape.com').get(playerDataPath('Fixture')).query({ includeQuests: 'true' })
            .reply(200, { quests: {} });
        const result = await recommend();
        expect(result.missingContext).toEqual([]);
        expect(result.warnings).toContainEqual(expect.stringContaining('unavailable or malformed quest journal'));
    });

    it('does not request another username for a rate limit', async () => {
        nock('https://secure.runescape.com').get(playerDataPath('Fixture')).query({ includeQuests: 'true' })
            .reply(429, { error: 'RATE_LIMITED' }, { 'Retry-After': '30' });
        const result = await recommend();
        expect(result.missingContext).toEqual([]);
        expect(result.warnings).toContainEqual(expect.stringContaining('Quest unlock coverage is unavailable'));
    });

    it.each(['catalogue', 'PvM guide'])('does not ask for a username when the Wiki %s fails', async failure => {
        const title = `Unlock ${failure} Quest`;
        const player = nock('https://secure.runescape.com').get(playerDataPath('Fixture')).query({ includeQuests: 'true' })
            .reply(200, playerDataQuests([{ title, status: 'NOT_STARTED', members: false, userEligible: true, questPoints: 1 }]));
        const catalogue = nock('https://runescape.wiki').get('/api.php').query(q => q.prop === 'revisions');
        const wiki = failure === 'catalogue' ? catalogue.reply(503, { error: { code: 'unavailable' } })
            : catalogue.reply((request: Request) => {
                const titles = new URL(request.url).searchParams.get('titles')!.split('|');
                return [200, { query: { pages: Object.fromEntries(titles.map((page, i) => [String(i), { title: page,
                    revisions: [{ revid: 123, slots: { main: { '*': page === 'Module:Questreq/data'
                        ? `local quests = { [${JSON.stringify(title)}] = {}, }`
                        : '{{Quest details|requirements=None}}{{Quest rewards|rewards=Access to Test city}}' } } }],
                }])) } }];
            });
        const guide = failure === 'PvM guide' ? nock('https://runescape.wiki').get('/api.php')
            .query(q => q.page === 'PvM unlock guide').reply(503, { error: { code: 'unavailable' } }) : undefined;
        const result = await recommend();
        player.done(); wiki.done(); guide?.done();
        expect(result.missingContext).toEqual([]);
        expect(result.warnings).toContainEqual(expect.stringContaining('Wiki quest catalogue or PvM unlock guide was unavailable'));
        expect(result.warnings).toContainEqual(expect.stringContaining('Quest unlock coverage is unavailable'));
    });
});
