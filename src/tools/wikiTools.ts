// Wiki tools for RuneScape Wiki MCP Server

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { RUNESCAPE_WIKI_API } from '../constants.js';
import { makeApiRequest, createSuccessResponse } from '../utils.js';
import { ToolArguments, ToolResponse } from '../types.js';
import { JSON_SCHEMA_2020_12, READ_ONLY_TOOL } from '../mcpSchemas.js';
import { isToolResponse, requireString } from '../validation.js';

export const wikiTools: Tool[] = [
    {
        name: 'get_wiki_page_content',
        title: 'Get Wiki Page Content',
        description: 'Fetch the plain text content of a RuneScape Wiki page (e.g., Mining, Smithing, etc.)',
        inputSchema: {
            $schema: JSON_SCHEMA_2020_12,
            type: 'object',
            properties: {
                page: {
                    type: 'string',
                    minLength: 1,
                    description: 'The title of the wiki page to fetch (case-sensitive, spaces allowed)',
                },
            },
            required: ['page'],
            additionalProperties: false,
        },
        ...READ_ONLY_TOOL,
    },
];

export async function handleWikiTool(name: string, args: ToolArguments): Promise<ToolResponse> {
    switch (name) {
        case 'get_wiki_page_content': {
            const page = requireString(args?.page, 'page');
            if (isToolResponse(page)) {
                return page;
            }

            const url = `${RUNESCAPE_WIKI_API}?action=query&prop=extracts&format=json&explaintext=1&titles=${encodeURIComponent(page)}`;
            const data = await makeApiRequest(url);
            const pages = data?.query?.pages || {};
            const firstPage = Object.values(pages)[0];
            let extract = '(No content found)';
            if (firstPage && typeof firstPage === 'object' && 'extract' in firstPage && typeof firstPage.extract === 'string') {
                extract = firstPage.extract;
            }
            return createSuccessResponse(`Wiki Page: ${page}`, extract);
        }
        default:
            throw new Error(`Unknown wiki tool: ${name}`);
    }
}
