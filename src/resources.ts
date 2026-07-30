// Resources for RuneScape Wiki MCP Server

import type { Resource, ReadResourceRequest } from '@modelcontextprotocol/server';
import { ITEM_CATEGORIES } from './categories.js';
import { RS3_GE_API, RESOURCE_URIS } from './constants.js';
import { makeApiRequest } from './utils.js';
import { resourceNotFoundError } from './errors.js';

export const resources: Resource[] = [
    {
        uri: RESOURCE_URIS.GE_INFO,
        name: 'Grand Exchange Database Info',
        description:
            'Grand Exchange database metadata from Jagex (lastConfigUpdateRuneday). Not item prices — use get_item_price or lookup_item for prices.',
        mimeType: 'application/json',
    },
    {
        uri: RESOURCE_URIS.GE_CATEGORIES,
        name: 'Grand Exchange Categories',
        description: 'Canonical list of RS3 Grand Exchange category IDs and names (0-43).',
        mimeType: 'application/json',
    },
];

export async function handleResource(request: ReadResourceRequest) {
    const { uri } = request.params;

    switch (uri) {
        case RESOURCE_URIS.GE_INFO: {
            const data = await makeApiRequest(`${RS3_GE_API}/info.json`);
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

        case RESOURCE_URIS.GE_CATEGORIES: {
            return {
                contents: [
                    {
                        uri,
                        mimeType: 'application/json',
                        text: JSON.stringify(ITEM_CATEGORIES, null, 2),
                    },
                ],
            };
        }

        default:
            throw resourceNotFoundError(uri);
    }
}
