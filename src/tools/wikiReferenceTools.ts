import type { Tool } from '@modelcontextprotocol/server';
import { RUNESCAPE_WIKI_API } from '../constants.js';
import { JSON_SCHEMA_2020_12, READ_ONLY_TOOL } from '../mcpSchemas.js';
import type { ToolArguments, ToolResponse } from '../types.js';
import { ApiRequestError, createSuccessResponse, makeApiRequest } from '../utils.js';
import { isToolResponse, optionalInteger, rejectUnknownKeys, requireString, validationError } from '../validation.js';

const nullableCount = { type: ['integer', 'null'], minimum: 0 };
const titleProperty = { type: 'string', minLength: 1, maxLength: 255 };
const limitProperty = { type: 'integer', minimum: 1, maximum: 50, default: 20, description: 'Maximum rows in this response' };
const rarityLabels = ['Always', 'Common', 'Uncommon', 'Rare', 'Very rare', 'Extremely rare', 'Varies', 'Unknown'];
export const wikiReferenceTools: Tool[] = [{
    name: 'list_wiki_category_members', title: 'List Wiki Category Members',
    description: 'List direct articles, subcategories and files in an RS3 Wiki category. Use search_wiki to discover category titles; get_all_categories lists GE groups instead.\n\ncategory is a literal Category: title, not a GE number. limit bounds this page of members, not recursion depth. Supply nextCursor unchanged with the same category to continue. You may change limit between pages, but changing categories invalidates the cursor. There is no recursive expansion or snapshot lock, so edits can affect later pages.\n\nAn empty set can mean an empty or missing category. Results contain metadata links, never article bodies or images. Reads are uncached and need no credentials. HTTP defaults to 60 requests/IP/minute; honor 429 Retry-After.',
    inputSchema: { $schema: JSON_SCHEMA_2020_12, type: 'object', properties: {
        category: { ...titleProperty, description: 'Wiki category title including Category:, e.g. Category:Weapons' },
        limit: limitProperty,
        cursor: { type: 'string', minLength: 1, maxLength: 4096, description: 'Opaque nextCursor from this category; omit for its first page' },
    }, required: ['category'], additionalProperties: false },
    outputSchema: { type: 'object', properties: {
        category: { type: 'string' }, sourceUrl: { type: 'string', format: 'uri' }, fetchedAt: { type: 'string', format: 'date-time' },
        contentStatus: { const: 'link_only' },
        members: { type: 'array', items: { type: 'object', properties: {
            pageId: { type: 'integer', minimum: 1 }, namespace: { type: 'integer', minimum: 0 },
            title: { type: 'string' }, url: { type: 'string', format: 'uri' },
        }, required: ['pageId', 'namespace', 'title', 'url'], additionalProperties: false } },
        nextCursor: { type: ['string', 'null'] }, skippedRows: { type: 'integer', minimum: 0 },
    }, required: ['category', 'sourceUrl', 'fetchedAt', 'contentStatus', 'members', 'nextCursor', 'skippedRows'], additionalProperties: false },
    ...READ_ONLY_TOOL,
}, {
    name: 'get_wiki_drop_table', title: 'Get Indexed Wiki Drop Facts',
    description: "Read indexed RS3 drop items, quantities and listed rarities. Use get_wiki_entity_facts for combat stats or lookup_item for GE identities.\n\n- page resolves redirects; put #variant only in variant. A supplied variant must match a returned sourceReference; omission includes all variants.\n- offset counts source rows from zero, including malformed rows that are skipped. Follow nextOffset even after a short usable result. limit bounds rows, not kills/rolls; edits or tied names can shift boundaries.\n- Missing/non-article sources error; unindexed articles yield empty rows. Unknown facts stay null.\n- Listed probabilities are per row. Rolls and omitted conditions can change actual chances; consult the returned source link when hasOmittedAnnotations is true.\n\nEach call reads article identity and the dropsline index without returning article prose/images. Uncached reads may lag and require no credentials. HTTP defaults to 60 requests/IP/minute; honor 429 Retry-After.",
    inputSchema: { $schema: JSON_SCHEMA_2020_12, type: 'object', properties: {
        page: { ...titleProperty, description: 'Literal source article title, e.g. Abyssal demon; not an item ID or URL' },
        variant: { type: 'string', minLength: 1, maxLength: 512, description: 'Exact sourceReference for one variant of the resolved article' },
        limit: limitProperty,
        offset: { type: 'integer', minimum: 0, maximum: 10000, default: 0, description: 'nextOffset from a prior result; omit to start' },
    }, required: ['page'], additionalProperties: false },
    outputSchema: { type: 'object', properties: {
        page: { type: 'string' }, sourceUrl: { type: 'string', format: 'uri' }, fetchedAt: { type: 'string', format: 'date-time' },
        nextOffset: { ...nullableCount, description: 'Continue with this offset; null means the index page ended or the 10000 offset bound was reached' },
        skippedRows: { type: 'integer', minimum: 0 },
        rows: { type: 'array', items: { type: 'object', properties: {
            sourceReference: { type: 'string' }, itemTitle: { type: 'string' }, itemUrl: { type: 'string', format: 'uri' },
            quantityMinimum: nullableCount, quantityMaximum: nullableCount, rolls: { type: ['integer', 'null'], minimum: 1 },
            rarityLabel: { type: ['string', 'null'], enum: [...rarityLabels, null] },
            listedProbability: { type: ['number', 'null'], minimum: 0, maximum: 1 },
            approximate: { type: ['boolean', 'null'] }, rareDropTable: { type: ['boolean', 'null'] },
            hasOmittedAnnotations: { type: 'boolean' },
        }, required: ['sourceReference', 'itemTitle', 'itemUrl', 'quantityMinimum', 'quantityMaximum', 'rolls', 'rarityLabel', 'listedProbability', 'approximate', 'rareDropTable', 'hasOmittedAnnotations'], additionalProperties: false } },
    }, required: ['page', 'sourceUrl', 'fetchedAt', 'rows', 'nextOffset', 'skippedRows'], additionalProperties: false },
    ...READ_ONLY_TOOL,
}];

function object(value: unknown): value is Record<string, any> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function safeTitle(value: unknown, max = 512): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f<>|]/.test(value);
}
function wikiUrl(title: string): string {
    const [page, ...fragment] = title.split('#');
    return 'https://runescape.wiki/w/' + encodeURIComponent(page.replace(/ /g, '_')) +
        (fragment.length ? '#' + encodeURIComponent(fragment.join('#').replace(/ /g, '_')) : '');
}
function inputTitle(value: unknown, label: string): string | ToolResponse {
    const title = requireString(value, label, { minLength: 1, maxLength: 255 });
    if (isToolResponse(title)) return title;
    if (!safeTitle(title, 255) || /^https?:\/\//i.test(title) || title.includes('#')) return validationError(`${label} must be a literal Wiki title, without a URL, #fragment or |separator`);
    return title;
}
async function wikiRead(params: Record<string, string>) {
    const data = await makeApiRequest(RUNESCAPE_WIKI_API + '?' + new URLSearchParams({ ...params, format: 'json', formatversion: '2' }));
    if (data?.error?.code === 'ratelimited') throw new ApiRequestError(429, 'Wiki reference rate limit; honor Retry-After');
    if (data?.error) throw new Error(`Wiki reference API rejected the request (${typeof data.error.code === 'string' ? data.error.code : 'invalid-index-query'})`);
    return data;
}
function continuation(value: unknown): value is { cmcontinue: string; continue: string } {
    return object(value) && Object.keys(value).sort().join(',') === 'cmcontinue,continue' &&
        ['cmcontinue', 'continue'].every(key => typeof value[key] === 'string' && value[key].length > 0 && value[key].length <= 2048 && !/[\u0000-\u001f]/.test(value[key]));
}
function readCursor(value: unknown, category: string): { cmcontinue: string; continue: string } | ToolResponse {
    if (typeof value !== 'string' || value.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(value)) return validationError('cursor must be an unchanged nextCursor');
    try {
        const decoded = Buffer.from(value, 'base64url');
        if (decoded.toString('base64url') !== value) throw new Error();
        const data = JSON.parse(decoded.toString('utf8'));
        if (!object(data) || Object.keys(data).sort().join(',') !== 'category,continuation' || data.category !== category || !continuation(data.continuation)) throw new Error();
        return data.continuation;
    } catch { return validationError('cursor does not belong to this category or is malformed; start without cursor'); }
}
function luaLiteral(value: string): string {
    let equals = '';
    while (value.includes(`]${equals}]`)) equals += '=';
    return `[${equals}[${value}]${equals}]`;
}
function count(value: unknown, minimum = 0): number | null {
    const normalized = typeof value === 'string' && /^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(value) ? Number(value.replace(/,/g, '')) : value;
    return typeof normalized === 'number' && Number.isSafeInteger(normalized) && normalized >= minimum ? normalized : null;
}
function rarity(value: unknown): { rarityLabel: string | null; listedProbability: number | null } {
    if (typeof value !== 'string') return { rarityLabel: null, listedProbability: null };
    const label = rarityLabels.find(label => label.toLowerCase() === value.trim().toLowerCase());
    if (label) return { rarityLabel: label, listedProbability: label === 'Always' ? 1 : null };
    const parts = value.trim().split('/');
    const numerator = parts.length === 2 ? count(parts[0]) : null;
    const denominator = parts.length === 2 ? count(parts[1], 1) : null;
    return { rarityLabel: null, listedProbability: numerator !== null && denominator !== null && numerator <= denominator ? numerator / denominator : null };
}
function nonempty(value: unknown): boolean {
    if (value === undefined || value === null || value === '' || value === false) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (object(value)) return Object.keys(value).length > 0;
    return true;
}

export async function handleWikiReferenceTool(name: string, args: ToolArguments): Promise<ToolResponse> {
    if (name === 'list_wiki_category_members') {
        const extra = rejectUnknownKeys(args, ['category', 'limit', 'cursor']); if (extra) return extra;
        const supplied = inputTitle(args.category, 'category'); if (isToolResponse(supplied)) return supplied;
        if (!/^Category:/i.test(supplied) || !supplied.slice(9).trim()) return validationError('category must include the Category: prefix; GE category numbers are not Wiki categories');
        const category = 'Category:' + supplied.slice(9).trim().replace(/_/g, ' ');
        const limit = optionalInteger(args.limit, 'limit', { minimum: 1, maximum: 50 }); if (isToolResponse(limit)) return limit;
        const next = args.cursor === undefined ? undefined : readCursor(args.cursor, category); if (isToolResponse(next)) return next;
        const data = await wikiRead({ action: 'query', list: 'categorymembers', cmtitle: category, cmlimit: String(limit ?? 20), ...next });
        if (!Array.isArray(data?.query?.categorymembers)) throw new Error('Wiki category API returned an invalid member list');
        const raw = data.query.categorymembers;
        const members = raw.flatMap((row: unknown) => object(row) && count(row.pageid, 1) !== null && count(row.ns) !== null && safeTitle(row.title, 255)
            ? [{ pageId: Number(row.pageid), namespace: Number(row.ns), title: row.title, url: wikiUrl(row.title) }] : []);
        if (raw.length && !members.length) throw new Error('Wiki category API returned no usable metadata');
        if (data.continue !== undefined && !continuation(data.continue)) throw new Error('Wiki category API returned invalid continuation');
        const cursor = data.continue ? Buffer.from(JSON.stringify({ category, continuation: data.continue })).toString('base64url') : null;
        if (cursor !== null && cursor.length > 4096) throw new Error('Wiki category continuation exceeds cursor bounds');
        return createSuccessResponse('Wiki category members', { category, sourceUrl: wikiUrl(category), fetchedAt: new Date().toISOString(), contentStatus: 'link_only', members,
            nextCursor: cursor,
            skippedRows: raw.length - members.length });
    }
    if (name !== 'get_wiki_drop_table') throw new Error(`Unknown Wiki reference tool: ${name}`);
    const extra = rejectUnknownKeys(args, ['page', 'variant', 'limit', 'offset']); if (extra) return extra;
    const page = inputTitle(args.page, 'page'); if (isToolResponse(page)) return page;
    const limit = optionalInteger(args.limit, 'limit', { minimum: 1, maximum: 50 }); if (isToolResponse(limit)) return limit;
    const offset = optionalInteger(args.offset, 'offset', { minimum: 0, maximum: 10000 }); if (isToolResponse(offset)) return offset;
    if (args.variant !== undefined && (!safeTitle(args.variant) || /^https?:\/\//i.test(args.variant))) return validationError('variant must be an exact sourceReference');
    const info = await wikiRead({ action: 'query', prop: 'info', titles: page, redirects: '1' });
    const canonical = info?.query?.pages?.[0];
    if (!canonical || canonical.missing || canonical.invalid || canonical.ns !== 0 || !safeTitle(canonical.title, 255)) return validationError('page must resolve to an existing main-namespace article');
    const title: string = canonical.title;
    const variant = args.variant as string | undefined;
    if (variant !== undefined && variant !== title && !variant.startsWith(title + '#')) return validationError('variant must belong to the resolved page; use sourceReference from its results');
    const max = limit ?? 20, start = offset ?? 0;
    const query = "bucket('dropsline').select('page_name_sub','item_name','drop_json','rare_drop_table')" +
        `.where('page_name',${luaLiteral(title)})` + (variant === undefined ? '' : `.where('page_name_sub',${luaLiteral(variant)})`) +
        ".orderBy('item_name','asc')" + `.limit(${max + 1}).offset(${start}).run()`;
    const data = await wikiRead({ action: 'bucket', query });
    if (!Array.isArray(data?.bucket)) throw new Error('Wiki drop API returned an invalid index');
    const pageRows = data.bucket.slice(0, max);
    const rows = pageRows.flatMap((row: unknown) => {
        if (!object(row) || !safeTitle(row.page_name_sub) || (row.page_name_sub !== title && !row.page_name_sub.startsWith(title + '#')) ||
            (variant !== undefined && row.page_name_sub !== variant) || !safeTitle(row.item_name)) return [];
        let facts: unknown;
        try { facts = typeof row.drop_json === 'string' ? JSON.parse(row.drop_json) : row.drop_json; } catch { return []; }
        if (!object(facts)) return [];
        let low = count(facts['Quantity Low']), high = count(facts['Quantity High']);
        if (low !== null && high !== null && low > high) low = high = null;
        return [{ sourceReference: row.page_name_sub, itemTitle: row.item_name, itemUrl: wikiUrl(row.item_name),
            quantityMinimum: low, quantityMaximum: high, rolls: count(facts.Rolls, 1), ...rarity(facts.Rarity),
            approximate: typeof facts.Approx === 'boolean' ? facts.Approx : null,
            rareDropTable: typeof row.rare_drop_table === 'boolean' ? row.rare_drop_table : null,
            hasOmittedAnnotations: ['Name Notes', 'Name NotesP', 'Rarity Notes', 'Quantity Notes', 'Alt Rarities', 'Alt Rarity', 'Alt Rarity Dash'].some(key => nonempty(facts[key])),
        }];
    });
    if (pageRows.length && !rows.length) throw new Error('Wiki drop API returned no usable indexed facts');
    return createSuccessResponse('Indexed Wiki drop facts', { page: title, sourceUrl: wikiUrl(title), fetchedAt: new Date().toISOString(), rows,
        nextOffset: data.bucket.length > max && start + max <= 10000 ? start + max : null, skippedRows: pageRows.length - rows.length });
}
