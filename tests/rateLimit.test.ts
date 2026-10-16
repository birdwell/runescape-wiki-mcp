import { afterEach, describe, expect, it } from '@jest/globals';
import { consumeRateLimit, resetRateLimits } from '../src/rateLimit.js';

describe('rate limit', () => {
    afterEach(() => {
        resetRateLimits();
    });

    it('allows a burst and then asks the caller to wait', () => {
        const now = 1_000_000;
        expect(consumeRateLimit('1.2.3.4', now, 2)).toEqual({ ok: true });
        expect(consumeRateLimit('1.2.3.4', now + 10, 2)).toEqual({ ok: true });
        expect(consumeRateLimit('1.2.3.4', now + 20, 2)).toEqual({
            ok: false,
            retryAfterSeconds: 60,
        });
        expect(consumeRateLimit('5.6.7.8', now + 20, 2)).toEqual({ ok: true });
    });

    it('resets the budget after the window', () => {
        const now = 1_000_000;
        consumeRateLimit('1.2.3.4', now, 1);
        expect(consumeRateLimit('1.2.3.4', now + 60_000, 1)).toEqual({ ok: true });
    });
});
