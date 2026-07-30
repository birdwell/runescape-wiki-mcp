// Tests for player tools

import nock from 'nock';
import { handlePlayerTool } from '../src/tools/playerTools.js';
import { mockResponses, validateToolResponse } from './testUtils.js';

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
                .get('/m=hiscore/index_lite.ws')
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

        it('should surface ironman lite 404 clearly instead of falling back', async () => {
            nock('https://secure.runescape.com')
                .get('/m=hiscore_ironman/index_lite.ws')
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
        });

        it('should surface hardcore lite 404 clearly', async () => {
            nock('https://secure.runescape.com')
                .get('/m=hiscore_hardcore_ironman/index_lite.ws')
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
                .get('/m=hiscore/index_lite.ws')
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

    it('should throw error for unknown tool', async () => {
        await expect(handlePlayerTool('unknown_tool', {})).rejects.toThrow(
            'Unknown player tool: unknown_tool'
        );
    });
});
