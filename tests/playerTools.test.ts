// Tests for player tools

import nock from 'nock';
import { handlePlayerTool } from '../src/tools/playerTools.js';
import { mockResponses, validateToolResponse } from './testUtils.js';

describe('Player Tools', () => {
    beforeEach(() => {
        nock.cleanAll();
    });

    afterAll(() => {
        nock.restore();
    });

    describe('get_player_stats', () => {
        it('should get player stats for RS3', async () => {
            nock('https://secure.runescape.com')
                .get('/m=hiscore/m=hiscore/index_lite.ws?player=TestPlayer')
                .reply(200, mockResponses.playerStats);

            const response = await handlePlayerTool('get_player_stats', {
                username: 'TestPlayer'
            });

            validateToolResponse(response);
            expect(response.content[0].text).toContain('Player Stats for TestPlayer (normal)');
            expect(response.content[0].text).toContain('Overall');
            expect(response.content[0].text).toContain('Attack');
        });

        it('should get player stats for ironman', async () => {
            nock('https://secure.runescape.com')
                .get('/m=hiscore/m=hiscore_ironman/index_lite.ws?player=TestPlayer')
                .reply(200, mockResponses.playerStats);

            const response = await handlePlayerTool('get_player_stats', {
                username: 'TestPlayer',
                gameMode: 'ironman'
            });

            validateToolResponse(response);
            expect(response.content[0].text).toContain('Player Stats for TestPlayer (ironman)');
        });

        it('should handle different game modes', async () => {
            nock('https://secure.runescape.com')
                .get('/m=hiscore/m=hiscore_hardcore_ironman/index_lite.ws?player=TestPlayer')
                .reply(200, mockResponses.playerStats);

            const response = await handlePlayerTool('get_player_stats', {
                username: 'TestPlayer',
                gameMode: 'hardcore'
            });

            validateToolResponse(response);
            expect(response.content[0].text).toContain('Player Stats for TestPlayer (hardcore)');
        });

        it('should handle player not found', async () => {
            nock('https://secure.runescape.com')
                .get('/m=hiscore/m=hiscore/index_lite.ws?player=NonExistent')
                .reply(404, 'Player not found');

            await expect(handlePlayerTool('get_player_stats', {
                username: 'NonExistent'
            })).rejects.toThrow('API request failed: 404');
        });

        it('should require username parameter', async () => {
            await expect(handlePlayerTool('get_player_stats', {}))
                .rejects.toThrow('Username is required');
        });
    });

    it('should throw error for unknown tool', async () => {
        await expect(handlePlayerTool('unknown_tool', {}))
            .rejects.toThrow('Unknown player tool: unknown_tool');
    });
}); 