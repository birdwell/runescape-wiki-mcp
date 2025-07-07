// Item tools for RuneScape Wiki MCP Server

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { RS3_PRICES_API, RS_GE_API } from '../constants.js';
import { makeApiRequest, createSuccessResponse } from '../utils.js';
import { ToolArguments, ToolResponse } from '../types.js';

// Tool definitions for item-related functionality
export const itemTools: Tool[] = [
    {
        name: 'get_item_detail',
        description: 'Get detailed item information from the official Grand Exchange API including price trends, examine text, and metadata',
        inputSchema: {
            type: 'object',
            properties: {
                itemId: {
                    type: 'number',
                    description: 'Item ID to get detailed information for',
                },
            },
            required: ['itemId'],
        },
    },
    {
        name: 'get_item_graph',
        description: 'Get historical price graph data for an item from the official Grand Exchange API (last 180 days)',
        inputSchema: {
            type: 'object',
            properties: {
                itemId: {
                    type: 'number',
                    description: 'Item ID to get price graph for',
                },
            },
            required: ['itemId'],
        },
    },
    {
        name: 'browse_items_by_category',
        description: 'Browse items by category from the official Grand Exchange catalogue',
        inputSchema: {
            type: 'object',
            properties: {
                category: {
                    type: 'number',
                    description: 'Category ID (0-43, see documentation for category list)',
                },
                alpha: {
                    type: 'string',
                    description: 'First letter of items to show (a-z, use # for numbers)',
                    default: 'a',
                },
                page: {
                    type: 'number',
                    description: 'Page number (starting from 1)',
                    default: 1,
                },
            },
            required: ['category'],
        },
    },
    {
        name: 'get_ge_info',
        description: 'Get Grand Exchange database information including last update time',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
];

// Tool handlers for item-related functionality
export async function handleItemTool(name: string, args: ToolArguments): Promise<ToolResponse> {
    switch (name) {
        case 'get_item_detail': {
            const itemId = args?.itemId as number;
            const data = await makeApiRequest(`${RS_GE_API}/catalogue/detail.json?item=${itemId}`);
            return createSuccessResponse(`Item Detail for ${itemId}`, data);
        }

        case 'get_item_graph': {
            const itemId = args?.itemId as number;
            const data = await makeApiRequest(`${RS_GE_API}/graph/${itemId}.json`);
            return createSuccessResponse(`Price Graph for Item ${itemId}`, data);
        }

        case 'browse_items_by_category': {
            const category = args?.category as number;
            const alpha = (args?.alpha as string) || 'a';
            const page = (args?.page as number) || 1;
            const data = await makeApiRequest(`${RS_GE_API}/catalogue/items.json?category=${category}&alpha=${alpha}&page=${page}`);
            return createSuccessResponse(`Items in Category ${category} (${alpha}, Page ${page})`, data);
        }

        case 'get_ge_info': {
            const data = await makeApiRequest(`${RS_GE_API}/info.json`);
            return createSuccessResponse('Grand Exchange Database Information', data);
        }

        default:
            throw new Error(`Unknown item tool: ${name}`);
    }
} 