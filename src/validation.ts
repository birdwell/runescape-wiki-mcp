// Tool input validation helpers (MCP tool execution errors, not protocol errors)

import { MAX_CATEGORY_ID } from './categories.js';
import { ToolResponse } from './types.js';

export function validationError(message: string): ToolResponse {
    return {
        content: [{ type: 'text', text: message }],
        isError: true,
    };
}

export function requireString(
    value: unknown,
    name: string,
    options?: { minLength?: number; maxLength?: number; pattern?: RegExp; patternMessage?: string }
): string | ToolResponse {
    if (value === undefined || value === null || value === '') {
        return validationError(`${name} is required`);
    }
    if (typeof value !== 'string') {
        return validationError(`${name} must be a string`);
    }
    if (options?.minLength !== undefined && value.length < options.minLength) {
        return validationError(`${name} must be at least ${options.minLength} character(s)`);
    }
    if (options?.maxLength !== undefined && value.length > options.maxLength) {
        return validationError(`${name} must be at most ${options.maxLength} character(s)`);
    }
    if (options?.pattern && !options.pattern.test(value)) {
        return validationError(options.patternMessage ?? `${name} has an invalid format`);
    }
    return value;
}

export function requireInteger(
    value: unknown,
    name: string,
    options?: { minimum?: number; maximum?: number }
): number | ToolResponse {
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
    if (options?.maximum !== undefined && value > options.maximum) {
        return validationError(`${name} must be at most ${options.maximum}`);
    }
    return value;
}

export function requireCategory(value: unknown, name = 'category'): number | ToolResponse {
    return requireInteger(value, name, { minimum: 0, maximum: MAX_CATEGORY_ID });
}

export function requireAlpha(value: unknown, name = 'alpha'): string | ToolResponse {
    return requireString(value, name, {
        minLength: 1,
        maxLength: 1,
        pattern: /^[a-zA-Z#]$/,
        patternMessage: `${name} must be a single letter (a-z) or #`,
    });
}

export function optionalInteger(
    value: unknown,
    name: string,
    options?: { minimum?: number; maximum?: number }
): number | ToolResponse | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    return requireInteger(value, name, options);
}

export function optionalString(
    value: unknown,
    name: string,
    defaultValue?: string
): string | ToolResponse | undefined {
    if (value === undefined || value === null || value === '') {
        return defaultValue;
    }
    if (typeof value !== 'string') {
        return validationError(`${name} must be a string`);
    }
    return value;
}

export function rejectUnknownKeys(
    args: Record<string, unknown> | undefined,
    allowed: readonly string[]
): ToolResponse | undefined {
    if (!args) {
        return undefined;
    }
    const unknown = Object.keys(args).filter(key => !allowed.includes(key));
    if (unknown.length === 0) {
        return undefined;
    }
    return validationError(`Unexpected argument(s): ${unknown.join(', ')}`);
}

export function isToolResponse(value: unknown): value is ToolResponse {
    return (
        typeof value === 'object' &&
        value !== null &&
        'isError' in value &&
        (value as ToolResponse).isError === true &&
        'content' in value &&
        Array.isArray((value as ToolResponse).content)
    );
}
