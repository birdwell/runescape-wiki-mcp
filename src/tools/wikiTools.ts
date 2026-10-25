// Wiki tools for RuneScape Wiki MCP Server

import type { Tool } from '@modelcontextprotocol/server';
import { createHash } from 'node:crypto';
import { RUNESCAPE_WIKI_API, WIKI_LICENSING_URL } from '../constants.js';
import { findWikiContentReview, type WikiContentReview } from '../wikiContentPolicy.js';
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

const attributionSchema = {
    type: 'object' as const,
    properties: {
        author: { type: 'string' as const },
        sourceUrl: { type: 'string' as const },
        historyUrl: { type: 'string' as const },
        termsUrl: { type: 'string' as const },
        changes: { type: 'string' as const },
        copyrightNotices: { type: 'array' as const, items: { type: 'string' as const } },
        license: { anyOf: [
            { type: 'null' as const },
            { type: 'object' as const, properties: {
                name: { type: 'string' as const }, url: { type: 'string' as const },
            }, required: ['name', 'url'], additionalProperties: false },
        ] },
    },
    required: ['author', 'sourceUrl', 'historyUrl', 'termsUrl', 'changes', 'copyrightNotices', 'license'],
    additionalProperties: false,
};

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
                    snippet: { type: 'string' as const, description: 'Empty: search returns references without copying unreviewed text' },
                    url: { type: 'string' as const, description: 'RuneScape Wiki page URL' },
                    contentStatus: { const: 'link_only' },
                    attribution: attributionSchema,
                },
                required: ['title', 'snippet', 'url', 'contentStatus', 'attribution'],
                additionalProperties: false,
            },
        },
    },
    required: ['results'],
    additionalProperties: false,
};

const wikiPageOutputSchema = {
    $schema: JSON_SCHEMA_2020_12,
    type: 'object' as const,
    properties: {
        title: { type: 'string' as const }, url: { type: 'string' as const },
        revisionId: { anyOf: [{ type: 'integer' as const }, { type: 'null' as const }] },
        contentStatus: { enum: ['link_only', 'reviewed_extract'] },
        text: { anyOf: [{ type: 'string' as const }, { type: 'null' as const }] },
        reason: { type: 'string' as const },
        attribution: attributionSchema,
    },
    required: ['title', 'url', 'revisionId', 'contentStatus', 'text', 'reason', 'attribution'],
    additionalProperties: false,
};

export const wikiTools: Tool[] = [
    {
        name: 'search_wiki',
        title: 'Search Wiki',
        description:
            "Discover RS3 Wiki article titles and source links when the exact title is unknown. Pass a result title to get_wiki_page_content for revision and reuse status; use lookup_item for item IDs or get_item_price for guide prices.\n" +
            "- query is search text, not a URL: \"abyssal whip special attack\" finds related articles. limit selects the top 1-10 matches, default 5; increasing it widens the first result set. There is no continuation cursor, so refine query for other matches.\n" +
            "- Only article namespace 0 is searched. snippets are empty and contentStatus is link_only; no hits returns an empty array, upstream failures a tool error.\n" +
            "- No auth or local cache. HTTP shares a default 60 requests/IP/minute budget; honor Retry-After on 429.",
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
            "Inspect one RS3 Wiki page by known title, resolving redirects to its canonical title and revision. Use search_wiki for unknown titles or get_item_price for guide prices.\n" +
            "- Pass page \"Abyssal whip\" as a literal title, not a URL or encoded string; the server encodes it. One page per call; no section selector or pagination.\n" +
            "- A reviewed article revision with a matching extract hash returns whole reviewed_extract text and attribution. Otherwise success is link_only with text null, reason and source URL. Explain that article text was not returned; never infer a summary from the title. No argument overrides review. Missing pages return a tool error.\n" +
            "- No auth, wiki edits or local cache. HTTP shares a default 60 requests/IP/minute budget; honor Retry-After on 429.",
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
        outputSchema: wikiPageOutputSchema,
        ...READ_ONLY_TOOL,
    },
];

interface WikiPage {
    pageid?: number;
    title?: string;
    missing?: boolean | string;
    extract?: string;
    ns?: number;
    revisions?: Array<{ revid?: number }>;
}

interface WikiSearchHit {
    title?: string;
    snippet?: string;
}

function wikiPageUrl(title: string): string {
    return `https://runescape.wiki/w/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

function wikiAttribution(title: string, review?: WikiContentReview) {
    const url = wikiPageUrl(title);
    return {
        author: 'RuneScape Wiki contributors', sourceUrl: review ? `${url}?oldid=${review.revisionId}` : url,
        historyUrl: `${url}?action=history`, termsUrl: WIKI_LICENSING_URL,
        license: review ? { name: review.licenseName, url: review.licenseUrl } : null,
        copyrightNotices: review ? [...review.copyrightNotices] : [],
        changes: review ? 'Reviewed plain-text extract; formatting omitted and surrounding whitespace trimmed.'
            : 'Reference only; no article text reproduced. Content reuse terms have not been verified.',
    };
}

function linkOnlyPage(title: string, revisionId: number | undefined, reason: string) {
    return createSuccessResponse(`Wiki Page: ${title}`, {
        title, url: wikiPageUrl(title), revisionId: revisionId ?? null,
        contentStatus: 'link_only', text: null, reason, attribution: wikiAttribution(title),
    });
}

export async function handleWikiTool(name: string, args: ToolArguments): Promise<ToolResponse> {
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
                `&srnamespace=0&srprop=&srlimit=${limit}&srsearch=${encodeURIComponent(query)}`;
            const data = await makeApiRequest(url);
            const hits = (data?.query?.search ?? []) as WikiSearchHit[];
            const results = hits.flatMap(hit => {
                if (typeof hit.title !== 'string' || hit.title.length === 0) {
                    return [];
                }
                return [{ title: hit.title, snippet: '', url: wikiPageUrl(hit.title),
                    contentStatus: 'link_only', attribution: wikiAttribution(hit.title) }];
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
                `${RUNESCAPE_WIKI_API}?action=query&prop=info%7Crevisions&rvprop=ids&format=json` +
                `&redirects=1&titles=${encodeURIComponent(page)}`;
            const data = await makeApiRequest(url);
            const pages = (data?.query?.pages ?? {}) as Record<string, WikiPage>;
            const firstPage = Object.values(pages)[0];

            if (!firstPage || firstPage.missing !== undefined) {
                return validationError(
                    `Wiki page "${page}" was not found. Try search_wiki or a different title.`
                );
            }

            const resolvedTitle = firstPage.title ?? page;
            const candidateRevision = firstPage.revisions?.[0]?.revid;
            const revisionId = typeof candidateRevision === 'number' && Number.isSafeInteger(candidateRevision) &&
                candidateRevision > 0 ? candidateRevision : undefined;
            const review = firstPage.ns === 0 ? findWikiContentReview(resolvedTitle, revisionId) : undefined;
            if (!review) {
                return linkOnlyPage(resolvedTitle, revisionId, 'No content-specific review for this namespace and revision.');
            }

            const reviewedData = await makeApiRequest(
                `${RUNESCAPE_WIKI_API}?action=query&prop=extracts%7Crevisions&rvprop=ids&format=json` +
                `&explaintext=1&redirects=1&titles=${encodeURIComponent(resolvedTitle)}`);
            const current = Object.values(reviewedData?.query?.pages ?? {})[0] as WikiPage | undefined;
            const extract = typeof current?.extract === 'string' ? current.extract : '';
            if (!current || current.missing !== undefined || current.title !== resolvedTitle || current.ns !== 0 ||
                current.revisions?.[0]?.revid !== review.revisionId || !extract.trim() ||
                createHash('sha256').update(extract).digest('hex') !== review.extractSha256) {
                return linkOnlyPage(resolvedTitle, revisionId, 'Content changed or no longer matches the reviewed extract.');
            }
            return createSuccessResponse(`Wiki Page: ${resolvedTitle}`, {
                title: resolvedTitle, url: wikiPageUrl(resolvedTitle), revisionId: review.revisionId,
                contentStatus: 'reviewed_extract', text: extract.trim(), reason: '',
                attribution: wikiAttribution(resolvedTitle, review),
            });
        }

        default:
            throw new Error(`Unknown wiki tool: ${name}`);
    }
}
