// Price / catalogue tools for RuneScape Wiki MCP Server

import type { Tool } from '@modelcontextprotocol/server';
import { ITEM_CATEGORIES } from '../categories.js';
import { RS3_GE_API } from '../constants.js';
import { batchOutputSchema, MAX_BATCH_ITEMS, parseBatch, runBatch } from '../batch.js';
import { fetchGeInfo } from '../geInfo.js';
import { resolveItemId } from '../itemResolve.js';
import {
    EMPTY_OBJECT_SCHEMA,
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
    requireInteger,
    validationError,
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

const itemBatchOutput = batchOutputSchema(itemIdProperty, itemDetailOutputSchema);

export const priceTools: Tool[] = [
    {
        name: 'get_item_price',
        title: 'Get Item Metadata and Guide Prices',
        description:
            "Fetch full Jagex records for selected RS3 items: catalogue metadata, guide prices, fixed 30/90/180-day trends and Wiki item-ID links.\n" +
            "- Use browse_items for category listings or get_ge_info for catalogue configuration age. Use compare_items for numeric price/volume comparisons, get_item_graph for observations or summarize_price_history for calculated statistics.\n" +
            "- Select itemId, name or itemIds, never combine them. Names resolve first; ambiguity returns candidates. IDs come from lookup_item. itemIds accepts 1\u201310 unique IDs. [4151,-1] rejects before any fetch; valid IDs that Jagex cannot find fail only their rows.\n" +
            "- ID/name returns item; an array returns ordered results[].data.item even for one ID. Batches isolate row failures; all-failed is an error. At most two reads run concurrently; 429 stops queued work.\n" +
            "- Guide prices can use k/m strings and lag live offers. No auth or server cache. Shared HTTP budget defaults to 60 requests/IP/minute; honor 429 Retry-After.",
        inputSchema: {
            $schema: JSON_SCHEMA_2020_12,
            type: 'object',
            properties: { ...nameOrIdProperties,
                itemIds: { type: 'array', minItems: 1, maxItems: MAX_BATCH_ITEMS, uniqueItems: true,
                    items: itemIdProperty, description: 'Known GE IDs for a catalogue metadata batch; exclusive with itemId/name' },
            },
            oneOf: [{ required: ['itemId'] }, { required: ['name'] }, { required: ['itemIds'] }],
            additionalProperties: false,
        },
        outputSchema: { ...itemDetailOutputSchema,
            properties: { ...itemDetailOutputSchema.properties, ...itemBatchOutput.properties },
            required: [], oneOf: [{ required: itemDetailOutputSchema.required }, { required: itemBatchOutput.required }] },
        ...READ_ONLY_TOOL,
    },
    {
        name: 'get_ge_info',
        title: 'GE Catalogue Refresh Status',
        description:
            "Check the date and age of the latest GE catalogue configuration update. This does not report how fresh item prices are.\n" +
            "Call with {} for catalogue diagnostics; use get_item_price for item prices/metadata or get_all_categories for category IDs.\n" +
            "Makes one Jagex read. No auth or cache; API failures are errors. Shared HTTP limit: 60 requests/IP/minute; honor Retry-After on 429.",
        inputSchema: EMPTY_OBJECT_SCHEMA,
        outputSchema: {
            $schema: JSON_SCHEMA_2020_12,
            type: 'object',
            properties: {
                lastConfigUpdateRuneday: { type: 'integer', description: 'Upstream RuneDay counter for catalogue configuration update' },
                lastConfigUpdateDate: { type: 'string', format: 'date', description: 'Configuration UTC date derived from RuneDay' },
                configurationAgeDays: { type: 'integer', description: 'UTC calendar days since configuration update; negative for a future upstream date' },
                fetchedAt: { type: 'string', format: 'date-time', description: 'Server retrieval time, not a price update timestamp' },
                categoryCount: { type: 'integer', description: 'Number of canonical GE categories' },
                priceFreshness: { const: 'not_reported', description: 'Configuration metadata does not report item-price freshness' },
            },
            required: ['lastConfigUpdateRuneday', 'lastConfigUpdateDate', 'configurationAgeDays', 'fetchedAt', 'categoryCount', 'priceFreshness'],
            additionalProperties: true,
        },
        ...READ_ONLY_TOOL,
    },
    {
        name: 'get_category_info',
        title: 'Category Info',
        description:
            "Count entries under every starting letter of one RS3 catalogue category, to choose nonempty groups before browse_items. Use lookup_item for name search.\n" +
            "- Get category from get_all_categories. It selects one catalogue group, not an item or starting letter: 24 means high-level melee weapons, and 0 is one Miscellaneous group. There is no all-categories sentinel; query each desired ID separately.\n" +
            "- One call returns all alpha letters with item counts; no per-letter argument is needed. # denotes numeric names. These count distinct catalogue entries, not stock or available offers.\n" +
            "- Each call makes one public Jagex request without auth or a local cache. Jagex controls snapshot freshness; upstream failures return tool errors. HTTP shares 60 requests/IP/minute by default; honor Retry-After on 429.",
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
            "Browse an RS3 catalogue group. Use lookup_item for name search or get_item_price for one item's detail.\n" +
            "- Choose category from get_all_categories and a nonempty starting letter from get_category_info. category 24 + alpha \"a\" means high-level melee weapons beginning with A; # selects numbers.\n" +
            "- page is local to the (category, alpha) pair: page 2 continues page 1 with those filters unchanged. Reset to page 1 when either filter changes. Defaults are alpha a and page 1.\n" +
            "- Jagex total counts the category, not the selected letter. Advance pages until items is empty; an isError response is a failed request, not the last page. Guide prices lag live offers.\n" +
            "- Public Jagex reads require no auth or local cache. HTTP shares 60 requests/IP/minute by default; honor Retry-After on 429.",
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
            const unexpected = rejectUnknownKeys(args, ['itemId', 'name', 'itemIds']);
            if (unexpected) return unexpected;
            if (args?.itemIds !== undefined) {
                if (args?.itemId !== undefined || args?.name !== undefined) {
                    return validationError('Provide exactly one of itemId, name or itemIds');
                }
                const ids = parseBatch(args.itemIds, 'itemIds', (value, label) =>
                    requireInteger(value, label, { minimum: 0 }), true);
                if (isToolResponse(ids)) return ids;
                return runBatch('Item catalogue details', ids, itemId => handlePriceTool(name, { itemId }));
            }
            const itemId = await resolveItemId(args, ['itemId', 'name']);
            if (isToolResponse(itemId)) {
                return itemId;
            }

            const data = await makeApiRequest(
                `${RS3_GE_API}/catalogue/detail.json?item=${itemId}`
            );
            if (!data?.item || typeof data.item !== 'object' || Array.isArray(data.item)) {
                throw new Error(`Jagex returned no catalogue item for ${itemId}`);
            }
            const detail = { ...data, item: { ...data.item,
                wikiUrl: `https://runescape.wiki/w/Special:Lookup?type=item&id=${itemId}` } };
            return createSuccessResponse(`Item Detail for ${itemId}`, detail);
        }

        case 'get_ge_info': {
            const unexpected = rejectUnknownKeys(args, []);
            if (unexpected) {
                return unexpected;
            }
            const data = await fetchGeInfo();
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
