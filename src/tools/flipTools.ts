// Grand Exchange flip profit estimation for RuneScape Wiki MCP Server

import type { Tool } from '@modelcontextprotocol/server';
import { RS3_GE_API } from '../constants.js';
import { lookupByItemId, resolveItemId } from '../itemResolve.js';
import { itemIdProperty, JSON_SCHEMA_2020_12, READ_ONLY_TOOL } from '../mcpSchemas.js';
import { ToolArguments, ToolResponse } from '../types.js';
import { createSuccessResponse, makeApiRequest } from '../utils.js';
import { isToolResponse, optionalInteger, validationError } from '../validation.js';

/*
 * RS3 Grand Exchange sales tax (runescape.wiki/w/Grand_Exchange, "Trade tariff",
 * live since the 9 January 2023 update):
 *   - 2% of the sale price is withheld from the SELLER, per item, rounded down.
 *   - The buyer pays the full price, so there is no buy-side tax.
 *   - Items priced at 50 coins or less are exempt, as are bonds.
 *   - RS3 has no documented per-item tax cap (the 5,000,000 cap is an OSRS rule).
 *
 * Per unit:  tax = sellPrice <= 50 ? 0 : floor(sellPrice * 0.02)
 * For quantity Q:
 *   grossProfit = (sellPrice - buyPrice) * Q
 *   totalTax    = tax * Q
 *   netProfit   = grossProfit - totalTax
 */
const SALES_TAX_RATE = 0.02;
const TAX_EXEMPT_MAX_PRICE = 50;
const BOND_ITEM_ID = 29492;

const FLIP_ARG_KEYS = ['itemId', 'name', 'buyPrice', 'sellPrice', 'quantity'] as const;

export const flipTools: Tool[] = [
    {
        name: 'estimate_flip',
        title: 'Estimate Flip Profit',
        description:
            'Estimate Grand Exchange flip profit after the 2% RS3 sales tax for an item, by itemId or name. ' +
            'This is an ESTIMATE ONLY: guide prices lag the live market, buy limits and fill times are not modelled, ' +
            'and actual profit will differ. Pass buyPrice/sellPrice to model your own offers.',
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
                    description: 'Item name (provide itemId or name). Prefer lookup_item for fuzzy search.',
                },
                buyPrice: {
                    type: 'integer',
                    minimum: 0,
                    description: 'Buy price per item in coins. Defaults to the current market price.',
                },
                sellPrice: {
                    type: 'integer',
                    minimum: 0,
                    description: 'Sell price per item in coins. Defaults to the current market price.',
                },
                quantity: {
                    type: 'integer',
                    minimum: 1,
                    description: 'Number of items to flip (default 1)',
                },
            },
            additionalProperties: false,
        },
        ...READ_ONLY_TOOL,
    },
];

const PRICE_SUFFIX_MULTIPLIERS: Record<string, number> = {
    k: 1_000,
    m: 1_000_000,
    b: 1_000_000_000,
};

/**
 * Parse a Jagex guide price, which may be a number or an abbreviated string
 * such as "75k", "2.4m", "1,234" or "-279".
 */
export function parseGuidePrice(value: unknown): number | undefined {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? Math.round(value) : undefined;
    }
    if (typeof value !== 'string') {
        return undefined;
    }

    const match = /^(-?\d+(?:\.\d+)?)([kmb])?$/i.exec(value.trim().replace(/,/g, ''));
    if (!match) {
        return undefined;
    }
    const multiplier = match[2] ? PRICE_SUFFIX_MULTIPLIERS[match[2].toLowerCase()] : 1;
    return Math.round(Number.parseFloat(match[1]) * multiplier);
}

export function salesTaxPerUnit(sellPrice: number, itemId: number): number {
    if (itemId === BOND_ITEM_ID || sellPrice <= TAX_EXEMPT_MAX_PRICE) {
        return 0;
    }
    return Math.floor(sellPrice * SALES_TAX_RATE);
}

interface MarketPrices {
    guidePrice?: number;
    weirdgloopPrice?: number;
    itemName?: string;
    detailError?: string;
}

async function fetchMarketPrices(itemId: number): Promise<MarketPrices> {
    const [detail, weirdgloopMatches] = await Promise.all([
        makeApiRequest(`${RS3_GE_API}/catalogue/detail.json?item=${itemId}`).then(
            data => ({ data, error: undefined as string | undefined }),
            (error: unknown) => ({
                data: undefined,
                error: error instanceof Error ? error.message : String(error),
            })
        ),
        lookupByItemId(itemId),
    ]);

    const match = weirdgloopMatches.find(entry => entry.id === itemId) ?? weirdgloopMatches[0];
    const detailName = detail.data?.item?.name;

    return {
        guidePrice: parseGuidePrice(detail.data?.item?.current?.price),
        weirdgloopPrice: match?.price,
        itemName: typeof detailName === 'string' ? detailName : match?.name,
        detailError: detail.error,
    };
}

export async function handleFlipTool(name: string, args: ToolArguments): Promise<ToolResponse> {
    switch (name) {
        case 'estimate_flip': {
            const buyOverride = optionalInteger(args?.buyPrice, 'buyPrice', { minimum: 0 });
            if (isToolResponse(buyOverride)) {
                return buyOverride;
            }
            const sellOverride = optionalInteger(args?.sellPrice, 'sellPrice', { minimum: 0 });
            if (isToolResponse(sellOverride)) {
                return sellOverride;
            }
            const quantityResult = optionalInteger(args?.quantity, 'quantity', { minimum: 1 });
            if (isToolResponse(quantityResult)) {
                return quantityResult;
            }
            const quantity = quantityResult ?? 1;

            const itemId = await resolveItemId(args, FLIP_ARG_KEYS);
            if (isToolResponse(itemId)) {
                return itemId;
            }

            const needsMarketPrice = buyOverride === undefined || sellOverride === undefined;
            const market: MarketPrices = needsMarketPrice ? await fetchMarketPrices(itemId) : {};
            const marketPrice = market.weirdgloopPrice ?? market.guidePrice;

            if (needsMarketPrice && marketPrice === undefined) {
                const reason = market.detailError
                    ? ` (Grand Exchange detail lookup failed: ${market.detailError})`
                    : '';
                return validationError(
                    `No market price available for item ${itemId}${reason}. ` +
                        'Pass both buyPrice and sellPrice to estimate the flip.'
                );
            }

            const buyPrice = buyOverride ?? (marketPrice as number);
            const sellPrice = sellOverride ?? (marketPrice as number);

            const taxPerUnit = salesTaxPerUnit(sellPrice, itemId);
            const grossProfit = (sellPrice - buyPrice) * quantity;
            const totalTax = taxPerUnit * quantity;
            const netProfit = grossProfit - totalTax;
            const investment = buyPrice * quantity;

            const priceSource = {
                buyPrice: buyOverride !== undefined ? 'override' : sourceLabel(market),
                sellPrice: sellOverride !== undefined ? 'override' : sourceLabel(market),
                ...(market.guidePrice !== undefined && { guidePrice: market.guidePrice }),
                ...(market.weirdgloopPrice !== undefined && {
                    weirdgloopPrice: market.weirdgloopPrice,
                }),
                ...(market.detailError !== undefined && { guidePriceError: market.detailError }),
            };

            const payload = {
                itemId,
                ...(market.itemName && { itemName: market.itemName }),
                quantity,
                buyPrice,
                sellPrice,
                priceSource,
                taxRate: SALES_TAX_RATE,
                taxPerUnit,
                totalTax,
                grossProfit,
                netProfit,
                netProfitPerUnit: netProfit / quantity,
                marginPct: investment > 0 ? round2((netProfit / investment) * 100) : null,
                breakEvenSellPrice: breakEvenSellPrice(buyPrice, itemId),
                assumptions: buildAssumptions(itemId, sellPrice, buyOverride, sellOverride),
            };

            const label = market.itemName ? `${market.itemName} (${itemId})` : `item ${itemId}`;
            return createSuccessResponse(`Flip estimate for ${label} x${quantity}`, payload);
        }

        default:
            throw new Error(`Unknown flip tool: ${name}`);
    }
}

function sourceLabel(market: MarketPrices): string {
    return market.weirdgloopPrice !== undefined ? 'weirdgloop' : 'jagex-guide';
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

/** Lowest sell price at which the flip breaks even after tax. */
function breakEvenSellPrice(buyPrice: number, itemId: number): number {
    // Tax is floored, so the answer lands within a coin or two of buyPrice / (1 - rate).
    let sell = buyPrice;
    if (salesTaxPerUnit(buyPrice, itemId) > 0) {
        sell = Math.max(buyPrice, Math.floor(buyPrice / (1 - SALES_TAX_RATE)) - 2);
    }
    while (sell - salesTaxPerUnit(sell, itemId) < buyPrice) {
        sell += 1;
    }
    return sell;
}

function buildAssumptions(
    itemId: number,
    sellPrice: number,
    buyOverride: number | undefined,
    sellOverride: number | undefined
): string[] {
    const assumptions = [
        'RS3 charges the seller a 2% Grand Exchange sales tax per item, rounded down (live since 9 January 2023).',
        'The buyer pays the full price, so no buy-side tax is applied.',
        'RS3 has no documented per-item tax cap; the 5,000,000 coin cap is an Old School RuneScape rule.',
        'Estimate only: guide prices lag the live market, and buy limits, fill times, and price movement are not modelled.',
    ];

    if (itemId === BOND_ITEM_ID) {
        assumptions.push('Bonds are exempt from the Grand Exchange sales tax.');
    } else if (sellPrice <= TAX_EXEMPT_MAX_PRICE) {
        assumptions.push(
            `Items priced at ${TAX_EXEMPT_MAX_PRICE} coins or less are tax exempt, so no tax was applied.`
        );
    }

    if (buyOverride === undefined && sellOverride === undefined) {
        assumptions.push(
            'No buyPrice or sellPrice given, so both default to the same market price and the estimate shows a loss equal to the tax. Supply your intended offers for a real margin.'
        );
    }

    return assumptions;
}
