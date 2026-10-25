// Item lookup and graph tools for RuneScape Wiki MCP Server

import type { Tool } from '@modelcontextprotocol/server';
import { dateProperty, filterPriceMap, parseDateRange } from '../dateRange.js';
import { RS3_GE_API } from '../constants.js';
import { fetchWeirdgloopSeries } from '../priceSeries.js';
import { handleHistoryTool } from './historyTools.js';
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
            "- query is a literal item name or prefix: \"Abyssal whip\" tries an exact match; \"abyssal\" discovers alternatives. limit defaults to 5, maximum 10. An exact match stops the search even with a larger limit; otherwise the first limit Wiki candidates are checked against Weirdgloop latest. Non-GE hits are discarded, so fewer than limit matches may remain; a larger limit can reveal more GE candidates.\n" +
            "- Choose a returned ID for get_item_price current-data views, get_item_graph historical views, or estimate_flip profit math. No matches returns a tool error; optional price fields can be absent and samples lag live offers.\n" +
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
        description: "Read dated RS3 price history for one known GE item. Resolve names with lookup_item; use get_item_price for current records or candidate comparisons.\n\n- itemId=4151 means Abyssal whip, not a quantity. For observations, choose Jagex for provider averages over roughly 180 days or Weirdgloop for daily samples with reported volume over roughly 90 days.\n- from/to include whole UTC days. Equal bounds cover that day; omitted bounds retain all available history. Requested dates cannot extend retention.\n- statistics computes min/max, unweighted mean and start-to-end change from a fixed 90-day Weirdgloop fetch. For example, days=7 takes the last seven usable samples even if missing dates make them span more than a week.\n- Unavailable observation dates return empty data; unusable statistics history returns an error. Invalid bounds fail before fetching.\n- Reads are uncached and require no credentials. Provider errors surface without switching sources or retrying automatically. HTTP defaults to 60 requests/IP/minute; wait for Retry-After after 429.",
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
                samples: { type: 'array', description: 'Chronological usable observations; malformed timestamp/price rows are discarded, unreported volume omitted, and an entirely malformed nonempty feed is an error', items: { type: 'object', properties: {
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
            const view = args.view === undefined ? 'observations' : args.view;
            if (view === 'statistics') {
                const extra = rejectUnknownKeys(args, ['itemId', 'name', 'view', 'source', 'days']);
                if (extra) return extra;
                if (args.source !== undefined && args.source !== 'weirdgloop') return validationError('statistics uses Weirdgloop only');
                return handleHistoryTool('summarize_price_history', { itemId: args.itemId, name: args.name, days: args.days });
            }
            if (view !== 'observations') return validationError('view must be observations or statistics');
            if (args.days !== undefined) return validationError('days is valid only with view=statistics; use from/to for observations');
            const source = args?.source === undefined ? 'jagex' : args.source;
            if (source !== 'jagex' && source !== 'weirdgloop') return validationError('source must be jagex or weirdgloop');
            const range = parseDateRange(args?.from, args?.to);
            if (isToolResponse(range)) return range;
            const itemId = await resolveItemId(args, ['itemId', 'name', 'from', 'to', 'source', 'view']);
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
