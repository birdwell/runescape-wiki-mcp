// Price history summary tools for RuneScape Wiki MCP Server

import type { Tool } from '@modelcontextprotocol/server';
import { WEIRDGLOOP_EXCHANGE_API } from '../constants.js';
import { resolveItemId } from '../itemResolve.js';
import { ITEM_SELECTOR, itemIdProperty, JSON_SCHEMA_2020_12, priceSummaryOutputSchema, READ_ONLY_TOOL } from '../mcpSchemas.js';
import { ToolArguments, ToolResponse } from '../types.js';
import { createSuccessResponse, makeApiRequest } from '../utils.js';
import { isToolResponse, optionalInteger, validationError } from '../validation.js';

const DEFAULT_DAYS = 30;
const MIN_DAYS = 7;
const MAX_DAYS = 90;

interface HistoryPoint {
    price: number;
    volume?: number;
}

interface PriceHistorySummary {
    itemId: number;
    name?: string;
    windowDays: number;
    sampleCount: number;
    latestPrice: number;
    oldestPriceInWindow: number;
    minPrice: number;
    maxPrice: number;
    avgPrice: number;
    changeAbs: number;
    changePct: number;
    avgDailyVolume?: number;
}

export const historyTools: Tool[] = [
    {
        name: 'summarize_price_history',
        title: 'Summarize Daily Price Statistics',
        description:
            "Calculate min/max, mean and start-to-end change from Weirdgloop daily prices; this tool returns statistics, not a time series. For timestamped Jagex guide-price observations or UTC date bounds, call get_item_graph instead. Use get_item_price for catalogue detail.\n" +
            "- Choose itemId to skip name resolution, or name to resolve first. days selects trailing usable samples from a fixed 90-day fetch; it does not change fetch size. Fewer available samples reduce windowDays.\n" +
            "- Return one aggregate: sample min/max, unweighted mean, newest-minus-oldest change and percentage relative to oldest. Volume averages exclude unreported values. There are no forecasts; no usable history is an error.\n" +
            "- Daily history lags live offers. No auth or local cache. Shared HTTP budget: 60 requests/IP/minute; retry 429 after Retry-After.",
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
                days: {
                    type: 'integer',
                    minimum: MIN_DAYS,
                    maximum: MAX_DAYS,
                    description: `Size of the trailing window in days (${MIN_DAYS}-${MAX_DAYS}, default ${DEFAULT_DAYS})`,
                },
            },
            ...ITEM_SELECTOR,
            additionalProperties: false,
        },
        outputSchema: priceSummaryOutputSchema,
        ...READ_ONLY_TOOL,
    },
];

function parseHistoryPoints(data: unknown, itemId: number): HistoryPoint[] {
    if (!data || typeof data !== 'object') {
        return [];
    }
    const series = (data as Record<string, unknown>)[String(itemId)];
    if (!Array.isArray(series)) {
        return [];
    }

    const points: HistoryPoint[] = [];
    for (const entry of series) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
        const { price, volume } = entry as { price?: unknown; volume?: unknown };
        if (typeof price !== 'number' || !Number.isFinite(price)) {
            continue;
        }
        points.push({
            price,
            volume: typeof volume === 'number' && Number.isFinite(volume) ? volume : undefined,
        });
    }
    return points;
}

function summarize(
    itemId: number,
    name: string | undefined,
    points: HistoryPoint[],
    days: number
): PriceHistorySummary {
    const window = points.slice(-days);
    const prices = window.map(point => point.price);
    const volumes = window
        .map(point => point.volume)
        .filter((volume): volume is number => volume !== undefined);

    const latestPrice = prices[prices.length - 1];
    const oldestPriceInWindow = prices[0];
    const total = prices.reduce((sum, price) => sum + price, 0);
    const changeAbs = latestPrice - oldestPriceInWindow;

    return {
        itemId,
        ...(name ? { name } : {}),
        windowDays: window.length,
        sampleCount: window.length,
        latestPrice,
        oldestPriceInWindow,
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        avgPrice: Math.round(total / prices.length),
        changeAbs,
        changePct:
            oldestPriceInWindow === 0
                ? 0
                : Math.round((changeAbs / oldestPriceInWindow) * 10000) / 100,
        ...(volumes.length > 0
            ? {
                  avgDailyVolume: Math.round(
                      volumes.reduce((sum, volume) => sum + volume, 0) / volumes.length
                  ),
              }
            : {}),
    };
}

export async function handleHistoryTool(name: string, args: ToolArguments): Promise<ToolResponse> {
    switch (name) {
        case 'summarize_price_history': {
            const daysResult = optionalInteger(args?.days, 'days', {
                minimum: MIN_DAYS,
                maximum: MAX_DAYS,
            });
            if (isToolResponse(daysResult)) {
                return daysResult;
            }
            const days = daysResult ?? DEFAULT_DAYS;

            const itemId = await resolveItemId(args, ['itemId', 'name', 'days']);
            if (isToolResponse(itemId)) {
                return itemId;
            }

            const data = await makeApiRequest(`${WEIRDGLOOP_EXCHANGE_API}/last90d?id=${itemId}`);
            const points = parseHistoryPoints(data, itemId);
            if (points.length === 0) {
                return validationError(`No price history available for item ${itemId}`);
            }

            const itemName = typeof args?.name === 'string' ? args.name : undefined;
            const summary = summarize(itemId, itemName, points, days);
            return createSuccessResponse(
                `Price history summary for item ${itemId} (last ${summary.windowDays} day(s))`,
                summary
            );
        }

        default:
            throw new Error(`Unknown history tool: ${name}`);
    }
}
