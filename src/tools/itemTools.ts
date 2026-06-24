// Item tools for RuneScape Wiki MCP Server

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { RS_GE_API } from '../constants.js';
import { makeApiRequest, createSuccessResponse } from '../utils.js';
import { ToolArguments, ToolResponse } from '../types.js';
import {
    categoryProperty,
    itemIdProperty,
    JSON_SCHEMA_2020_12,
    READ_ONLY_TOOL,
} from '../mcpSchemas.js';
import { isToolResponse, optionalInteger, optionalString, requireInteger } from '../validation.js';

// Tool definitions for item-related functionality
export const itemTools: Tool[] = [
    {
        name: 'get_item_detail',
        title: 'Get Item Detail',
        description: 'Get detailed item information from the official Grand Exchange API including price trends, examine text, and metadata',
        inputSchema: {
            $schema: JSON_SCHEMA_2020_12,
            type: 'object',
            properties: {
                itemId: itemIdProperty,
            },
            required: ['itemId'],
            additionalProperties: false,
        },
        ...READ_ONLY_TOOL,
    },
    {
        name: 'get_item_graph',
        title: 'Get Item Price Graph',
        description: 'Get historical price graph data for an item from the official Grand Exchange API (last 180 days)',
        inputSchema: {
            $schema: JSON_SCHEMA_2020_12,
            type: 'object',
            properties: {
                itemId: itemIdProperty,
            },
            required: ['itemId'],
            additionalProperties: false,
        },
        ...READ_ONLY_TOOL,
    },
    {
        name: 'browse_items_by_category',
        title: 'Browse Items by Category',
        description: 'Browse items by category from the official Grand Exchange catalogue',
        inputSchema: {
            $schema: JSON_SCHEMA_2020_12,
            type: 'object',
            properties: {
                category: categoryProperty,
                alpha: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 1,
                    description: 'First letter of items to show (a-z, use # for numbers)',
                },
                page: {
                    type: 'integer',
                    minimum: 1,
                    description: 'Page number (starting from 1)',
                },
            },
            required: ['category'],
            additionalProperties: false,
        },
        ...READ_ONLY_TOOL,
    },
];

// Tool handlers for item-related functionality
export async function handleItemTool(name: string, args: ToolArguments): Promise<ToolResponse> {
    switch (name) {
        case 'get_item_detail': {
            const itemId = requireInteger(args?.itemId, 'itemId');
            if (isToolResponse(itemId)) {
                return itemId;
            }

            const data = await makeApiRequest(`${RS_GE_API}/catalogue/detail.json?item=${itemId}`);
            return createSuccessResponse(`Item Detail for ${itemId}`, data);
        }

        case 'get_item_graph': {
            const itemId = requireInteger(args?.itemId, 'itemId');
            if (isToolResponse(itemId)) {
                return itemId;
            }

            const data = await makeApiRequest(`${RS_GE_API}/graph/${itemId}.json`);
            return createSuccessResponse(`Price Graph for Item ${itemId}`, data);
        }

        case 'browse_items_by_category': {
            const category = requireInteger(args?.category, 'category');
            if (isToolResponse(category)) {
                return category;
            }

            const alphaResult = optionalString(args?.alpha, 'alpha', 'a');
            if (isToolResponse(alphaResult)) {
                return alphaResult;
            }
            const alpha = alphaResult;

            const pageResult = optionalInteger(args?.page, 'page', { minimum: 1 });
            if (isToolResponse(pageResult)) {
                return pageResult;
            }
            const page = pageResult ?? 1;

            const data = await makeApiRequest(`${RS_GE_API}/catalogue/items.json?category=${category}&alpha=${alpha}&page=${page}`);
            return createSuccessResponse(`Items in Category ${category} (${alpha}, Page ${page})`, data);
        }

        default:
            throw new Error(`Unknown item tool: ${name}`);
    }
}
