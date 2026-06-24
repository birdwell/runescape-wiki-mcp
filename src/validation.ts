// Tool input validation helpers (MCP tool execution errors, not protocol errors)

import { ToolResponse } from './types.js';

export function validationError(message: string): ToolResponse {
    return {
        content: [{ type: 'text', text: message }],
        isError: true,
    };
}

export function requireString(value: unknown, name: string): string | ToolResponse {
    if (value === undefined || value === null || value === '') {
        return validationError(`${name} is required`);
    }
    if (typeof value !== 'string') {
        return validationError(`${name} must be a string`);
    }
    return value;
}

export function requireInteger(value: unknown, name: string, options?: { minimum?: number }): number | ToolResponse {
    if (value === undefined || value === null) {
        return validationError(`${name} is required`);
    }
    if (typeof value !== 'number' || !Number.isInteger(value)) {
        return validationError(`${name} must be an integer`);
    }
    const minimum = options?.minimum ?? 0;
    if (value < minimum) {
        return validationError(`${name} must be at least ${minimum}`);
    }
    return value;
}

export function optionalInteger(value: unknown, name: string, options?: { minimum?: number }): number | ToolResponse | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    return requireInteger(value, name, options);
}

export function optionalString(value: unknown, name: string, defaultValue?: string): string | ToolResponse {
    if (value === undefined || value === null) {
        return defaultValue ?? validationError(`${name} is required`);
    }
    if (typeof value !== 'string') {
        return validationError(`${name} must be a string`);
    }
    return value;
}

export function isToolResponse(value: unknown): value is ToolResponse {
    return (
        typeof value === 'object' &&
        value !== null &&
        'content' in value &&
        Array.isArray((value as ToolResponse).content)
    );
}
