// Aggregate service usage only. Never pass tool arguments, results, URLs, or client headers here.
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { PostHog } from 'posthog-node';
import { SERVER_CONFIG } from './constants.js';

type Context = { request_id?: string; tool_call_id?: string; tool_name?: string };
type Properties = Record<string, string | number | boolean | undefined>;
const context = new AsyncLocalStorage<Context>();
let client: PostHog | undefined;
let transport: 'http' | 'stdio' = 'http';
let environment = 'development';

export async function initializeAnalytics(mode: typeof transport): Promise<void> {
    const env = process.env;
    if (client || env.POSTHOG_ENABLED !== 'true' || !env.POSTHOG_PROJECT_KEY) return;
    // A project key alone must never turn a local installation into a telemetry source.
    if (mode === 'stdio' && env.POSTHOG_STDIO_ENABLED !== 'true') return;
    // Avoid loading an additional SDK in installations with telemetry disabled.
    const { PostHog } = await import('posthog-node');
    transport = mode;
    environment = env.POSTHOG_ENVIRONMENT ?? env.NODE_ENV ?? 'development';
    client = new PostHog(env.POSTHOG_PROJECT_KEY, {
        host: env.POSTHOG_HOST ?? 'https://us.i.posthog.com',
        flushAt: 20,
        flushInterval: 5_000,
        maxQueueSize: 1_000,
        requestTimeout: 3_000,
        fetchRetryCount: 1,
        fetchRetryDelay: 500,
        disableGeoip: true,
    });
    // Never log SDK error objects, which can contain request data or credentials.
    client.on('error', () => console.error('PostHog delivery failed; usage counts may be incomplete.'));
}

function capture(event: string, properties: Properties): void {
    if (!client) return;
    try {
        client.capture({
            distinctId: `runescape-wiki-mcp:${transport}`,
            event,
            properties: {
                ...context.getStore(),
                ...properties,
                service: SERVER_CONFIG.name,
                service_version: SERVER_CONFIG.version,
                environment,
                transport,
                $process_person_profile: false,
                $geoip_disable: true,
            },
        });
    } catch {
        // Analytics must not change a tool's response or availability.
        console.error('PostHog capture failed; usage counts may be incomplete.');
    }
}

export async function shutdownAnalytics(): Promise<void> {
    const current = client;
    client = undefined;
    try {
        await current?.shutdown(5_000);
    } catch {
        console.error('PostHog shutdown failed; usage counts may be incomplete.');
    }
}

export function withRequestContext<T>(requestId: string, callback: () => T): T {
    return context.run({ request_id: requestId }, callback);
}

export function recordHttpRequest(properties: {
    request_id: string;
    method: string;
    status_code: number;
    duration_ms: number;
    outcome: 'finished' | 'aborted';
}): void {
    capture('mcp_http_request', {
        ...properties,
        method: ['GET', 'POST', 'DELETE', 'OPTIONS', 'HEAD'].includes(properties.method)
            ? properties.method : 'OTHER',
        route: '/mcp',
    });
}

export async function observeTool<T extends { isError?: boolean }>(
    name: string,
    callback: () => Promise<T>,
): Promise<T> {
    return context.run({
        ...context.getStore(), tool_name: name, tool_call_id: randomUUID(),
    }, async () => {
        const started = performance.now();
        let success = false;
        try {
            const result = await callback();
            success = result.isError !== true;
            return result;
        } finally {
            capture('rs_mcp_tool_call', {
                success, duration_ms: Math.round(performance.now() - started),
            });
        }
    });
}

export function recordUpstreamRequest(url: string, properties: {
    status_code?: number;
    success: boolean;
    duration_ms: number;
    error_kind?: 'http' | 'network' | 'parse';
}): void {
    // Classify against a fixed vocabulary. Full paths can contain item IDs; queries contain names.
    let provider = 'other';
    try {
        const parsed = new URL(url);
        if (parsed.hostname === 'secure.runescape.com') {
            provider = parsed.pathname.startsWith('/m=itemdb_rs/') ? 'jagex_ge' : 'jagex_hiscores';
        } else if (parsed.hostname === 'api.weirdgloop.org') {
            provider = 'weirdgloop';
        } else if (parsed.hostname === 'runescape.wiki') {
            provider = 'runescape_wiki';
        }
    } catch { /* Do not record malformed URLs. */ }
    capture('upstream_api_call', { provider, ...properties });
}
