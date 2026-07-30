// Wiki tools for RuneScape Wiki MCP Server

import type { Tool } from '@modelcontextprotocol/server';
import { RUNESCAPE_WIKI_API } from '../constants.js';
import { JSON_SCHEMA_2020_12, READ_ONLY_TOOL } from '../mcpSchemas.js';
import { ToolArguments, ToolResponse } from '../types.js';
import { makeApiRequest, createSuccessResponse } from '../utils.js';
import {
    isToolResponse,
    rejectUnknownKeys,
    requireString,
    validationError,
} from '../validation.js';

export const wikiTools: Tool[] = [
    {
        name: 'get_wiki_page_content',
        title: 'Get Wiki Page Content',
        description:
            'Fetch plain-text content of a RuneScape Wiki page. Follows redirects. Prefer exact titles; use lookup_item or wiki search when unsure.',
        inputSchema: {
            $schema: JSON_SCHEMA_2020_12,
            type: 'object',
            properties: {
                page: {
                    type: 'string',
                    minLength: 1,
                    description: 'Wiki page title (spaces allowed; redirects are followed)',
                },
            },
            required: ['page'],
            additionalProperties: false,
        },
        ...READ_ONLY_TOOL,
    },
];

interface WikiPage {
    pageid?: number;
    title?: string;
    missing?: boolean | string;
    extract?: string;
}

export async function handleWikiTool(name: string, args: ToolArguments): Promise<ToolResponse> {
    switch (name) {
        case 'get_wiki_page_content': {
            const unexpected = rejectUnknownKeys(args, ['page']);
            if (unexpected) {
                return unexpected;
            }

            const page = requireString(args?.page, 'page', { minLength: 1 });
            if (isToolResponse(page)) {
                return page;
            }

            const url =
                `${RUNESCAPE_WIKI_API}?action=query&prop=extracts&format=json` +
                `&explaintext=1&redirects=1&titles=${encodeURIComponent(page)}`;
            const data = await makeApiRequest(url);
            const pages = (data?.query?.pages ?? {}) as Record<string, WikiPage>;
            const firstPage = Object.values(pages)[0];

            if (!firstPage || firstPage.missing !== undefined) {
                return validationError(
                    `Wiki page "${page}" was not found. Try a different title or lookup_item.`
                );
            }

            const extract =
                typeof firstPage.extract === 'string' ? firstPage.extract.trim() : '';
            if (!extract) {
                return validationError(
                    `Wiki page "${firstPage.title ?? page}" has no extractable text.`
                );
            }

            const resolvedTitle = firstPage.title ?? page;
            return createSuccessResponse(`Wiki Page: ${resolvedTitle}`, extract);
        }

        default:
            throw new Error(`Unknown wiki tool: ${name}`);
    }
}
