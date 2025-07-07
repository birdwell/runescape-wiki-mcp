// Tests for error handling

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import { handleItemTool } from '../src/tools/itemTools.js';
import { handlePriceTool } from '../src/tools/priceTools.js';
import { RS3_PRICES_API, RS_GE_API } from '../src/constants.js';

describe('Error Handling', () => {
    beforeEach(() => {
        nock.cleanAll();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    describe('API Error Responses', () => {
        it('should handle 404 errors for price tools', async () => {
            nock(RS3_PRICES_API)
                .get('/catalogue/detail.json?item=4151')
                .reply(404, 'Not found');

            await expect(handlePriceTool('get_item_price', { itemId: 4151 }))
                .rejects.toThrow('API request failed: 404');
        });

        it('should handle 500 errors', async () => {
            nock(RS_GE_API)
                .get('/catalogue/detail.json?item=4151')
                .reply(500, 'Internal Server Error');

            await expect(handleItemTool('get_item_detail', { itemId: 4151 }))
                .rejects.toThrow('API request failed: 500');
        });

        it('should handle malformed JSON', async () => {
            nock(RS3_PRICES_API)
                .get('/info.json')
                .reply(200, 'invalid json');

            await expect(handlePriceTool('get_ge_info', {}))
                .rejects.toThrow();
        });
    });

    describe('Invalid Tool Usage', () => {
        it('should throw error for unknown price tool', async () => {
            await expect(handlePriceTool('unknown_tool', {}))
                .rejects.toThrow('Unknown price tool: unknown_tool');
        });

        it('should throw error for unknown item tool', async () => {
            await expect(handleItemTool('unknown_tool', {}))
                .rejects.toThrow('Unknown item tool: unknown_tool');
        });
    });

    describe('Network Errors', () => {
        it('should handle connection refused', async () => {
            nock(RS_GE_API)
                .get('/info.json')
                .replyWithError({ code: 'ECONNREFUSED' });

            await expect(handleItemTool('get_ge_info', {}))
                .rejects.toThrow();
        });
    });
}); 