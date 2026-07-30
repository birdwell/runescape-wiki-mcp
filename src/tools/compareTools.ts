// Bulk item comparison tool for RuneScape Wiki MCP Server

import type { Tool } from '@modelcontextprotocol/server';
import { lookupByItemId, lookupItems } from '../itemResolve.js';
import { itemIdProperty, JSON_SCHEMA_2020_12, READ_ONLY_TOOL } from '../mcpSchemas.js';
import { ItemLookupMatch, ToolArguments, ToolResponse } from '../types.js';
import { createSuccessResponse } from '../utils.js';
import {
    isToolResponse,
    rejectUnknownKeys,
    requireInteger,
    requireString,
    validationError,
} from '../validation.js';

/** Bulk lookups fan out one request per entry, so keep batches small for the upstream APIs. */
const MAX_COMPARE_ITEMS = 10;

interface CompareRow {
    query: string;
    id?: number;
    name?: string;
    price?: number;
    volume?: number;
    timestamp?: string;
    error?: string;
}

const compareArrayProperty = {
    type: 'array' as const,
    minItems: 1,
    maxItems: MAX_COMPARE_ITEMS,
    uniqueItems: true,
};

export const compareTools: Tool[] = [
    {
        name: 'compare_items',
        title: 'Compare Items',
        description:
            'Compare latest Grand Exchange prices for up to 10 items in one call. Provide either names or itemIds. Returns one row per entry with id, name, price, volume and timestamp; entries that cannot be resolved come back as error rows instead of failing the call.',
        inputSchema: {
            $schema: JSON_SCHEMA_2020_12,
            type: 'object',
            properties: {
                names: {
                    ...compareArrayProperty,
                    items: {
                        type: 'string',
                        minLength: 1,
                        description: 'Item name, e.g. "Abyssal whip"',
                    },
                    description: `Item names to compare (1-${MAX_COMPARE_ITEMS}). Provide names or itemIds, not both.`,
                },
                itemIds: {
                    ...compareArrayProperty,
                    items: itemIdProperty,
                    description: `Grand Exchange item IDs to compare (1-${MAX_COMPARE_ITEMS}). Provide names or itemIds, not both.`,
                },
            },
            additionalProperties: false,
        },
        ...READ_ONLY_TOOL,
    },
];

function requireCompareArray<T>(
    value: unknown,
    name: string,
    parseEntry: (entry: unknown, label: string) => T | ToolResponse
): T[] | ToolResponse {
    if (!Array.isArray(value)) {
        return validationError(`${name} must be an array`);
    }
    if (value.length === 0) {
        return validationError(`${name} must contain at least 1 item`);
    }
    if (value.length > MAX_COMPARE_ITEMS) {
        return validationError(`${name} must contain at most ${MAX_COMPARE_ITEMS} items`);
    }

    const parsed: T[] = [];
    for (const [index, entry] of value.entries()) {
        const result = parseEntry(entry, `${name}[${index}]`);
        if (isToolResponse(result)) {
            return result;
        }
        parsed.push(result as T);
    }
    return parsed;
}

function toRow(query: string, match: ItemLookupMatch): CompareRow {
    return {
        query,
        id: match.id,
        name: match.name,
        price: match.price,
        volume: match.volume,
        timestamp: match.timestamp,
    };
}

async function rowForName(name: string): Promise<CompareRow> {
    try {
        const matches = await lookupItems(name, 1);
        if (matches.length === 0) {
            return { query: name, error: `No Grand Exchange item found for "${name}"` };
        }
        return toRow(name, matches[0]);
    } catch (error) {
        return {
            query: name,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

async function rowForItemId(itemId: number): Promise<CompareRow> {
    const matches = await lookupByItemId(itemId);
    if (matches.length === 0) {
        return { query: String(itemId), error: `No latest price found for item ${itemId}` };
    }
    return toRow(String(itemId), matches[0]);
}

export async function handleCompareTool(name: string, args: ToolArguments): Promise<ToolResponse> {
    switch (name) {
        case 'compare_items': {
            const unexpected = rejectUnknownKeys(args, ['names', 'itemIds']);
            if (unexpected) {
                return unexpected;
            }

            const hasNames = args?.names !== undefined && args?.names !== null;
            const hasItemIds = args?.itemIds !== undefined && args?.itemIds !== null;

            if (hasNames && hasItemIds) {
                return validationError('Provide either names or itemIds, not both');
            }
            if (!hasNames && !hasItemIds) {
                return validationError('Either names or itemIds is required');
            }

            let rows: CompareRow[];
            if (hasNames) {
                const names = requireCompareArray(args?.names, 'names', (entry, label) =>
                    requireString(entry, label, { minLength: 1 })
                );
                if (isToolResponse(names)) {
                    return names;
                }
                rows = await Promise.all(names.map(rowForName));
            } else {
                const itemIds = requireCompareArray(args?.itemIds, 'itemIds', (entry, label) =>
                    requireInteger(entry, label, { minimum: 0 })
                );
                if (isToolResponse(itemIds)) {
                    return itemIds;
                }
                rows = await Promise.all(itemIds.map(rowForItemId));
            }

            return createSuccessResponse(`Compared ${rows.length} item(s)`, {
                compared: rows.length,
                rows,
            });
        }

        default:
            throw new Error(`Unknown compare tool: ${name}`);
    }
}
