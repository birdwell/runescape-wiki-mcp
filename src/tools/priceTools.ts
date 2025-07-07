// Price tools for RuneScape Wiki MCP Server

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { RS3_PRICES_API } from '../constants.js';
import { makeApiRequest, createSuccessResponse } from '../utils.js';
import { ToolArguments, ToolResponse } from '../types.js';

// Tool definitions for price-related functionality
export const priceTools: Tool[] = [
    {
        name: 'get_latest_prices',
        description: 'Get the latest Grand Exchange prices for all items or a specific item',
        inputSchema: {
            type: 'object',
            properties: {
                itemId: {
                    type: 'number',
                    description: 'Optional item ID to get price for specific item',
                },
            },
        },
    },
    {
        name: 'get_5m_prices',
        description: 'Get 5-minute average prices for all items',
        inputSchema: {
            type: 'object',
            properties: {
                timestamp: {
                    type: 'number',
                    description: 'Optional Unix timestamp to get prices for specific time',
                },
            },
        },
    },
    {
        name: 'get_1h_prices',
        description: 'Get 1-hour average prices for all items',
        inputSchema: {
            type: 'object',
            properties: {
                timestamp: {
                    type: 'number',
                    description: 'Optional Unix timestamp to get prices for specific time',
                },
            },
        },
    },
    {
        name: 'get_timeseries',
        description: 'Get price time series data for a specific item',
        inputSchema: {
            type: 'object',
            properties: {
                itemId: {
                    type: 'number',
                    description: 'Item ID to get time series for',
                },
                timestep: {
                    type: 'string',
                    enum: ['5m', '1h', '6h', '24h'],
                    description: 'Time interval for the series',
                },
            },
            required: ['itemId', 'timestep'],
        },
    },
];

// Tool handlers for price-related functionality
export async function handlePriceTool(name: string, args: ToolArguments): Promise<ToolResponse> {
    switch (name) {
        case 'get_latest_prices': {
            const itemId = args?.itemId as number | undefined;
            let url = `${RS3_PRICES_API}/latest`;
            if (itemId) {
                url += `?id=${itemId}`;
            }

            const data = await makeApiRequest(url);
            return createSuccessResponse('Latest Grand Exchange Prices', data);
        }

        case 'get_5m_prices': {
            const timestamp = args?.timestamp as number | undefined;
            let url = `${RS3_PRICES_API}/5m`;
            if (timestamp) {
                url += `?timestamp=${timestamp}`;
            }

            const data = await makeApiRequest(url);
            return createSuccessResponse('5-Minute Average Prices', data);
        }

        case 'get_1h_prices': {
            const timestamp = args?.timestamp as number | undefined;
            let url = `${RS3_PRICES_API}/1h`;
            if (timestamp) {
                url += `?timestamp=${timestamp}`;
            }

            const data = await makeApiRequest(url);
            return createSuccessResponse('1-Hour Average Prices', data);
        }

        case 'get_timeseries': {
            const itemId = args?.itemId as number;
            const timestep = args?.timestep as string;

            const url = `${RS3_PRICES_API}/timeseries?id=${itemId}&timestep=${timestep}`;
            const data = await makeApiRequest(url);

            return createSuccessResponse(`Price Time Series for Item ${itemId} (${timestep})`, data);
        }

        default:
            throw new Error(`Unknown price tool: ${name}`);
    }
} 