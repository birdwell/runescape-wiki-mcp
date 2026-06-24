// Price tools for RuneScape Wiki MCP Server

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { RS3_PRICES_API } from '../constants.js';
import { makeApiRequest, createSuccessResponse } from '../utils.js';
import { ToolArguments, ToolResponse } from '../types.js';
import {
    EMPTY_OBJECT_SCHEMA,
    READ_ONLY_TOOL,
    categoryProperty,
    itemIdProperty,
    JSON_SCHEMA_2020_12,
} from '../mcpSchemas.js';
import { isToolResponse, optionalInteger, requireInteger, requireString } from '../validation.js';

// Tool definitions for price-related functionality
export const priceTools: Tool[] = [
    {
        name: 'get_item_price',
        title: 'Get Item Price',
        description: 'Get the current Grand Exchange price and details for a specific item',
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
        name: 'get_ge_info',
        title: 'Grand Exchange Info',
        description: 'Get Grand Exchange Database information including last update date',
        inputSchema: EMPTY_OBJECT_SCHEMA,
        ...READ_ONLY_TOOL,
    },
    {
        name: 'get_category_info',
        title: 'Category Info',
        description: 'Get information about a specific item category',
        inputSchema: {
            $schema: JSON_SCHEMA_2020_12,
            type: 'object',
            properties: {
                category: categoryProperty,
            },
            required: ['category'],
            additionalProperties: false,
        },
        ...READ_ONLY_TOOL,
    },
    {
        name: 'get_all_categories',
        title: 'All Categories',
        description: 'Get a list of all item categories with their IDs and names.',
        inputSchema: EMPTY_OBJECT_SCHEMA,
        ...READ_ONLY_TOOL,
    },
    {
        name: 'search_items',
        title: 'Search Items',
        description: 'Search Grand Exchange items by category and starting letter. Use get_all_categories to find category IDs.',
        inputSchema: {
            $schema: JSON_SCHEMA_2020_12,
            type: 'object',
            properties: {
                category: categoryProperty,
                alpha: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 1,
                    description: 'Starting letter (a-z) or # for numbers',
                },
                page: {
                    type: 'integer',
                    minimum: 1,
                    description: 'Page number (starting from 1)',
                },
            },
            required: ['category', 'alpha'],
            additionalProperties: false,
        },
        ...READ_ONLY_TOOL,
    },
];

// Tool handlers for price-related functionality
export async function handlePriceTool(name: string, args: ToolArguments): Promise<ToolResponse> {
    switch (name) {
        case 'get_item_price': {
            const itemId = requireInteger(args?.itemId, 'itemId');
            if (isToolResponse(itemId)) {
                return itemId;
            }

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
            const category = requireInteger(args?.category, 'category');
            if (isToolResponse(category)) {
                return category;
            }

            const url = `${RS3_PRICES_API}/catalogue/category.json?category=${category}`;
            const data = await makeApiRequest(url);
            return createSuccessResponse(`Category ${category} Information`, data);
        }

        case 'get_all_categories': {
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
            const category = requireInteger(args?.category, 'category');
            if (isToolResponse(category)) {
                return category;
            }

            const alpha = requireString(args?.alpha, 'alpha');
            if (isToolResponse(alpha)) {
                return alpha;
            }

            const pageResult = optionalInteger(args?.page, 'page', { minimum: 1 });
            if (isToolResponse(pageResult)) {
                return pageResult;
            }
            const page = pageResult ?? 1;

            const alphaParam = alpha === '#' ? '%23' : alpha;
            const url = `${RS3_PRICES_API}/catalogue/items.json?category=${category}&alpha=${alphaParam}&page=${page}`;
            const data = await makeApiRequest(url);
            return createSuccessResponse(`Items in Category ${category} starting with "${alpha}" (Page ${page})`, data);
        }

        default:
            throw new Error(`Unknown price tool: ${name}`);
    }
}
