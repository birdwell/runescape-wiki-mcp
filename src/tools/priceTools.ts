// Price / catalogue tools for RuneScape Wiki MCP Server

import type { Tool } from '@modelcontextprotocol/server';
import { ITEM_CATEGORIES } from '../categories.js';
import { RS3_GE_API } from '../constants.js';
import { batchOutputSchema, MAX_BATCH_ITEMS, parseBatch, runBatch } from '../batch.js';
import { fetchLiveItemData } from '../livePrices.js';
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

const geStatusSchema = {
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
        };

const geCategoryCountsSchema = {
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
        };

const geCategoriesSchema = {
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
        };

export const priceTools: Tool[] = [
    {
        name: 'get_item_price',
        title: 'Get Item Details and Reported Trades',
        description: "Read Jagex catalogue records and guide prices by GE item ID or resolved name. Use lookup_item for ID discovery, compare_items for daily comparisons, or get_item_graph for raw history.\n\nitemId bypasses name resolution; name resolves first and errors with candidates on ambiguity. Both return item. itemIds uses known GE IDs, preserves input order and always returns results[], even for one ID. Wiki monster IDs are a different identifier system.\n\nUse includeLiveData for recorded instant-buy/instant-sell prices and buy-limit/alchemy facts. It preserves guide fields; trades are not executable offers, and buy limits are not remaining quota.\n\nInvalid batches fail before fetching. Unavailable IDs fail per row; all-failed batches error. At most two reads run concurrently; 429 halts queued IDs.\n\nCache/freshness:\n- Guide records are uncached and lag market activity.\n- Trades cache 30 seconds; numeric facts cache 10 minutes.\n- Cache hits keep their fetchedAt timestamp.\n\nNo credentials required. HTTP defaults to 60 requests/IP/minute; honor 429 Retry-After.",
        inputSchema: {
            $schema: JSON_SCHEMA_2020_12,
            type: 'object',
            properties: { ...nameOrIdProperties,
                includeLiveData: { type: 'boolean', default: false,
                    description: 'Add RS3 API v2 last-reported trade high/low prices and numeric buy-limit/alchemy facts; preserves Jagex guide-price fields' },
                itemIds: { type: 'array', minItems: 1, maxItems: MAX_BATCH_ITEMS, uniqueItems: true,
                    items: itemIdProperty, description: 'Known GE IDs for a catalogue metadata batch; exclusive with itemId/name' },
            },
            examples: [{ itemId: 4151 }, { name: 'Abyssal whip' }, { itemIds: [4151, 536] }, { itemId: 4151, includeLiveData: true }],
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
        title: 'Read GE Catalogue Metadata',
        description: "Read RS3 GE catalogue metadata. Do not use this for item prices: use get_item_price. For entries use browse_items; for Wiki categories use list_wiki_category_members.\n\n- view=status reports configuration date/age, not price freshness.\n- view=categories lists all 44 built-in IDs; duplicate names identify separate groups.\n- view=category_counts requires category 0-43, e.g. 24 for high-level melee weapons. Category 0 is one Miscellaneous group, not an all-groups sentinel. The response counts entries by starting letter (# means numbers), not stock or offers.\n\ncategory is rejected outside category_counts; it cannot filter the full list. categories needs no network; other views make one uncached Jagex read. No credentials required. HTTP defaults to 60 requests/IP/minute; honor 429 Retry-After.",
        inputSchema: { $schema: JSON_SCHEMA_2020_12, type: 'object', properties: {
            view: { type: 'string', enum: ['status', 'categories', 'category_counts'], default: 'status', description: 'Metadata view; omit for the original configuration status result' },
            category: categoryProperty,
        }, oneOf: [
            { properties: { view: { enum: ['status', 'categories'] } }, not: { required: ['category'] } },
            { properties: { view: { const: 'category_counts' } }, required: ['view', 'category'] },
        ], additionalProperties: false },
        outputSchema: { $schema: JSON_SCHEMA_2020_12, anyOf: [geStatusSchema, geCategoriesSchema, geCategoryCountsSchema] },
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
        outputSchema: geCategoryCountsSchema,
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
        outputSchema: geCategoriesSchema,
        ...READ_ONLY_TOOL,
        annotations: { ...READ_ONLY_TOOL.annotations, openWorldHint: false },
    },
    {
        name: 'browse_items',
        title: 'Browse Catalogue Items',
        description: "Browse one RS3 catalogue group. Use lookup_item for name search or get_item_price for one item record.\n\nDiscover category IDs with get_ge_info view=categories and nonempty letters with view=category_counts. IDs 0 and 42 both say Miscellaneous but are separate groups, not aliases.\n\nFor example, {\"category\":24,\"alpha\":\"#\",\"page\":2} requests the second numeric-name page of high-level melee weapons. Pass a literal #, not %23; the server encodes it. When changing category or alpha, restart page at 1 rather than continuing the old sequence.\n\nJagex total counts the category, not the letter. Stop on empty items; isError means failure, not completion. Guide prices lag activity.\n\nEach call makes one uncached public Jagex read. No credentials required; HTTP defaults to 60 requests/IP/minute. Honor 429 Retry-After.",
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
            const unexpected = rejectUnknownKeys(args, ['itemId', 'name', 'itemIds', 'includeLiveData']);
            if (unexpected) return unexpected;
            if (args?.includeLiveData !== undefined && typeof args.includeLiveData !== 'boolean') {
                return validationError('includeLiveData must be a boolean');
            }
            const includeLiveData = args?.includeLiveData === true;
            if (args?.itemIds !== undefined) {
                if (args?.itemId !== undefined || args?.name !== undefined) {
                    return validationError('Provide exactly one of itemId, name or itemIds');
                }
                const ids = parseBatch(args.itemIds, 'itemIds', (value, label) =>
                    requireInteger(value, label, { minimum: 0 }), true);
                if (isToolResponse(ids)) return ids;
                return runBatch('Item catalogue details', ids, itemId => handlePriceTool(name, { itemId, includeLiveData }));
            }
            const itemId = await resolveItemId(args, ['itemId', 'name', 'includeLiveData']);
            if (isToolResponse(itemId)) {
                return itemId;
            }

            const data = await makeApiRequest(
                `${RS3_GE_API}/catalogue/detail.json?item=${itemId}`
            );
            if (!data?.item || typeof data.item !== 'object' || Array.isArray(data.item)) {
                throw new Error(`Jagex returned no catalogue item for ${itemId}`);
            }
            const enrichment = includeLiveData ? await fetchLiveItemData(itemId) : {};
            const detail = { ...data, item: { ...data.item, ...enrichment,
                wikiUrl: `https://runescape.wiki/w/Special:Lookup?type=item&id=${itemId}` } };
            return createSuccessResponse(`Item Detail for ${itemId}`, detail);
        }

        case 'get_ge_info': {
            const unexpected = rejectUnknownKeys(args, ['view', 'category']);
            if (unexpected) {
                return unexpected;
            }
            const view = args.view === undefined ? 'status' : args.view;
            if (!['status', 'categories', 'category_counts'].includes(view as string)) return validationError('view must be status, categories or category_counts');
            if (view === 'category_counts') return handlePriceTool('get_category_info', { category: args.category });
            if (args.category !== undefined) return validationError('category is valid only with view=category_counts');
            if (view === 'categories') return handlePriceTool('get_all_categories', {});
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
