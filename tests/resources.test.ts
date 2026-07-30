// Tests for resources

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import { handleResource } from '../src/resources.js';
import { RESOURCE_URIS, RS3_GE_API } from '../src/constants.js';

describe('Resources', () => {
    beforeEach(() => {
        nock.cleanAll();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    describe('GE_INFO resource', () => {
        it('should return Grand Exchange info', async () => {
            nock(RS3_GE_API)
                .get('/info.json')
                .reply(200, { lastConfigUpdateRuneday: 8526 });

            const response = await handleResource({
                params: { uri: RESOURCE_URIS.GE_INFO },
            } as never);

            expect(response.contents).toHaveLength(1);
            expect(response.contents[0].uri).toBe(RESOURCE_URIS.GE_INFO);
            expect(response.contents[0].text).toContain('lastConfigUpdateRuneday');
        });
    });

    describe('GE_CATEGORIES resource', () => {
        it('should return the canonical category list', async () => {
            const response = await handleResource({
                params: { uri: RESOURCE_URIS.GE_CATEGORIES },
            } as never);

            expect(response.contents[0].uri).toBe(RESOURCE_URIS.GE_CATEGORIES);
            expect(response.contents[0].text).toContain('Melee weapons - high level');
            expect(response.contents[0].text).toContain('"id": 24');
        });
    });

    describe('handleResource', () => {
        it('should throw ResourceNotFoundError for unknown resource', async () => {
            await expect(
                handleResource({
                    params: { uri: 'runescape://unknown/resource' },
                } as never)
            ).rejects.toMatchObject({
                code: -32602,
                message: expect.stringContaining('Resource not found'),
            });
        });
    });
});
