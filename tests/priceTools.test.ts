// Tests for price tools

import nock from 'nock';
import { handlePriceTool } from '../src/tools/priceTools.js';
import { mockResponses, validateToolResponse } from './testUtils.js';

describe('Price Tools', () => {
    beforeEach(() => {
        nock.cleanAll();
    });

    afterAll(() => {
        nock.restore();
    });

    describe('get_latest_prices', () => {
        it('should get latest prices for all items', async () => {
            nock('https://prices.runescape.wiki')
                .get('/api/v1/rs/latest')
                .reply(200, mockResponses.latestPrices);

            const response = await handlePriceTool('get_latest_prices', {});

            validateToolResponse(response);
            expect(response.content[0].text).toContain('Latest Grand Exchange Prices');
            expect(response.content[0].text).toContain('4151');
        });

        it('should get latest price for specific item', async () => {
            nock('https://prices.runescape.wiki')
                .get('/api/v1/rs/latest?id=4151')
                .reply(200, { "4151": mockResponses.latestPrices["4151"] });

            const response = await handlePriceTool('get_latest_prices', { itemId: 4151 });

            validateToolResponse(response);
            expect(response.content[0].text).toContain('Latest Grand Exchange Prices');
        });
    });

    describe('get_5m_prices', () => {
        it('should get 5-minute average prices', async () => {
            const mock5mData = {
                timestamp: 1640995200,
                data: {
                    "4151": { avgHighPrice: 2400000, avgLowPrice: 2350000 }
                }
            };

            nock('https://prices.runescape.wiki')
                .get('/api/v1/rs/5m')
                .reply(200, mock5mData);

            const response = await handlePriceTool('get_5m_prices', {});

            validateToolResponse(response);
            expect(response.content[0].text).toContain('5-Minute Average Prices');
        });
    });

    describe('get_1h_prices', () => {
        it('should get 1-hour average prices', async () => {
            const mock1hData = {
                timestamp: 1640995200,
                data: {
                    "4151": { avgHighPrice: 2380000, avgLowPrice: 2330000 }
                }
            };

            nock('https://prices.runescape.wiki')
                .get('/api/v1/rs/1h')
                .reply(200, mock1hData);

            const response = await handlePriceTool('get_1h_prices', {});

            validateToolResponse(response);
            expect(response.content[0].text).toContain('1-Hour Average Prices');
        });
    });

    describe('get_timeseries', () => {
        it('should get price timeseries data', async () => {
            const mockTimeseries = {
                data: {
                    "1640995200000": 2400000,
                    "1640998800000": 2390000
                }
            };

            nock('https://prices.runescape.wiki')
                .get('/api/v1/rs/timeseries?id=4151&timestep=1h')
                .reply(200, mockTimeseries);

            const response = await handlePriceTool('get_timeseries', {
                itemId: 4151,
                timestep: '1h'
            });

            validateToolResponse(response);
            expect(response.content[0].text).toContain('Price Time Series for Item 4151');
        });

        it('should require itemId parameter', async () => {
            await expect(handlePriceTool('get_timeseries', { timestep: '1h' }))
                .rejects.toThrow();
        });
    });

    it('should throw error for unknown tool', async () => {
        await expect(handlePriceTool('unknown_tool', {}))
            .rejects.toThrow('Unknown price tool: unknown_tool');
    });
}); 