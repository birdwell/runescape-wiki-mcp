// Resources for RuneScape Wiki MCP Server

import { Resource, ReadResourceRequest } from '@modelcontextprotocol/sdk/types.js';
import { RS3_PRICES_API, RESOURCE_URIS } from './constants.js';
import { makeApiRequest } from './utils.js';

// Resource definitions
export const resources: Resource[] = [
    {
        uri: RESOURCE_URIS.LATEST_PRICES,
        name: 'Grand Exchange Database Info',
        description: 'Information about the Grand Exchange Database including last update',
        mimeType: 'application/json',
    },
    {
        uri: RESOURCE_URIS.ITEM_MAPPING,
        name: 'Item Categories',
        description: 'Available item categories in the Grand Exchange',
        mimeType: 'application/json',
    },
];

// Resource handler
export async function handleResource(request: ReadResourceRequest) {
    const { uri } = request.params;

    switch (uri) {
        case RESOURCE_URIS.LATEST_PRICES: {
            const data = await makeApiRequest(`${RS3_PRICES_API}/info.json`);
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
            // Get info about category 1 as an example of available categories
            const data = await makeApiRequest(`${RS3_PRICES_API}/catalogue/category.json?category=1`);
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