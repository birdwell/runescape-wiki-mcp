import { describe, it, expect } from '@jest/globals';
import { enrichGeInfo } from '../src/geInfo.js';

describe('GE configuration date interpretation', () => {
    it('anchors RuneDay zero to 27 February 2002 UTC', () => {
        expect(enrichGeInfo({ lastConfigUpdateRuneday: 0 }, new Date('2002-02-28T00:00:00Z')))
            .toMatchObject({ lastConfigUpdateDate: '2002-02-27', configurationAgeDays: 1,
                categoryCount: 44, priceFreshness: 'not_reported' });
    });
    it('matches the documented RuneDate example and counts UTC calendar days', () => {
        expect(enrichGeInfo({ lastConfigUpdateRuneday: 8505 }, new Date('2025-06-13T00:00:01Z')))
            .toMatchObject({ lastConfigUpdateDate: '2025-06-11', configurationAgeDays: 2,
                fetchedAt: '2025-06-13T00:00:01.000Z' });
    });
    it('exposes a future configuration date rather than hiding clock disagreement', () => {
        expect(enrichGeInfo({ lastConfigUpdateRuneday: 8505 }, new Date('2025-06-10T23:59:59Z'))
            .configurationAgeDays).toBe(-1);
    });
    it.each([null, {}, { lastConfigUpdateRuneday: '8505' }, { lastConfigUpdateRuneday: -1 },
        { lastConfigUpdateRuneday: 0.5 }, { lastConfigUpdateRuneday: Number.MAX_SAFE_INTEGER }])
    ('rejects invalid upstream configuration metadata: %j', data => {
        expect(() => enrichGeInfo(data)).toThrow();
    });
});
