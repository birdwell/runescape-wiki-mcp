// Utility functions for RuneScape Wiki MCP Server

import fetch from 'node-fetch';
import { USER_AGENT } from './constants.js';

/**
 * Makes an API request with proper error handling and user agent
 */
export async function makeApiRequest(url: string): Promise<any> {
    const response = await fetch(url, {
        headers: {
            'User-Agent': USER_AGENT,
        },
    });

    if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

/**
 * Makes a text-based API request (for hiscores CSV data)
 */
export async function makeTextApiRequest(url: string): Promise<string> {
    const response = await fetch(url, {
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