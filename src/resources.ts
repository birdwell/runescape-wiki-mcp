// Resources for RuneScape Wiki MCP Server

import { Resource, ReadResourceRequest } from '@modelcontextprotocol/sdk/types.js';
import { RS3_PRICES_API, RESOURCE_URIS } from './constants.js';
import { makeApiRequest } from './utils.js';

// Resource definitions
export const resources: Resource[] = [
    {
        uri: RESOURCE_URIS.LATEST_PRICES,
        name: 'Latest Grand Exchange Prices',
        description: 'Current Grand Exchange prices for all items',
        mimeType: 'application/json',
    },
    {
        uri: RESOURCE_URIS.ITEM_MAPPING,
        name: 'Item Mapping',
        description: 'Complete mapping of all items with metadata',
        mimeType: 'application/json',
    },
];

// Resource handler
export async function handleResource(request: ReadResourceRequest) {
    const { uri } = request.params;

    switch (uri) {
        case RESOURCE_URIS.LATEST_PRICES: {
            const data = await makeApiRequest(`${RS3_PRICES_API}/latest`);
            return {
                contents: [
                    {
                        uri,
                        mimeType: 'application/json',
                        text: JSON.stringify(data, null, 2),
                    },
                ],
            };
        }

        case RESOURCE_URIS.ITEM_MAPPING: {
            const data = await makeApiRequest(`${RS3_PRICES_API}/mapping`);
            return {
                contents: [
                    {
                        uri,
                        mimeType: 'application/json',
                        text: JSON.stringify(data, null, 2),
                    },
                ],
            };
        }

        default:
            throw new Error(`Unknown resource: ${uri}`);
    }
} 