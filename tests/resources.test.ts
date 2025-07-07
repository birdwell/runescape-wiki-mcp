// Tests for resources

import nock from 'nock';
import { resources, handleResource } from '../src/resources.js';
import { ReadResourceRequest } from '@modelcontextprotocol/sdk/types.js';
import { RESOURCE_URIS, RS3_PRICES_API } from '../src/constants.js';

describe('Resources', () => {

    beforeEach(() => {
        nock.cleanAll();
    });

    afterAll(() => {
        nock.restore();
    });

    describe('Resource definitions', () => {
        it('should have all required resources', () => {
            expect(resources.length).toBe(2);

            const resourceUris = resources.map(r => r.uri);
            expect(resourceUris).toContain(RESOURCE_URIS.LATEST_PRICES);
            expect(resourceUris).toContain(RESOURCE_URIS.ITEM_MAPPING);
        });

        it('should have valid resource properties', () => {
            resources.forEach(resource => {
                expect(resource.uri).toBeDefined();
                expect(resource.name).toBeDefined();
                expect(resource.description).toBeDefined();
                expect(resource.mimeType).toBe('application/json');
            });
        });
    });

    describe('handleResource', () => {
        it('should read latest prices resource', async () => {
            const mockPricesData = {
                data: {
                    4151: { high: 2400000, low: 2380000 }
                }
            };

            nock('https://prices.runescape.wiki')
                .get('/api/v1/rs/latest')
                .reply(200, mockPricesData);

            const request: ReadResourceRequest = {
                method: 'resources/read' as const,
                params: { uri: RESOURCE_URIS.LATEST_PRICES }
            };

            const response = await handleResource(request);

            expect(response.contents).toHaveLength(1);
            expect(response.contents[0].uri).toBe(RESOURCE_URIS.LATEST_PRICES);
            expect(response.contents[0].mimeType).toBe('application/json');
            expect(response.contents[0].text).toContain('4151');
        });

        it('should read item mapping resource', async () => {
            const mockMappingData = {
                4151: {
                    name: 'Abyssal whip',
                    examine: 'A weapon from the abyss.',
                    members: true
                }
            };

            nock('https://prices.runescape.wiki')
                .get('/api/v1/rs/mapping')
                .reply(200, mockMappingData);

            const request: ReadResourceRequest = {
                method: 'resources/read' as const,
                params: { uri: RESOURCE_URIS.ITEM_MAPPING }
            };

            const response = await handleResource(request);

            expect(response.contents).toHaveLength(1);
            expect(response.contents[0].uri).toBe(RESOURCE_URIS.ITEM_MAPPING);
            expect(response.contents[0].text).toContain('Abyssal whip');
        });

        it('should throw error for unknown resource', async () => {
            const request: ReadResourceRequest = {
                method: 'resources/read' as const,
                params: { uri: 'unknown://resource' }
            };

            await expect(handleResource(request))
                .rejects.toThrow('Unknown resource: unknown://resource');
        });
    });
}); 