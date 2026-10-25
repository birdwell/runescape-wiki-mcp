// Wiki tools for RuneScape Wiki MCP Server

import type { Tool } from '@modelcontextprotocol/server';
import { RUNESCAPE_WIKI_API } from '../constants.js';
import { JSON_SCHEMA_2020_12, READ_ONLY_TOOL } from '../mcpSchemas.js';
import { ToolArguments, ToolResponse } from '../types.js';
import { makeApiRequest, createSuccessResponse } from '../utils.js';
import {
    isToolResponse,
    optionalInteger,
    rejectUnknownKeys,
    requireString,
    validationError,
} from '../validation.js';

const wikiSearchOutputSchema = {
    $schema: JSON_SCHEMA_2020_12,
    type: 'object' as const,
    properties: {
        results: {
            type: 'array' as const,
            description: 'Matching RuneScape Wiki pages, best match first',
            items: {
                type: 'object' as const,
                properties: {
                    title: { type: 'string' as const, description: 'Wiki page title' },
                    snippet: { type: 'string' as const, description: 'Plain-text search snippet' },
                    url: { type: 'string' as const, description: 'RuneScape Wiki page URL' },
                },
                required: ['title', 'snippet', 'url'],
                additionalProperties: false,
            },
        },
    },
    required: ['results'],
    additionalProperties: false,
};

export const wikiTools: Tool[] = [
    {
        name: 'search_wiki',
        title: 'Search Wiki',
        description:
            'Search RuneScape Wiki titles and snippets. Read-only. Use when the page title is unknown, then pass a result title to get_wiki_page_content. For Grand Exchange prices, use lookup_item instead.',
        inputSchema: {
            $schema: JSON_SCHEMA_2020_12,
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 200,
                    description: 'Words to search for on the RuneScape Wiki',
                },
                limit: {
                    type: 'integer',
                    minimum: 1,
                    maximum: 10,
                    description: 'Max pages to return (default 5)',
                },
            },
            required: ['query'],
            additionalProperties: false,
        },
        outputSchema: wikiSearchOutputSchema,
        ...READ_ONLY_TOOL,
    },
    {
        name: 'get_wiki_page_content',
        title: 'Get Wiki Page Content',
        description:
            'Fetch plain-text content of a RuneScape Wiki page. Follows redirects. Pass an exact title; call search_wiki first when the title is unknown.',
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

interface WikiSearchHit {
    title?: string;
    snippet?: string;
}

function wikiPageUrl(title: string): string {
    return `https://runescape.wiki/w/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

function plainSnippet(snippet: string): string {
    return snippet
        .replace(/<[^>]+>/g, '')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;|&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();
}

export async function handleWikiTool(name: string, args: ToolArguments, signal?: AbortSignal): Promise<ToolResponse> {
    switch (name) {
        case 'search_wiki': {
            const unexpected = rejectUnknownKeys(args, ['query', 'limit']);
            if (unexpected) {
                return unexpected;
            }

            const query = requireString(args?.query, 'query', { minLength: 1, maxLength: 200 });
            if (isToolResponse(query)) {
                return query;
            }

            const limitResult = optionalInteger(args?.limit, 'limit', { minimum: 1, maximum: 10 });
            if (isToolResponse(limitResult)) {
                return limitResult;
            }
            const limit = limitResult ?? 5;

            const url =
                `${RUNESCAPE_WIKI_API}?action=query&list=search&format=json` +
                `&srlimit=${limit}&srsearch=${encodeURIComponent(query)}`;
            const data = await makeApiRequest(url, signal);
            const hits = (data?.query?.search ?? []) as WikiSearchHit[];
            const results = hits.flatMap(hit => {
                if (typeof hit.title !== 'string' || hit.title.length === 0) {
                    return [];
                }
                const snippet = typeof hit.snippet === 'string' ? plainSnippet(hit.snippet) : '';
                return [{ title: hit.title, snippet, url: wikiPageUrl(hit.title) }];
            });

            return createSuccessResponse(`Wiki search for "${query}"`, { results });
        }

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
            const data = await makeApiRequest(url, signal);
            const pages = (data?.query?.pages ?? {}) as Record<string, WikiPage>;
            const firstPage = Object.values(pages)[0];

            if (!firstPage || firstPage.missing !== undefined) {
                return validationError(
                    `Wiki page "${page}" was not found. Try search_wiki or a different title.`
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
