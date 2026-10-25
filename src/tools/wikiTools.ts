// Wiki tools for RuneScape Wiki MCP Server

import type { Tool } from '@modelcontextprotocol/server';
import { createHash } from 'node:crypto';
import { batchOutputSchema, MAX_BATCH_ITEMS, parseBatch, runBatch } from '../batch.js';
import { RUNESCAPE_WIKI_API, WIKI_LICENSING_URL } from '../constants.js';
import { findWikiContentReview, type WikiContentReview } from '../wikiContentPolicy.js';
import { JSON_SCHEMA_2020_12, READ_ONLY_TOOL } from '../mcpSchemas.js';
import { ToolArguments, ToolResponse } from '../types.js';
import { ApiRequestError, makeApiRequest, createSuccessResponse } from '../utils.js';
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

const wikiBatchOutput = batchOutputSchema({ type: 'string' }, wikiPageOutputSchema);

export const wikiTools: Tool[] = [
    {
        name: 'search_wiki',
        title: 'Search Wiki Articles',
        description:
            "Search RS3 Wiki articles and return matching titles and links. Use get_wiki_page_content for page content/references, lookup_item for GE IDs, or get_item_price for guide prices.\n" +
            "- query searches article text by default. Quotes group phrases: \"Abyssal whip\" \"special attack\" finds pages discussing both. intitle:\"Abyssal whip\" focuses title matches. Pass raw syntax; the server handles URL encoding.\n" +
            "- limit caps the first relevance-ranked set. It is not an offset, and no continuation cursor exists. Refine query to change the matches.\n" +
            "- Searches article namespace 0 and returns references without copied snippets. An empty results array means no matches; invalid queries and upstream failures return tool errors.\n" +
            "- No authentication is required, and results are not cached here. The shared HTTP budget defaults to 60 requests/IP/minute. On 429, wait for Retry-After.",
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
        title: 'Get Wiki Content or References',
        description:
            "Get reviewed Wiki article text, or a source reference when text is unavailable. Use search_wiki for titles; get_item_price for prices.\n" +
            "- page takes one unencoded title; pages takes 1-10, e.g. [\"Abyssal whip\"]. URLs, #fragments and |separators reject the call before fetching.\n" +
            "- For page, read the flat response. For pages, even one title, check results[i].error before reading results[i].data. Rows preserve order and duplicates; redirects resolve.\n" +
            "- The server sets output contentStatus: reviewed_extract includes approved, unchanged text and attribution; successful link_only has null text, url and reason. Inputs cannot approve content.\n" +
            "- In valid batches, missing-page/API errors are per row; the call fails only if all rows fail. At most two requests run concurrently; 429 stops queued work.\n" +
            "- No authentication is required and responses are not cached here. Shared HTTP budget: 60 requests/IP/minute. Honor Retry-After.",
        inputSchema: {
            $schema: JSON_SCHEMA_2020_12,
            type: 'object',
            properties: {
                page: {
                    type: 'string',
                    minLength: 1,
                    description: 'Wiki page title (spaces allowed; redirects are followed)',
                },
                pages: { type: 'array', minItems: 1, maxItems: MAX_BATCH_ITEMS,
                    items: { type: 'string', minLength: 1 },
                    description: 'Wiki titles for a reference batch; exclusive with page' },
            },
            oneOf: [{ required: ['page'] }, { required: ['pages'] }],
            additionalProperties: false,
        },
        outputSchema: { ...wikiPageOutputSchema,
            properties: { ...wikiPageOutputSchema.properties, ...wikiBatchOutput.properties },
            required: [], oneOf: [{ required: wikiPageOutputSchema.required }, { required: wikiBatchOutput.required }] },
        ...READ_ONLY_TOOL,
    },
];

interface WikiPage {
    pageid?: number;
    title?: string;
    missing?: boolean | string;
    invalid?: boolean | string;
    extract?: string;
    ns?: number;
    revisions?: Array<{ revid?: number }>;
}

interface WikiSearchHit {
    title?: string;
    snippet?: string;
}

function requireWikiTitle(value: unknown, label: string): string | ToolResponse {
    const title = requireString(value, label, { minLength: 1 });
    if (isToolResponse(title)) return title;
    if (/^https?:\/\//i.test(title) || /[#|]/.test(title)) {
        return validationError(`${label} must be a wiki title, without a URL, #fragment or |separator`);
    }
    return title;
}

function wikiApiFailure(data: { error?: { code?: string; info?: string } } | undefined): ToolResponse | undefined {
    if (!data?.error) return undefined;
    if (data.error.code === 'ratelimited') throw new ApiRequestError(429, 'Wiki rate limit');
    return validationError(`Wiki API error: ${data.error.info ?? data.error.code ?? 'Unknown error'}`);
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
            const apiFailure = wikiApiFailure(data);
            if (apiFailure) return apiFailure;
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
            const unexpected = rejectUnknownKeys(args, ['page', 'pages']);
            if (unexpected) {
                return unexpected;
            }

            if (args?.pages !== undefined) {
                if (args?.page !== undefined) return validationError('Provide page or pages, not both');
                const pages = parseBatch(args.pages, 'pages', (value, label) =>
                    requireWikiTitle(value, label));
                if (isToolResponse(pages)) return pages;
                return runBatch('Wiki page references', pages, page => handleWikiTool(name, { page }));
            }

            const page = requireWikiTitle(args?.page, 'page');
            if (isToolResponse(page)) {
                return page;
            }

            const url =
                `${RUNESCAPE_WIKI_API}?action=query&prop=info%7Crevisions&rvprop=ids&format=json` +
                `&redirects=1&titles=${encodeURIComponent(page)}`;
            const data = await makeApiRequest(url);
            const apiFailure = wikiApiFailure(data);
            if (apiFailure) return apiFailure;
            const pages = (data?.query?.pages ?? {}) as Record<string, WikiPage>;
            const firstPage = Object.values(pages)[0];

            if (!firstPage || firstPage.missing !== undefined || firstPage.invalid !== undefined) {
                return validationError(
                    `Wiki page "${page}" was not found or is invalid. Try search_wiki or a different title.`
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
            const extractFailure = wikiApiFailure(reviewedData);
            if (extractFailure) return extractFailure;
            const current = Object.values(reviewedData?.query?.pages ?? {})[0] as WikiPage | undefined;
            const extract = typeof current?.extract === 'string' ? current.extract : '';
            if (!current || current.missing !== undefined || current.invalid !== undefined || current.title !== resolvedTitle || current.ns !== 0 ||
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
