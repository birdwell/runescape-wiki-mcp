// Utility functions for RuneScape Wiki MCP Server

import { USER_AGENT } from './constants.js';

/**
 * Makes an API request with proper error handling and user agent
 */
export async function makeApiRequest(url: string): Promise<any> {
    debugLog(`Making API request to: ${url}`);

    const response = await globalThis.fetch(url, {
        headers: {
            'User-Agent': USER_AGENT,
        },
    });

    debugLog(`API response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
        const errorText = await response.text();
        debugLog(`API error response:`, errorText);
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    debugLog(`API response data:`, data);
    return data;
}

/**
 * Makes a text-based API request (for hiscores CSV data)
 */
export async function makeTextApiRequest(url: string): Promise<string> {
    const response = await globalThis.fetch(url, {
        headers: {
            'User-Agent': USER_AGENT,
        },
    });

    if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return response.text();
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
 * Creates a standardized success response
 */
export function createSuccessResponse(title: string, data: any): {
    content: Array<{ type: 'text'; text: string }>;
} {
    return {
        content: [
            {
                type: 'text',
                text: `${title}:\n\n${JSON.stringify(data, null, 2)}`,
            },
        ],
    };
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