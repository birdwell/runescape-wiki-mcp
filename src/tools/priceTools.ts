// Price / catalogue tools for RuneScape Wiki MCP Server

import type { Tool } from '@modelcontextprotocol/server';
import { ITEM_CATEGORIES } from '../categories.js';
import { RS3_GE_API } from '../constants.js';
import { resolveItemId } from '../itemResolve.js';
import {
    EMPTY_OBJECT_SCHEMA,
    ITEM_SELECTOR,
    itemDetailOutputSchema,
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
            "Read one RS3 item's Jagex Grand Exchange guide-price detail, including current price, trend periods and " +
            "examine text. Use lookup_item to discover an uncertain name, compare_items for multiple price snapshots, " +
            "summarize_price_history for statistics, or get_item_graph for daily samples. Pass exactly one of itemId " +
            "or name; itemId from lookup_item skips name lookup; name \"Abyssal whip\" resolves first and ambiguous " +
            "names return an error listing candidates. Prices can be compact strings such as \"80k\" and lag live " +
            "offers.\n\n" +
            "No auth or local result cache; unavailable items and upstream failures return errors. HTTP shares a " +
            "default 60 requests/IP/minute budget; honor Retry-After on 429.",
        inputSchema: {
            $schema: JSON_SCHEMA_2020_12,
            type: 'object',
            properties: nameOrIdProperties,
            ...ITEM_SELECTOR,
            additionalProperties: false,
        },
        outputSchema: itemDetailOutputSchema,
        ...READ_ONLY_TOOL,
    },
    {
        name: 'get_ge_info',
        title: 'Grand Exchange Info',
        description:
            "Read RS3 Grand Exchange database metadata to check the catalogue configuration update, not individual " +
            "item prices. Takes no arguments or filters and returns lastConfigUpdateRuneday, Jagex's RuneScape day " +
            "counter, not a Unix timestamp or a guarantee of price freshness. Use get_all_categories for category IDs, " +
            "get_item_price for item guide-price detail, or lookup_item for name discovery.\n\n" +
            "No auth or local result cache; upstream failures return errors. HTTP shares a default 60 " +
            "requests/IP/minute budget; honor Retry-After on 429.",
        inputSchema: EMPTY_OBJECT_SCHEMA,
        outputSchema: {
            $schema: JSON_SCHEMA_2020_12,
            type: 'object',
            properties: {
                lastConfigUpdateRuneday: { type: 'integer', description: 'RuneScape day counter for catalogue configuration update' },
            },
            required: ['lastConfigUpdateRuneday'],
            additionalProperties: true,
        },
        ...READ_ONLY_TOOL,
    },
    {
        name: 'get_category_info',
        title: 'Category Info',
        description:
            "Count catalogue items by starting letter within one RS3 Grand Exchange category so you can choose " +
            "nonempty letter groups before browsing. Obtain category from get_all_categories; it is a catalogue ID, " +
            "not an item ID: category 24 selects high-level melee weapons, and 0 selects one Miscellaneous group " +
            "rather than all categories. Returns Jagex types and alpha entries with letter and items counts; it does " +
            "not return the items themselves. Pass a returned letter to browse_items, using # for numeric names. For " +
            "name search use lookup_item.\n\n" +
            "No auth or local result cache; upstream failures return errors. HTTP shares a default 60 " +
            "requests/IP/minute budget; honor Retry-After on 429.",
        inputSchema: {
            $schema: JSON_SCHEMA_2020_12,
            type: 'object',
            properties: {
                category: categoryProperty,
            },
            required: ['category'],
            additionalProperties: false,
        },
        outputSchema: {
            $schema: JSON_SCHEMA_2020_12,
            type: 'object',
            properties: {
                types: { type: 'array', items: {} },
                alpha: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            letter: { type: 'string', description: 'Starting letter, or # for numbers' },
                            items: { type: 'integer', description: 'Number of catalogue items in this letter group' },
                        },
                        required: ['letter', 'items'],
                    },
                },
            },
            required: ['types', 'alpha'],
            additionalProperties: true,
        },
        ...READ_ONLY_TOOL,
    },
    {
        name: 'get_all_categories',
        title: 'All Categories',
        description:
            'List all 44 RS3 Grand Exchange category IDs and names to choose a catalogue group. ' +
            'Call with {} and no filters; returns categories sorted by ID from a built-in list, without network access or auth.\n\n' +
            'Use a returned ID with get_category_info for letter counts, then browse_items for entries. ' +
            'For item-name search use lookup_item. Category IDs identify groups, not items; duplicate category names have distinct IDs.',
        inputSchema: EMPTY_OBJECT_SCHEMA,
        outputSchema: {
            $schema: JSON_SCHEMA_2020_12,
            type: 'object',
            properties: {
                categories: {
                    type: 'array',
                    description: 'All 44 category references, sorted by ID',
                    items: {
                        type: 'object',
                        properties: { id: categoryProperty, name: { type: 'string' } },
                        required: ['id', 'name'],
                        additionalProperties: false,
                    },
                },
            },
            required: ['categories'],
            additionalProperties: false,
        },
        ...READ_ONLY_TOOL,
        annotations: { ...READ_ONLY_TOOL.annotations, openWorldHint: false },
    },
    {
        name: 'browse_items',
        title: 'Browse Catalogue Items',
        description:
            "Browse a paginated RS3 Grand Exchange catalogue group when exploring items, rather than searching a name. " +
            "Get category IDs from get_all_categories and nonempty starting letters from get_category_info; use " +
            "lookup_item for name discovery or get_item_price for one item's detail. category selects a group, alpha " +
            "selects its first letter, and page advances only within that group and letter; defaults are a and 1, with " +
            "# for numeric names. Returns Jagex total and items; increment page by 1 until items is empty, resetting " +
            "page to 1 whenever category or alpha changes. Errors set isError with text; do not treat them as an empty " +
            "page.\n\n" +
            "No auth or local result cache; upstream errors propagate and guide prices lag live offers. HTTP shares a " +
            "default 60 requests/IP/minute budget; honor Retry-After on 429.",
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
        outputSchema: {
            $schema: JSON_SCHEMA_2020_12,
            type: 'object',
            properties: {
                total: { type: 'integer', description: 'Jagex catalogue total' },
                items: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
            required: ['items'],
            additionalProperties: true,
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
            return createSuccessResponse('All Item Categories', ITEM_CATEGORIES, { categories: ITEM_CATEGORIES });
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
