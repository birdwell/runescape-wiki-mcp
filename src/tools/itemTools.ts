// Item lookup and graph tools for RuneScape Wiki MCP Server

import type { Tool } from '@modelcontextprotocol/server';
import { dateProperty, filterPriceMap, parseDateRange } from '../dateRange.js';
import { RS3_GE_API } from '../constants.js';
import { fetchWeirdgloopSeries } from '../priceSeries.js';
import { lookupItems, resolveItemId } from '../itemResolve.js';
import { ITEM_SELECTOR, itemIdProperty, JSON_SCHEMA_2020_12, lookupOutputSchema, graphOutputSchema, READ_ONLY_TOOL } from '../mcpSchemas.js';
import { ToolArguments, ToolResponse } from '../types.js';
import { makeApiRequest, createSuccessResponse } from '../utils.js';
import {
    isToolResponse,
    optionalInteger,
    rejectUnknownKeys,
    requireString,
    validationError,
} from '../validation.js';

export const itemTools: Tool[] = [
    {
        name: 'lookup_item',
        title: 'Lookup Item',
        description:
            "Find tradeable RS3 items by name, returning matches with ID, name, wiki URL and available price, volume and sample timestamp.\n" +
            "- query is a literal item name or prefix: \"Abyssal whip\" tries an exact match; \"abyssal\" discovers alternatives. limit defaults to 5, maximum 10. An exact match stops the search even with a larger limit; otherwise wiki opensearch candidates are filtered to GE items.\n" +
            "- Choose a returned ID for get_item_price detail, summarize_price_history statistics or get_item_graph daily samples. No matches returns a tool error; optional price fields can be absent and samples lag live offers.\n" +
            "- No auth or local cache. HTTP shares 60 requests/IP/minute by default; honor Retry-After on 429.",
        inputSchema: {
            $schema: JSON_SCHEMA_2020_12,
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    minLength: 1,
                    description: 'Item name or partial name to search for',
                },
                limit: {
                    type: 'integer',
                    minimum: 1,
                    maximum: 10,
                    description: 'Max matches to return (default 5)',
                },
            },
            required: ['query'],
            additionalProperties: false,
        },
        outputSchema: lookupOutputSchema,
        ...READ_ONLY_TOOL,
    },
    {
        name: 'get_item_graph',
        title: 'Get Item Price Time Series',
        description:
            "Retrieve dated price observations for charts or custom calculations. For a ready-made min/max/mean/change answer, use summarize_price_history; get_item_price provides catalogue details and predefined Jagex trends.\n" +
            "- Choose source: jagex (default) returns about 180 days as daily/average maps; weirdgloop returns about 90 days as chronological samples with price and available volume. Both use Unix milliseconds and coins, and lag live offers. This tool computes no summary statistics or images.\n" +
            "- Pass itemId or name, never both. IDs skip name lookup; ambiguous names fail with candidates. from/to are inclusive UTC YYYY-MM-DD bounds on either source. Omitted bounds are open; from=to includes the whole day. Reversed bounds fail.\n" +
            "- Filtering does not backfill missing history: unavailable ranges return empty maps/samples. The selected provider never falls back to another. No auth or local cache; upstream failures are errors. Shared HTTP limit: 60 requests/IP/minute; honor 429 Retry-After.",
        inputSchema: {
            $schema: JSON_SCHEMA_2020_12,
            type: 'object',
            properties: {
                itemId: {
                    ...itemIdProperty,
                    description: 'Grand Exchange item ID (provide itemId or name)',
                },
                name: {
                    type: 'string',
                    minLength: 1,
                    description: 'Item name (provide itemId or name)',
                },
                source: { type: 'string', enum: ['jagex', 'weirdgloop'], default: 'jagex',
                    description: 'Provider/shape: Jagex daily+average maps (default), or raw Weirdgloop daily samples' },
                from: { ...dateProperty, description: 'First UTC date to include; omitted means start of available history' },
                to: { ...dateProperty, description: 'Last UTC date to include; omitted means end of available history' },
            },
            ...ITEM_SELECTOR,
            additionalProperties: false,
        },
        outputSchema: { ...graphOutputSchema,
            properties: { ...graphOutputSchema.properties,
                itemId: itemIdProperty,
                source: { const: 'weirdgloop', description: 'Present for the Weirdgloop sample-array variant' },
                samples: { type: 'array', items: { type: 'object', properties: {
                    timestamp: { type: 'integer', minimum: 0, description: 'UTC Unix timestamp in milliseconds, not seconds' },
                    price: { type: 'number', minimum: 0, description: 'Observed guide price in coins' },
                    volume: { type: 'number', minimum: 0, description: 'Provider-reported daily volume, when available' },
                }, required: ['timestamp', 'price'], additionalProperties: false } },
            }, required: [], oneOf: [{ required: ['daily', 'average'] }, { required: ['itemId', 'source', 'samples'] }],
        },
        ...READ_ONLY_TOOL,
    },
];

export async function handleItemTool(name: string, args: ToolArguments): Promise<ToolResponse> {
    switch (name) {
        case 'lookup_item': {
            const unexpected = rejectUnknownKeys(args, ['query', 'limit']);
            if (unexpected) {
                return unexpected;
            }

            const query = requireString(args?.query, 'query', { minLength: 1 });
            if (isToolResponse(query)) {
                return query;
            }

            const limitResult = optionalInteger(args?.limit, 'limit', { minimum: 1, maximum: 10 });
            if (isToolResponse(limitResult)) {
                return limitResult;
            }
            const limit = limitResult ?? 5;

            const matches = await lookupItems(query, limit);
            if (matches.length === 0) {
                return validationError(`No Grand Exchange items found for "${query}"`);
            }
            return createSuccessResponse(`Item lookup for "${query}"`, matches, { matches });
        }

        case 'get_item_graph': {
            const source = args?.source === undefined ? 'jagex' : args.source;
            if (source !== 'jagex' && source !== 'weirdgloop') return validationError('source must be jagex or weirdgloop');
            const range = parseDateRange(args?.from, args?.to);
            if (isToolResponse(range)) return range;
            const itemId = await resolveItemId(args, ['itemId', 'name', 'from', 'to', 'source']);
            if (isToolResponse(itemId)) {
                return itemId;
            }

            if (source === 'weirdgloop') {
                return createSuccessResponse(`Daily Weirdgloop observations for item ${itemId}`,
                    await fetchWeirdgloopSeries(itemId, range));
            }
            const data = await makeApiRequest(`${RS3_GE_API}/graph/${itemId}.json`);
            const filtered = args?.from === undefined && args?.to === undefined ? data : {
                ...data,
                daily: filterPriceMap(data.daily ?? {}, range),
                average: filterPriceMap(data.average ?? {}, range),
            };
            return createSuccessResponse(`Price Graph for Item ${itemId}`, filtered);
        }

        default:
            throw new Error(`Unknown item tool: ${name}`);
    }
}
