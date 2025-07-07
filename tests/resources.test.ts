// Tests for resources

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import { handleResource } from '../src/resources.js';
import { RESOURCE_URIS, RS3_PRICES_API } from '../src/constants.js';

describe('Resources', () => {
    beforeEach(() => {
        nock.cleanAll();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    describe('LATEST_PRICES resource', () => {
        it('should return Grand Exchange info', async () => {
            const mockResponse = {
                lastConfigUpdateRuneday: 8526
            };

            nock(RS3_PRICES_API)
                .get('/info.json')
                .reply(200, mockResponse);

            const request = {
                params: {
                    uri: RESOURCE_URIS.LATEST_PRICES
                }
            };

            const response = await handleResource(request as any);

            expect(response.contents).toHaveLength(1);
            expect(response.contents[0].uri).toBe(RESOURCE_URIS.LATEST_PRICES);
            expect(response.contents[0].mimeType).toBe('application/json');
            expect(response.contents[0].text).toContain('lastConfigUpdateRuneday');
            expect(response.contents[0].text).toContain('8526');
        });
    });

    describe('ITEM_MAPPING resource', () => {
        it('should return category information', async () => {
            const mockResponse = {
                types: [],
                alpha: [
                    { letter: 'a', items: 6 },
                    { letter: 'b', items: 10 }
                ]
            };

            nock(RS3_PRICES_API)
                .get('/catalogue/category.json?category=1')
                .reply(200, mockResponse);

            const request = {
                params: {
                    uri: RESOURCE_URIS.ITEM_MAPPING
                }
            };

            const response = await handleResource(request as any);

            expect(response.contents).toHaveLength(1);
            expect(response.contents[0].uri).toBe(RESOURCE_URIS.ITEM_MAPPING);
            expect(response.contents[0].mimeType).toBe('application/json');
            expect(response.contents[0].text).toContain('alpha');
            expect(response.contents[0].text).toContain('items');
        });
    });

    describe('handleResource', () => {
        it('should throw error for unknown resource', async () => {
            const request = {
                params: {
                    uri: 'runescape://unknown/resource'
                }
            };

            await expect(handleResource(request as any))
                .rejects.toThrow('Unknown resource: runescape://unknown/resource');
        });
    });
}); 