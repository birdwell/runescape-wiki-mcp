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
        name: 'get_all_categories',
        description: 'Get a list of all item categories with their IDs and names.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'search_items',
        description: 'Search for items by name, category, starting letter, price, or membership. Supports full-text search and advanced filters. Category numbers are listed in the README under "Item Category Mapping". Use get_all_categories for more details.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Full or partial item name to search for',
                },
                category: {
                    type: 'number',
                    description: 'Category ID (see README table, typically 1-43)',
                },
                alpha: {
                    type: 'string',
                    description: 'Starting letter (a-z) or # for numbers',
                },
                price_min: {
                    type: 'number',
                    description: 'Minimum price (inclusive)',
                },
                price_max: {
                    type: 'number',
                    description: 'Maximum price (inclusive)',
                },
                members_only: {
                    type: 'boolean',
                    description: 'Filter for members-only items',
                },
                sort_by: {
                    type: 'string',
                    enum: ['name', 'price', 'trend'],
                    description: 'Sort results by name, price, or trend',
                },
                page: {
                    type: 'number',
                    description: 'Page number (starting from 1)',
                    default: 1,
                },
            },
            required: [],
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

        case 'get_all_categories': {
            // Updated to match the official Grand Exchange category IDs and names
            const categories = [
                { id: 1, name: 'Ammo' },
                { id: 41, name: 'Archaeology materials' },
                { id: 2, name: 'Arrows' },
                { id: 3, name: 'Bolts' },
                { id: 4, name: 'Construction materials' },
                { id: 5, name: 'Construction products' },
                { id: 6, name: 'Cooking ingredients' },
                { id: 7, name: 'Costumes' },
                { id: 8, name: 'Crafting materials' },
                { id: 9, name: 'Familiars' },
                { id: 10, name: 'Farming produce' },
                { id: 40, name: 'Firemaking products' },
                { id: 11, name: 'Fletching materials' },
                { id: 12, name: 'Food and Drink' },
                { id: 13, name: 'Herblore materials' },
                { id: 14, name: 'Hunting equipment' },
                { id: 15, name: 'Hunting Produce' },
                { id: 16, name: 'Jewellery' },
                { id: 17, name: 'Magic armour' },
                { id: 18, name: 'Magic weapons' },
                { id: 21, name: 'Melee armour - high level' },
                { id: 19, name: 'Melee armour - low level' },
                { id: 20, name: 'Melee armour - mid level' },
                { id: 24, name: 'Melee weapons - high level' },
                { id: 22, name: 'Melee weapons - low level' },
                { id: 23, name: 'Melee weapons - mid level' },
                { id: 25, name: 'Mining and Smithing' },
                { id: 0, name: 'Miscellaneous' },
                { id: 42, name: 'Miscellaneous' },
                { id: 43, name: 'Necromancy armour' },
                { id: 37, name: 'Pocket items' },
                { id: 26, name: 'Potions' },
                { id: 27, name: 'Prayer armour' },
                { id: 28, name: 'Prayer materials' },
                { id: 29, name: 'Ranged armour' },
                { id: 30, name: 'Ranged weapons' },
                { id: 31, name: 'Runecrafting' },
                { id: 32, name: 'Runes, Spells and Teleports' },
                { id: 39, name: 'Salvage' },
                { id: 33, name: 'Seeds' },
                { id: 38, name: 'Stone spirits' },
                { id: 34, name: 'Summoning scrolls' },
                { id: 35, name: 'Tools and containers' },
                { id: 36, name: 'Woodcutting product' },
            ];
            return createSuccessResponse('All Item Categories', categories);
        }

        case 'search_items': {
            // TODO: Implement local full-text and advanced search using item mapping
            // For now, fallback to the old API (category+alpha)
            const query = args?.query as string;
            const category = args?.category as number;
            const alpha = args?.alpha as string;
            const price_min = args?.price_min as number;
            const price_max = args?.price_max as number;
            const members_only = args?.members_only as boolean;
            const sort_by = args?.sort_by as string;
            const page = (args?.page as number) || 1;

            // If only category+alpha provided, use the API
            if (category && alpha) {
                const alphaParam = alpha === '#' ? '%23' : alpha;
                const url = `${RS3_PRICES_API}/catalogue/items.json?category=${category}&alpha=${alphaParam}&page=${page}`;
                const data = await makeApiRequest(url);
                return createSuccessResponse(`Items in Category ${category} starting with "${alpha}" (Page ${page})`, data);
            }
            // Otherwise, return a not-implemented message
            return createSuccessResponse('Advanced search is not yet implemented. Please use category and alpha for now.', {
                query, category, alpha, price_min, price_max, members_only, sort_by, page
            });
        }

        default:
            throw new Error(`Unknown price tool: ${name}`);
    }
} 