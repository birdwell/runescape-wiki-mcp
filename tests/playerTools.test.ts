// Tests for player tools

import nock from 'nock';
import { handlePlayerTool } from '../src/tools/playerTools.js';
import { hiscoresJson, mockResponses, playerDataPath, playerDataSkills, validateToolResponse } from './testUtils.js';

describe('Player Tools', () => {
    beforeEach(() => {
        nock.cleanAll();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    describe('get_player_stats', () => {
        it('should get player stats for normal hiscores', async () => {
            nock('https://secure.runescape.com')
                .get('/m=hiscore/index_lite.json')
                .query({ player: 'TestPlayer' })
                .reply(200, mockResponses.playerStats);

            const response = await handlePlayerTool('get_player_stats', {
                username: 'TestPlayer',
            });

            validateToolResponse(response);
            expect(response.content[0].text).toContain('Player Stats for TestPlayer (normal)');
            expect(response.content[0].text).toContain('Overall');
            expect(response.content[0].text).toContain('Attack');
        });

        it.each([
            ['normal', '/m=hiscore/index_lite.json'],
            ['ironman', '/m=hiscore_ironman/index_lite.json'],
            ['hardcore', '/m=hiscore_hardcore_ironman/index_lite.json'],
        ])('reads the selected %s board without querying another mode', async (gameMode, path) => {
            nock('https://secure.runescape.com')
                .get(path).query({ player: 'Ranked Player' })
                .reply(200, hiscoresJson([[12, 3000, 1000000], [34, 99, 200000000]]));
            const result = await handlePlayerTool('get_player_stats', { username: 'Ranked Player', gameMode });
            expect(result.isError).toBeFalsy();
            expect(result.structuredContent?.Overall).toEqual({ rank: 12, level: 3000, experience: 1000000 });
            expect(result.content[0].text).toContain(`(${gameMode})`);
            expect(nock.isDone()).toBe(true);
        });

        it('maps rows by skill id to the existing output names', async () => {
            const body = hiscoresJson([[1, 2000, 9000000], [-1, 1, 0]]);
            body.skills.push(
                { id: 4, name: 'Hitpoints', rank: 7, level: 99, xp: 13034431 },
                { id: 21, name: 'Runecraft', rank: 8, level: 99, xp: 13034431 },
                { id: 99, name: 'Future Skill', rank: 1, level: 1, xp: 0 },
            );
            nock('https://secure.runescape.com')
                .get('/m=hiscore/index_lite.json').query({ player: 'TestPlayer' })
                .reply(200, body);
            const result = await handlePlayerTool('get_player_stats', { username: 'TestPlayer' });
            expect(result.isError).toBeFalsy();
            expect(result.structuredContent).toEqual({
                Overall: { rank: 1, level: 2000, experience: 9000000 },
                Attack: { rank: 'Unranked', level: 1, experience: 0 },
                Constitution: { rank: 7, level: 99, experience: 13034431 },
                Runecrafting: { rank: 8, level: 99, experience: 13034431 },
            });
        });

        it('treats -1 level and xp from older partial records as unavailable', async () => {
            nock('https://secure.runescape.com')
                .get('/m=hiscore/index_lite.json').query({ player: 'TestPlayer' })
                .reply(200, hiscoresJson([[-1, -1, -1]]));
            const result = await handlePlayerTool('get_player_stats', { username: 'TestPlayer' });
            expect(result.structuredContent?.Overall).toEqual({ rank: 'Unranked', level: 0, experience: 0 });
        });

        it('ignores the hardcore death record without changing the output shape', async () => {
            const body = hiscoresJson([[3, 3000, 5000000]]);
            Object.assign(body.skills[0], { death: { timeStamp: 1594717976929, worldID: 48, location: -1,
                npcKiller: -1, playerKiller: -1, deathReason: -1, language: 'EN', locationDescription: '', deathDescription: '' } });
            nock('https://secure.runescape.com')
                .get('/m=hiscore_hardcore_ironman/index_lite.json').query({ player: 'TestPlayer' })
                .reply(200, body);
            const result = await handlePlayerTool('get_player_stats', { username: 'TestPlayer', gameMode: 'hardcore' });
            expect(result.structuredContent?.Overall).toEqual({ rank: 3, level: 3000, experience: 5000000 });
        });

        it.each([
            ['an HTML body', '<html>maintenance</html>'],
            ['JSON without skills', { name: 'TestPlayer' }],
            ['an empty skills list', { name: 'TestPlayer', skills: [] }],
        ])('reports an unexpected response for %s', async (_label, body) => {
            nock('https://secure.runescape.com')
                .get('/m=hiscore/index_lite.json').query({ player: 'TestPlayer' })
                .reply(200, body as never);
            const result = await handlePlayerTool('get_player_stats', { username: 'TestPlayer' });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Unexpected hiscores response');
        });

        it('keeps Retry-After in the error on HTTP 429', async () => {
            nock('https://secure.runescape.com')
                .get('/m=hiscore/index_lite.json').query({ player: 'TestPlayer' })
                .reply(429, 'Too many requests', { 'Retry-After': '30' });
            await expect(handlePlayerTool('get_player_stats', { username: 'TestPlayer' }))
                .rejects.toThrow('429 Too Many Requests; retry after 30');
        });

        it('should surface ironman lite 404 clearly instead of falling back', async () => {
            nock('https://secure.runescape.com')
                .get('/m=hiscore_ironman/index_lite.json')
                .query({ player: 'TestPlayer' })
                .reply(404, 'Not found');

            const response = await handlePlayerTool('get_player_stats', {
                username: 'TestPlayer',
                gameMode: 'ironman',
            });

            expect(response.isError).toBe(true);
            expect(response.content[0].text).toContain('ironman');
            expect(response.content[0].text).toContain('404');
            expect(response.content[0].text).not.toContain('Overall');
            expect(response.content[0].text).not.toContain('unavailable');
            expect(response.content[0].text).toContain('No other board was queried');
        });

        it('should surface hardcore lite 404 clearly', async () => {
            nock('https://secure.runescape.com')
                .get('/m=hiscore_hardcore_ironman/index_lite.json')
                .query({ player: 'TestPlayer' })
                .reply(404, 'Not found');

            const response = await handlePlayerTool('get_player_stats', {
                username: 'TestPlayer',
                gameMode: 'hardcore',
            });

            expect(response.isError).toBe(true);
            expect(response.content[0].text).toContain('hardcore');
        });

        it('should handle player not found on normal board', async () => {
            nock('https://secure.runescape.com')
                .get('/m=hiscore/index_lite.json')
                .query({ player: 'NonExistent' })
                .reply(404, 'Player not found');

            const response = await handlePlayerTool('get_player_stats', {
                username: 'NonExistent',
            });

            expect(response.isError).toBe(true);
            expect(response.content[0].text).toContain('not found');
        });

        it('should require username parameter', async () => {
            const result = await handlePlayerTool('get_player_stats', {});
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toBe('username is required');
        });

        it('should reject unknown arguments', async () => {
            const result = await handlePlayerTool('get_player_stats', {
                username: 'Test',
                bogus: true,
            });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Unexpected argument');
        });
    });

    describe('get_player_skills', () => {
        const playerData = (username = 'Test Player') =>
            nock('https://secure.runescape.com').get(playerDataPath(username)).query({ includeSkills: 'true' });
        const hiscores = (username = 'Test Player') =>
            nock('https://secure.runescape.com').get('/m=hiscore/index_lite.json').query({ player: username });

        it('reads Player Data skills and maps them to get_player_stats names', async () => {
            playerData().reply(200, { name: 'Test Player', skills: {
                attack: { level: 70, fine_xp: 8137025 },
                hitpoints: { level: 99, fine_xp: 130344310 },
                runecraft: { level: 110, fine_xp: 2000000000 },
                newskill: { level: 1, fine_xp: 0 },
            } });
            const result = await handlePlayerTool('get_player_skills', { username: ' Test Player ' });
            expect(result.isError).toBeFalsy();
            expect(result.structuredContent).toMatchObject({
                username: 'Test Player', source: 'player_data',
                sourceUrl: `https://secure.runescape.com${playerDataPath('Test Player')}?includeSkills=true`,
                skills: {
                    Attack: { level: 70, experience: 813702 },
                    Constitution: { level: 99, experience: 13034431 },
                    Runecrafting: { level: 110, experience: 200000000 },
                },
            });
            expect(Object.keys(result.structuredContent?.skills as object)).toHaveLength(3);
            expect(result.structuredContent).not.toHaveProperty('fallbackReason');
        });

        it.each([
            ['a non-member', 403, { error: 'PLAYER_NOT_MEMBER' }, 'only returns skill data for members'],
            ['a hidden player', 404, { error: 'PLAYER_NOT_FOUND' }, 'does not exist or is hidden'],
            ['a malformed body', 200, { name: 'Test Player' }, 'malformed skill data'],
        ])('falls back to the normal hiscores for %s', async (_label, status, body, reason) => {
            playerData().reply(status, body);
            hiscores().reply(200, hiscoresJson([[5, 2000, 900000], [9, 80, 2000000], [-1, -1, -1]]));
            const result = await handlePlayerTool('get_player_skills', { username: 'Test Player' });
            expect(result.isError).toBeFalsy();
            expect(result.structuredContent).toMatchObject({
                source: 'hiscores',
                sourceUrl: 'https://secure.runescape.com/m=hiscore/index_lite.json?player=Test%20Player',
                skills: { Attack: { level: 80, experience: 2000000 } },
            });
            expect(result.structuredContent?.fallbackReason).toContain(reason);
            expect(Object.keys(result.structuredContent?.skills as object)).toEqual(['Attack']);
            expect(nock.isDone()).toBe(true);
        });

        it('reports both failures when the hiscores fallback also misses', async () => {
            playerData().reply(404, { error: 'PLAYER_NOT_FOUND' });
            hiscores().reply(404, 'Not found');
            const result = await handlePlayerTool('get_player_skills', { username: 'Test Player' });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('does not exist or is hidden');
            expect(result.content[0].text).toContain('Hiscores fallback: Player "Test Player" was not found on the normal hiscores');
        });

        it('surfaces Player Data 429 with Retry-After instead of falling back', async () => {
            playerData().reply(429, 'Too many requests', { 'Retry-After': '30' });
            const fallback = hiscores().reply(200, hiscoresJson([[1, 1, 1]]));
            await expect(handlePlayerTool('get_player_skills', { username: 'Test Player' }))
                .rejects.toThrow('429 Too Many Requests; retry after 30');
            expect(fallback.isDone()).toBe(false);
        });

        it('validates arguments', async () => {
            expect((await handlePlayerTool('get_player_skills', {})).isError).toBe(true);
            expect((await handlePlayerTool('get_player_skills', { username: 'x'.repeat(13) })).isError).toBe(true);
            const extra = await handlePlayerTool('get_player_skills', { username: 'Test', gameMode: 'ironman' });
            expect(extra.content[0].text).toContain('Unexpected argument');
        });
    });

    it('should throw error for unknown tool', async () => {
        await expect(handlePlayerTool('unknown_tool', {})).rejects.toThrow(
            'Unknown player tool: unknown_tool'
        );
    });
});
