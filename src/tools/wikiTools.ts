// Wiki tools for RuneScape Wiki MCP Server

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { RUNESCAPE_WIKI_API } from '../constants.js';
import { makeApiRequest, createSuccessResponse } from '../utils.js';
import { ToolArguments, ToolResponse } from '../types.js';

export const wikiTools: Tool[] = [
    {
        name: 'get_wiki_page_content',
        description: 'Fetch the plain text content of a RuneScape Wiki page (e.g., Mining, Smithing, etc.)',
        inputSchema: {
            type: 'object',
            properties: {
                page: {
                    type: 'string',
                    description: 'The title of the wiki page to fetch (case-sensitive, spaces allowed)',
                },
            },
            required: ['page'],
        },
    },
];

export async function handleWikiTool(name: string, args: ToolArguments): Promise<ToolResponse> {
    switch (name) {
        case 'get_wiki_page_content': {
            const page = args?.page as string;
            if (!page) {
                throw new Error('Page title is required');
            }
            const url = `${RUNESCAPE_WIKI_API}?action=query&prop=extracts&format=json&explaintext=1&titles=${encodeURIComponent(page)}`;
            const data = await makeApiRequest(url);
            // Extract the page content from the MediaWiki API response
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