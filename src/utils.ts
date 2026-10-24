// Utility functions for RuneScape Wiki MCP Server

import { USER_AGENT } from './constants.js';
import { ToolResponse } from './types.js';
import { recordUpstreamRequest } from './analytics.js';

/**
 * Makes an API request with proper error handling and user agent
 */
export async function makeApiRequest(url: string): Promise<any> {
    return measuredApiRequest(url, response => response.json());
}

/**
 * Makes a text-based API request (for hiscores CSV data)
 */
export async function makeTextApiRequest(url: string): Promise<string> {
    return measuredApiRequest(url, response => response.text());
}

async function measuredApiRequest<T>(url: string, read: (response: Response) => Promise<T>): Promise<T> {
    const started = performance.now();
    let status: number | undefined;
    let success = false;
    let errorKind: 'http' | 'network' | 'parse' = 'network';
    try {
        const response = await globalThis.fetch(url, { headers: { 'User-Agent': USER_AGENT } });
        status = response.status;
        if (!response.ok) {
            errorKind = 'http';
            await response.body?.cancel();
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }
        errorKind = 'parse';
        const data = await read(response);
        success = true;
        return data;
    } finally {
        recordUpstreamRequest(url, {
            status_code: status,
            success,
            duration_ms: Math.round(performance.now() - started),
            ...(success ? {} : { error_kind: errorKind }),
        });
    }
}

/**
 * Creates a standardized error response
 */
export function createErrorResponse(error: unknown): {
    content: Array<{ type: 'text'; text: string }>;
    isError: boolean;
} {
    return {
        content: [
            {
                type: 'text',
                text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
        ],
        isError: true,
    };
}

/**
 * Creates a standardized success response.
 * Plain objects are also returned as structuredContent so clients can skip parsing the text.
 * Pass structuredContent when the text payload is an array or a string.
 */
export function createSuccessResponse(
    title: string,
    data: unknown,
    structuredContent?: Record<string, unknown>
): ToolResponse {
    const structured = structuredContent ?? (isPlainObject(data) ? data : undefined);
    const body = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    return {
        content: [
            {
                type: 'text',
                text: `${title}:\n\n${body}`,
            },
        ],
        ...(structured ? { structuredContent: structured } : {}),
    };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type ProcessLike = { env?: Record<string, string | undefined> };

function debugEnabled(): boolean {
    const env = (globalThis as typeof globalThis & { process?: ProcessLike }).process?.env;
    return env?.DEBUG === 'true' || env?.DEBUG === '1';
}

// Debug logging function
export function debugLog(message: string, data?: any) {
    if (debugEnabled()) {
        console.error(
            `[DEBUG] ${new Date().toISOString()} - ${message}`,
            data ? JSON.stringify(data, null, 2) : ''
        );
    }
}
