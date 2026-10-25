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

export const priceTools: Tool[] = [
    {
        name: 'get_item_price',
        title: 'Get Item Details and Reported Trades',
        description:
            "Read Jagex item records with guide prices and Wiki ID links, optionally enriched with RS3 reported trades and numeric item facts. Use browse_items for category listings or get_ge_info for catalogue configuration status.\n\n" +
            "For daily guide-price/volume comparisons use compare_items; for dated observations get_item_graph; for calculated statistics summarize_price_history.\n\n" +
            "Choose exactly one input form, using IDs from lookup_item:\n\n| Input example | Behavior |\n| --- | --- |\n| {\"itemId\":4151} | Fetch directly; return item. |\n| {\"name\":\"Abyssal whip\"} | Resolve first; return item or an error with ambiguity candidates. |\n| {\"itemIds\":[4151]} | Return ordered batch rows, even for one ID; each item is in results[].data.item. |\n\n" +
            "Batch inputs are validated before fetching. An unavailable valid ID fails only its row; all rows failing makes the call an error. At most two reads run concurrently. A 429 stops queued IDs; honor Retry-After.\n\n" +
            "includeLiveData adds item.liveTrades and item.wikiFacts; guide fields stay unchanged. Reported transactions are not executable orders, and published buy limits are not remaining account quota.\n\n" +
            "Trades cache 30 seconds and the numeric mapping 10 minutes per process; fetchedAt retains the original retrieval time. Guide records remain uncached and lag market activity. No credentials are required. The shared HTTP budget defaults to 60 requests/IP/minute.",

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
