// Item lookup and graph tools for RuneScape Wiki MCP Server

import type { Tool } from '@modelcontextprotocol/server';
import { dateProperty, filterPriceMap, parseDateRange } from '../dateRange.js';
import { RS3_GE_API } from '../constants.js';
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
            "Retrieve about 180 days of Jagex guide-price observations for plotting or custom calculations: daily/average timestamp maps, not statistics or an image. For a ready-made min/max/mean/change answer, use summarize_price_history instead; it computes statistics from Weirdgloop daily history.\n" +
            "- Pass exactly one of itemId or name; an ID skips name lookup and ambiguous names return candidate errors. Optional from/to are inclusive UTC dates, YYYY-MM-DD, applied to both maps. Supply either bound or both; from must not exceed to.\n" +
            "- Omit dates for the full upstream window. Filtering cannot recover older samples; unavailable ranges return empty maps, without extrapolation. Keys are Unix milliseconds, values coins. Guide values lag live offers.\n" +
            "- No auth or local cache; upstream failures return tool errors. HTTP shares a default 60 requests/IP/minute budget; honor Retry-After on 429.",
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
                from: { ...dateProperty, description: 'First UTC date to include; omitted means start of available history' },
                to: { ...dateProperty, description: 'Last UTC date to include; omitted means end of available history' },
            },
            ...ITEM_SELECTOR,
            additionalProperties: false,
        },
        outputSchema: graphOutputSchema,
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
            const range = parseDateRange(args?.from, args?.to);
            if (isToolResponse(range)) return range;
            const itemId = await resolveItemId(args, ['itemId', 'name', 'from', 'to']);
            if (isToolResponse(itemId)) {
                return itemId;
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
