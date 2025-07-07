// Integration tests

import nock from 'nock';
import { handleTool } from '../src/tools/index.js';
import { handleResource } from '../src/resources.js';
import { mockResponses } from './testUtils.js';

describe('Integration Tests', () => {
    beforeEach(() => {
        nock.cleanAll();
    });

    afterAll(() => {
        nock.restore();
    });

    describe('Tool Integration', () => {
        it('should handle price tool workflow', async () => {
            // Mock API responses
            nock('https://prices.runescape.wiki')
                .get('/api/v1/rs/latest')
                .reply(200, mockResponses.latestPrices);

            nock('https://prices.runescape.wiki')
                .get('/api/v1/rs/timeseries?id=4151&timestep=1h')
                .reply(200, { data: { "1640995200000": 2400000 } });

            // Get latest prices
            const latestPrices = await handleTool('get_latest_prices', {});
            expect(latestPrices.content[0].text).toContain('4151');

            // Get timeseries for specific item
            const timeseries = await handleTool('get_timeseries', {
                itemId: 4151,
                timestep: '1h'
            });
            expect(timeseries.content[0].text).toContain('Price Time Series');
        });

        it('should handle item tool workflow', async () => {
            // Mock API responses
            nock('https://prices.runescape.wiki')
                .get('/api/v1/rs/mapping')
                .reply(200, mockResponses.itemMapping);

            nock('https://services.runescape.com')
                .get('/m=itemdb_rs/api/catalogue/detail.json?item=4151')
                .reply(200, mockResponses.itemDetail);

            // Get item mapping
            const mapping = await handleTool('get_item_mapping', {});
            expect(mapping.content[0].text).toContain('Abyssal whip');

            // Get specific item details
            const details = await handleTool('get_item_detail', { itemId: 4151 });
            expect(details.content[0].text).toContain('Item Detail for 4151');
        });

        it('should handle player stats workflow', async () => {
            // Mock API response
            nock('https://secure.runescape.com')
                .get('/m=hiscore/m=hiscore/index_lite.ws?player=TestPlayer')
                .reply(200, mockResponses.playerStats);

            const stats = await handleTool('get_player_stats', {
                username: 'TestPlayer'
            });
            expect(stats.content[0].text).toContain('Player Stats for TestPlayer');
        });
    });

    describe('Resource Integration', () => {
        it('should read latest prices resource', async () => {
            nock('https://prices.runescape.wiki')
                .get('/api/v1/rs/latest')
                .reply(200, mockResponses.latestPrices);

            const prices = await handleResource({
                method: 'resources/read' as const,
                params: { uri: 'runescape://prices/latest' }
            });

            expect(prices.contents).toHaveLength(1);
            expect(prices.contents[0].text).toContain('4151');
        });

        it('should read item mapping resource', async () => {
            nock('https://prices.runescape.wiki')
                .get('/api/v1/rs/mapping')
                .reply(200, mockResponses.itemMapping);

            const mapping = await handleResource({
                method: 'resources/read' as const,
                params: { uri: 'runescape://items/mapping' }
            });

            expect(mapping.contents).toHaveLength(1);
            expect(mapping.contents[0].text).toContain('Abyssal whip');
        });
    });

    describe('Error Handling Integration', () => {
        it('should handle tool errors gracefully', async () => {
            // Unknown tool
            await expect(handleTool('unknown_tool', {}))
                .rejects.toThrow('Unknown tool: unknown_tool');

            // Missing parameters
            await expect(handleTool('get_item_detail', {}))
                .rejects.toThrow();
        });

        it('should handle resource errors gracefully', async () => {
            // Unknown resource
            await expect(handleResource({
                method: 'resources/read' as const,
                params: { uri: 'unknown://resource' }
            })).rejects.toThrow('Unknown resource: unknown://resource');
        });
    });
}); 