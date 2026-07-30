// Item lookup and graph tools for RuneScape Wiki MCP Server

import type { Tool } from '@modelcontextprotocol/server';
import { RS3_GE_API } from '../constants.js';
import { lookupItems, resolveItemId } from '../itemResolve.js';
import { itemIdProperty, JSON_SCHEMA_2020_12, READ_ONLY_TOOL } from '../mcpSchemas.js';
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
            'Resolve an item name to Grand Exchange ID and latest price. Uses exact name match first, then wiki opensearch. Prefer this before get_item_price when you only know the name.',
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
        ...READ_ONLY_TOOL,
    },
    {
        name: 'get_item_graph',
        title: 'Get Item Price Graph',
        description:
            'Get historical Grand Exchange price graph data (last 180 days) by itemId or name.',
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
            additionalProperties: false,
        },
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
            return createSuccessResponse(`Item lookup for "${query}"`, matches);
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
