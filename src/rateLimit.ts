// Per-IP request budget for the public HTTP endpoint.
// Fly health checks and discovery documents are not counted.

const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 60;

interface Bucket {
    count: number;
    resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function rateLimitPerMinute(): number {
    const raw = process.env.RATE_LIMIT_PER_MINUTE;
    const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_LIMIT;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LIMIT;
}

export function clientKeyFromHeaders(headers: { get(name: string): string | null }): string {
    const fly = headers.get('fly-client-ip');
    if (fly) {
        return fly;
    }
    const cloudflare = headers.get('cf-connecting-ip');
    if (cloudflare) {
        return cloudflare;
    }
    const forwarded = headers.get('x-forwarded-for');
    if (forwarded) {
        return forwarded.split(',')[0]?.trim() || 'unknown';
    }
    return 'unknown';
}

export function consumeRateLimit(
    key: string,
    now = Date.now(),
    limit = rateLimitPerMinute()
): { ok: true } | { ok: false; retryAfterSeconds: number } {
    const current = buckets.get(key);
    if (!current || now >= current.resetAt) {
        buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
        return { ok: true };
    }
    if (current.count >= limit) {
        return {
            ok: false,
            retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
        };
    }
    current.count += 1;
    return { ok: true };
}

export function resetRateLimits(): void {
    buckets.clear();
}

export function tooManyRequestsResponse(retryAfterSeconds: number): Response {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: {
            'content-type': 'application/json',
            'retry-after': String(retryAfterSeconds),
        },
    });
}
