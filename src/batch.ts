import { ApiRequestError, createSuccessResponse } from './utils.js';
import { isToolResponse, validationError } from './validation.js';
import type { ToolResponse } from './types.js';

export const MAX_BATCH_ITEMS = 10;

export function parseBatch<T>(value: unknown, label: string,
    parse: (value: unknown, label: string) => T | ToolResponse,
    unique = false): T[] | ToolResponse {
    if (!Array.isArray(value) || value.length < 1 || value.length > MAX_BATCH_ITEMS) {
        return validationError(`${label} must be an array of 1-${MAX_BATCH_ITEMS} entries`);
    }
    const parsed: T[] = [];
    for (const [index, entry] of value.entries()) {
        const result = parse(entry, `${label}[${index}]`);
        if (isToolResponse(result)) return result;
        parsed.push(result as T);
    }
    if (unique && new Set(parsed).size !== parsed.length) {
        return validationError(`${label} must contain unique entries`);
    }
    return parsed;
}

export function batchOutputSchema(query: object, data: object) {
    return {
        type: 'object' as const,
        properties: {
            results: { type: 'array' as const, items: {
                type: 'object' as const, properties: { query, data, error: { type: 'string' as const } },
                required: ['query'], oneOf: [{ required: ['data'] }, { required: ['error'] }],
                additionalProperties: false,
            } },
            succeeded: { type: 'integer' as const, minimum: 0 },
            failed: { type: 'integer' as const, minimum: 0 },
        },
        required: ['results', 'succeeded', 'failed'], additionalProperties: false,
    };
}

/** Bound upstream fan-out to two concurrent requests and preserve caller order. */
export async function runBatch<T extends string | number>(title: string, values: T[],
    call: (value: T) => Promise<ToolResponse>): Promise<ToolResponse> {
    const results: Array<{ query: T; data?: Record<string, unknown>; error?: string }> = new Array(values.length);
    let next = 0;
    let rateLimitMessage: string | undefined;
    await Promise.all(Array.from({ length: Math.min(2, values.length) }, async () => {
        while (next < values.length) {
            const index = next++;
            const query = values[index];
            if (rateLimitMessage) {
                results[index] = { query, error: `Skipped after upstream rate limit: ${rateLimitMessage}` };
                continue;
            }
            try {
                const result = await call(query);
                if (result.isError || !result.structuredContent) {
                    results[index] = { query, error: result.content.map(part => part.text).join('\n') || 'No structured result' };
                } else {
                    results[index] = { query, data: result.structuredContent };
                }
            } catch (error) {
                if (error instanceof ApiRequestError && error.status === 429) rateLimitMessage = error.message;
                results[index] = { query, error: error instanceof Error ? error.message : String(error) };
            }
        }
    }));
    const failed = results.filter(result => result.error !== undefined).length;
    return { ...createSuccessResponse(title, { results, succeeded: results.length - failed, failed }),
        ...(failed === results.length ? { isError: true } : {}) };
}
