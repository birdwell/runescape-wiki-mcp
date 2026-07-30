// Price / catalogue tools for RuneScape Wiki MCP Server

import type { Tool } from '@modelcontextprotocol/server';
import { ITEM_CATEGORIES } from '../categories.js';
import { RS3_GE_API } from '../constants.js';
import { resolveItemId } from '../itemResolve.js';
import {
    EMPTY_OBJECT_SCHEMA,
    READ_ONLY_TOOL,
    categoryProperty,
    itemIdProperty,
    JSON_SCHEMA_2020_12,
} from '../mcpSchemas.js';
import { ToolArguments, ToolResponse } from '../types.js';
import { makeApiRequest, createSuccessResponse } from '../utils.js';
import {
    isToolResponse,
    optionalInteger,
    rejectUnknownKeys,
    requireAlpha,
    requireCategory,
} from '../validation.js';

const nameOrIdProperties = {
    itemId: {
        ...itemIdProperty,
        description: 'Grand Exchange item ID (provide itemId or name)',
    },
    name: {
        type: 'string' as const,
        minLength: 1,
        description: 'Item name (provide itemId or name). Prefer lookup_item for fuzzy search.',
    },
};

export const priceTools: Tool[] = [
    {
        name: 'get_item_price',
        title: 'Get Item Price',
        description:
            'Get current Grand Exchange price, trends, and examine text for an item by itemId or exact/near-exact name.',
        inputSchema: {
            $schema: JSON_SCHEMA_2020_12,
            type: 'object',
            properties: nameOrIdProperties,
            additionalProperties: false,
        },
        ...READ_ONLY_TOOL,
    },
    {
        name: 'get_ge_info',
        title: 'Grand Exchange Info',
        description: 'Get Grand Exchange database metadata (lastConfigUpdateRuneday).',
        inputSchema: EMPTY_OBJECT_SCHEMA,
        ...READ_ONLY_TOOL,
    },
    {
        name: 'get_category_info',
        title: 'Category Info',
        description:
            'Get letter counts for a Grand Exchange category. Use get_all_categories for IDs.',
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
        description: 'List all RS3 Grand Exchange category IDs and names (0-43).',
        inputSchema: EMPTY_OBJECT_SCHEMA,
        ...READ_ONLY_TOOL,
    },
    {
        name: 'browse_items',
        title: 'Browse Catalogue Items',
        description:
            'Browse the Grand Exchange catalogue by category and starting letter. This is NOT a name search — use lookup_item for that. Use # for numeric names.',
        inputSchema: {
            $schema: JSON_SCHEMA_2020_12,
            type: 'object',
            properties: {
                category: categoryProperty,
                alpha: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 1,
                    description: 'Starting letter (a-z) or # for numbers. Defaults to "a".',
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

export async function handlePriceTool(name: string, args: ToolArguments): Promise<ToolResponse> {
    switch (name) {
        case 'get_item_price': {
            const itemId = await resolveItemId(args, ['itemId', 'name']);
            if (isToolResponse(itemId)) {
                return itemId;
            }

            const data = await makeApiRequest(
                `${RS3_GE_API}/catalogue/detail.json?item=${itemId}`
            );
            return createSuccessResponse(`Item Detail for ${itemId}`, data);
        }

        case 'get_ge_info': {
            const unexpected = rejectUnknownKeys(args, []);
            if (unexpected) {
                return unexpected;
            }
            const data = await makeApiRequest(`${RS3_GE_API}/info.json`);
            return createSuccessResponse('Grand Exchange Database Information', data);
        }

        case 'get_category_info': {
            const unexpected = rejectUnknownKeys(args, ['category']);
            if (unexpected) {
                return unexpected;
            }
            const category = requireCategory(args?.category);
            if (isToolResponse(category)) {
                return category;
            }

            const data = await makeApiRequest(
                `${RS3_GE_API}/catalogue/category.json?category=${category}`
            );
            return createSuccessResponse(`Category ${category} Information`, data);
        }

        case 'get_all_categories': {
            const unexpected = rejectUnknownKeys(args, []);
            if (unexpected) {
                return unexpected;
            }
            return createSuccessResponse('All Item Categories', ITEM_CATEGORIES);
        }

        case 'browse_items': {
            const unexpected = rejectUnknownKeys(args, ['category', 'alpha', 'page']);
            if (unexpected) {
                return unexpected;
            }

            const category = requireCategory(args?.category);
            if (isToolResponse(category)) {
                return category;
            }

            let alpha = 'a';
            if (args?.alpha !== undefined && args?.alpha !== null && args?.alpha !== '') {
                const alphaResult = requireAlpha(args.alpha);
                if (isToolResponse(alphaResult)) {
                    return alphaResult;
                }
                alpha = alphaResult;
            }

            const pageResult = optionalInteger(args?.page, 'page', { minimum: 1 });
            if (isToolResponse(pageResult)) {
                return pageResult;
            }
            const page = pageResult ?? 1;

            const alphaParam = encodeURIComponent(alpha);
            const data = await makeApiRequest(
                `${RS3_GE_API}/catalogue/items.json?category=${category}&alpha=${alphaParam}&page=${page}`
            );
            return createSuccessResponse(
                `Items in Category ${category} starting with "${alpha}" (Page ${page})`,
                data
            );
        }

        default:
            throw new Error(`Unknown price tool: ${name}`);
    }
}
