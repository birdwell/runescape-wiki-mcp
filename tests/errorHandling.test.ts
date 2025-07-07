// Tests for error handling

import nock from 'nock';
import { handlePriceTool } from '../src/tools/priceTools.js';
import { handleItemTool } from '../src/tools/itemTools.js';
import { handlePlayerTool } from '../src/tools/playerTools.js';
import { createErrorResponse } from '../src/utils.js';

describe('Error Handling', () => {
    beforeEach(() => {
        nock.cleanAll();
    });

    afterAll(() => {
        nock.restore();
    });

    describe('API Error Responses', () => {
        it('should handle 404 errors', async () => {
            nock('https://prices.runescape.wiki')
                .get('/api/v1/rs/latest')
                .reply(404, 'Not Found');

            await expect(handlePriceTool('get_latest_prices', {}))
                .rejects.toThrow('API request failed: 404');
        });

        it('should handle 500 errors', async () => {
            nock('https://services.runescape.com')
                .get('/m=itemdb_rs/api/catalogue/detail.json?item=4151')
                .reply(500, 'Internal Server Error');

            await expect(handleItemTool('get_item_detail', { itemId: 4151 }))
                .rejects.toThrow('API request failed: 500');
        });

        it('should handle 503 errors', async () => {
            nock('https://secure.runescape.com')
                .get('/m=hiscore/m=hiscore/index_lite.ws?player=TestPlayer')
                .reply(503, 'Service Unavailable');

            await expect(handlePlayerTool('get_player_stats', { username: 'TestPlayer' }))
                .rejects.toThrow('API request failed: 503');
        });
    });

    describe('Network Errors', () => {
        it('should handle network timeouts', async () => {
            nock('https://prices.runescape.wiki')
                .get('/api/v1/rs/latest')
                .replyWithError({ code: 'ETIMEDOUT' });

            await expect(handlePriceTool('get_latest_prices', {}))
                .rejects.toThrow();
        });

        it('should handle connection refused', async () => {
            nock('https://services.runescape.com')
                .get('/m=itemdb_rs/api/info.json')
                .replyWithError({ code: 'ECONNREFUSED' });

            await expect(handleItemTool('get_ge_info', {}))
                .rejects.toThrow();
        });
    });

    describe('Invalid Parameters', () => {
        it('should handle missing required parameters', async () => {
            await expect(handleItemTool('get_item_detail', {}))
                .rejects.toThrow();

            await expect(handlePriceTool('get_timeseries', { timestep: '1h' }))
                .rejects.toThrow();

            await expect(handlePlayerTool('get_player_stats', {}))
                .rejects.toThrow('Username is required');
        });

        it('should handle unknown tool names', async () => {
            await expect(handlePriceTool('unknown_tool', {}))
                .rejects.toThrow('Unknown price tool: unknown_tool');

            await expect(handleItemTool('unknown_tool', {}))
                .rejects.toThrow('Unknown item tool: unknown_tool');

            await expect(handlePlayerTool('unknown_tool', {}))
                .rejects.toThrow('Unknown player tool: unknown_tool');
        });
    });

    describe('Error Response Helper', () => {
        it('should create error response from Error object', () => {
            const error = new Error('Test error message');
            const response = createErrorResponse(error);

            expect(response.isError).toBe(true);
            expect(response.content).toHaveLength(1);
            expect(response.content[0].type).toBe('text');
            expect(response.content[0].text).toBe('Error: Test error message');
        });

        it('should create error response from string', () => {
            const response = createErrorResponse('String error');

            expect(response.isError).toBe(true);
            expect(response.content[0].text).toBe('Error: String error');
        });

        it('should create error response from unknown type', () => {
            const response = createErrorResponse({ custom: 'error' });

            expect(response.isError).toBe(true);
            expect(response.content[0].text).toContain('Error:');
        });
    });
}); 