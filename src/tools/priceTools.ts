// Price tools for RuneScape Wiki MCP Server

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { RS3_PRICES_API } from '../constants.js';
import { makeApiRequest, createSuccessResponse } from '../utils.js';
import { ToolArguments, ToolResponse } from '../types.js';

// Tool definitions for price-related functionality
export const priceTools: Tool[] = [
    {
        name: 'get_item_price',
        description: 'Get the current Grand Exchange price and details for a specific item',
        inputSchema: {
            type: 'object',
            properties: {
                itemId: {
                    type: 'number',
                    description: 'Item ID to get price and details for',
                },
            },
            required: ['itemId'],
        },
    },
    {
        name: 'get_ge_info',
        description: 'Get Grand Exchange Database information including last update date',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'get_category_info',
        description: 'Get information about a specific item category',
        inputSchema: {
            type: 'object',
            properties: {
                category: {
                    type: 'number',
                    description: 'Category ID (1-32)',
                },
            },
            required: ['category'],
        },
    },
    {
        name: 'search_items',
        description: 'Search for items in a specific category and starting letter',
        inputSchema: {
            type: 'object',
            properties: {
                category: {
                    type: 'number',
                    description: 'Category ID (1-32)',
                },
                alpha: {
                    type: 'string',
                    description: 'Starting letter (a-z) or # for numbers',
                },
                page: {
                    type: 'number',
                    description: 'Page number (starting from 1)',
                    default: 1,
                },
            },
            required: ['category', 'alpha'],
        },
    },
];

// Tool handlers for price-related functionality
export async function handlePriceTool(name: string, args: ToolArguments): Promise<ToolResponse> {
    switch (name) {
        case 'get_item_price': {
            const itemId = args?.itemId as number;
            const url = `${RS3_PRICES_API}/catalogue/detail.json?item=${itemId}`;

            const data = await makeApiRequest(url);
            return createSuccessResponse(`Item Detail for ${itemId}`, data);
        }

        case 'get_ge_info': {
            const url = `${RS3_PRICES_API}/info.json`;
            const data = await makeApiRequest(url);
            return createSuccessResponse('Grand Exchange Database Information', data);
        }

        case 'get_category_info': {
            const category = args?.category as number;
            const url = `${RS3_PRICES_API}/catalogue/category.json?category=${category}`;
            const data = await makeApiRequest(url);
            return createSuccessResponse(`Category ${category} Information`, data);
        }

        case 'search_items': {
            const category = args?.category as number;
            const alpha = args?.alpha as string;
            const page = (args?.page as number) || 1;
            
            // Handle the special case for numbers
            const alphaParam = alpha === '#' ? '%23' : alpha;
            const url = `${RS3_PRICES_API}/catalogue/items.json?category=${category}&alpha=${alphaParam}&page=${page}`;
            
            const data = await makeApiRequest(url);
            return createSuccessResponse(`Items in Category ${category} starting with "${alpha}" (Page ${page})`, data);
        }

        default:
            throw new Error(`Unknown price tool: ${name}`);
    }
} 