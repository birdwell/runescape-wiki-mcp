// Item lookup and graph tools for RuneScape Wiki MCP Server

import type { Tool } from '@modelcontextprotocol/server';
import { RS3_GE_API } from '../constants.js';
import { lookupItems, resolveItemId } from '../itemResolve.js';
import { ITEM_SELECTOR, itemIdProperty, JSON_SCHEMA_2020_12, lookupOutputSchema, graphOutputSchema, READ_ONLY_TOOL } from '../mcpSchemas.js';
import { ToolArguments, ToolResponse } from '../types.js';
import { makeApiRequest, createSuccessResponse } from '../utils.js';
import {
    isToolResponse,
    optionalInteger,
    rejectUnknownKeys,
    requireString,
    validationError,
} from '../validation.js';

export const itemTools: Tool[] = [
    {
        name: 'lookup_item',
        title: 'Lookup Item',
        description:
            "Find tradeable RS3 items by name or partial name and return matching IDs with available Weirdgloop price " +
            "samples. Use this for name discovery; choose a returned ID before calling get_item_price for Jagex " +
            "detail, summarize_price_history for statistics, or get_item_graph for daily samples. Exact names are " +
            "tried first, then wiki opensearch; query \"abyssal\" discovers candidates while \"Abyssal whip\" tries that " +
            "exact item first; limit 10 still returns just the exact hit when one exists; use a partial query to " +
            "discover alternatives, not a larger history window. Non-GE pages are filtered out; no matches returns a " +
            "tool error.\n\n" +
            "No local result cache or auth; upstream failures may prevent discovery. HTTP shares a default 60 " +
            "requests/IP/minute budget; retry a 429 after Retry-After. Prices lag live offers.",
        inputSchema: {
            $schema: JSON_SCHEMA_2020_12,
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    minLength: 1,
                    description: 'Item name or partial name to search for',
                },
                limit: {
                    type: 'integer',
                    minimum: 1,
                    maximum: 10,
                    description: 'Max matches to return (default 5)',
                },
            },
            required: ['query'],
            additionalProperties: false,
        },
        outputSchema: lookupOutputSchema,
        ...READ_ONLY_TOOL,
    },
    {
        name: 'get_item_graph',
        title: 'Get Item Price Graph',
        description:
            "Fetch raw RS3 Jagex daily and averaged price series, roughly 180 days, for charts or custom calculations. " +
            "Use summarize_price_history for ready-made statistics, get_item_price for guide-price detail, and " +
            "lookup_item to discover IDs. Pass exactly one of itemId or name; itemId from lookup_item skips name " +
            "lookup, while name \"Abyssal whip\" resolves first and ambiguous names return an error listing candidates. " +
            "There are no date-range arguments; trim the returned maps yourself. Returns timestamp-keyed daily and " +
            "average maps, not a rendered chart; upstream availability determines the window.\n\n" +
            "No auth or local result cache; upstream errors propagate and historical guide prices are not live offers. " +
            "HTTP shares a default 60 requests/IP/minute budget; honor Retry-After on 429.",
        inputSchema: {
            $schema: JSON_SCHEMA_2020_12,
            type: 'object',
            properties: {
                itemId: {
                    ...itemIdProperty,
                    description: 'Grand Exchange item ID (provide itemId or name)',
                },
                name: {
                    type: 'string',
                    minLength: 1,
                    description: 'Item name (provide itemId or name)',
                },
            },
            ...ITEM_SELECTOR,
            additionalProperties: false,
        },
        outputSchema: graphOutputSchema,
        ...READ_ONLY_TOOL,
    },
];

export async function handleItemTool(name: string, args: ToolArguments): Promise<ToolResponse> {
    switch (name) {
        case 'lookup_item': {
            const unexpected = rejectUnknownKeys(args, ['query', 'limit']);
            if (unexpected) {
                return unexpected;
            }

            const query = requireString(args?.query, 'query', { minLength: 1 });
            if (isToolResponse(query)) {
                return query;
            }

            const limitResult = optionalInteger(args?.limit, 'limit', { minimum: 1, maximum: 10 });
            if (isToolResponse(limitResult)) {
                return limitResult;
            }
            const limit = limitResult ?? 5;

            const matches = await lookupItems(query, limit);
            if (matches.length === 0) {
                return validationError(`No Grand Exchange items found for "${query}"`);
            }
            return createSuccessResponse(`Item lookup for "${query}"`, matches, { matches });
        }

        case 'get_item_graph': {
            const itemId = await resolveItemId(args, ['itemId', 'name']);
            if (isToolResponse(itemId)) {
                return itemId;
            }

            const data = await makeApiRequest(`${RS3_GE_API}/graph/${itemId}.json`);
            return createSuccessResponse(`Price Graph for Item ${itemId}`, data);
        }

        default:
            throw new Error(`Unknown item tool: ${name}`);
    }
}
