import type { Tool } from '@modelcontextprotocol/server';
import { RUNESCAPE_WIKI_API } from '../constants.js';
import { JSON_SCHEMA_2020_12, READ_ONLY_TOOL } from '../mcpSchemas.js';
import { ApiRequestError, createSuccessResponse, makeApiRequest } from '../utils.js';
import { isToolResponse, optionalInteger, rejectUnknownKeys, requireString, validationError } from '../validation.js';
import type { ToolArguments, ToolResponse } from '../types.js';

const numeric = {
    combat_level: 'combatLevel', life_points: 'lifePoints', slayer_level: 'slayerLevel',
    slayer_experience: 'slayerExperience', attack_level: 'attackLevel', defence_level: 'defenceLevel',
    magic_level: 'magicLevel', ranged_level: 'rangedLevel', melee_max_hit: 'meleeMaxHit',
    magic_max_hit: 'magicMaxHit', ranged_max_hit: 'rangedMaxHit', armour: 'armour',
} as const;
const difficulties = ['Novice', 'Intermediate', 'Experienced', 'Master', 'Grandmaster', 'Special'];
const questTypes = ['quest', 'miniquest', 'subquest', 'saga'];
const common = ['page_name_sub', 'id', 'is_members_only'];
const fields = {
    monster: [...common, ...Object.keys(numeric)],
    quest: [...common, 'official_difficulty', 'quest_type', 'release_date'],
};
export const entityTools: Tool[] = [{
    name: 'get_wiki_entity_facts', title: 'Get Structured Monster and Quest Facts',
    description: "Read RS3 monster combat stats or quest metadata. Use search_wiki for titles, get_wiki_page_content for reviewed text/links, or get_item_price for GE records.\n\nPass page as a literal title with spaces; the server URL-encodes it. Only main articles qualify. URLs, #variants, |separators and Category: titles are rejected. kind=quest includes miniquests, subquests and sagas; a mismatched dataset errors.\n\nlimit expands a prefix, not a page: raising 5 to 10 repeats the first five variants before adding more. Choose variants by their returned references. Truncation requires a larger limit or visiting the returned source link; there is no cursor.\n\nMissing fields are omitted, not zero-filled. Article prose/images are excluded. The uncached index may lag. No credentials required; HTTP defaults to 60 requests/IP/minute. Honor 429 Retry-After.",
    inputSchema: { $schema: JSON_SCHEMA_2020_12, type: 'object', properties: {
        page: { type: 'string', minLength: 1, maxLength: 255, description: "Wiki page title, e.g. Abyssal demon or Cook's Assistant; redirects are resolved" },
        kind: { type: 'string', enum: ['monster', 'quest'], description: 'Structured dataset: combat monster statistics or quest metadata' },
        limit: { type: 'integer', minimum: 1, maximum: 10, default: 5, description: 'Maximum variant records from the selected page (default 5)' },
    }, required: ['page', 'kind'], additionalProperties: false },
    outputSchema: { $schema: JSON_SCHEMA_2020_12, type: 'object', properties: {
        page: { type: 'string', description: 'Canonical Wiki page title' },
        kind: { type: 'string', enum: ['monster', 'quest'] },
        sourceUrl: { type: 'string', format: 'uri' }, fetchedAt: { type: 'string', format: 'date-time' },
        truncated: { type: 'boolean', description: 'Additional indexed variants exceeded the requested limit' },
        records: { type: 'array', items: { type: 'object', properties: {
            reference: { type: 'string', description: 'Indexed page/variant identifier, not article text' },
            ids: { type: 'array', items: { type: 'integer', minimum: 0 }, description: 'Wiki-indexed entity IDs, not GE item IDs' },
            isMembers: { type: 'boolean' },
            stats: { type: 'object', properties: Object.fromEntries(Object.values(numeric).map(key => [key, { type: 'number', minimum: 0 }])), additionalProperties: false },
            difficulty: { type: 'string', enum: difficulties }, questType: { type: 'string', enum: questTypes },
            releaseDate: { type: 'string', format: 'date' },
        }, required: ['reference'], additionalProperties: false } },
        attribution: { type: 'object', properties: { author: { type: 'string' }, sourceUrl: { type: 'string', format: 'uri' },
            historyUrl: { type: 'string', format: 'uri' }, license: { type: 'null', description: 'No article-content license or review is inferred for these index facts' } },
            required: ['author', 'sourceUrl', 'historyUrl', 'license'], additionalProperties: false },
    }, required: ['page', 'kind', 'sourceUrl', 'fetchedAt', 'truncated', 'records', 'attribution'], additionalProperties: false },
    ...READ_ONLY_TOOL,
}];
function object(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function checkApi(data: any) {
    if (!data?.error) return;
    if (data.error?.code === 'ratelimited') throw new ApiRequestError(429, 'Wiki entity rate limit');
    throw new Error('Wiki entity API rejected the request');
}
// A data-only Lua literal; a title can never close its chosen delimiter.
function luaLiteral(value: string): string {
    let equals = '';
    while (value.includes(`]${equals}]`)) equals += '=';
    return `[${equals}[${value}]${equals}]`;
}
function releaseDate(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    let iso = value;
    const match = /^(\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})$/.exec(value);
    if (match) {
        const month = ['January','February','March','April','May','June','July','August','September','October','November','December'].indexOf(match[2]) + 1;
        iso = `${match[3]}-${String(month).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
    const time = Date.parse(`${iso}T00:00:00Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === iso ? iso : undefined;
}
export async function handleEntityTool(name: string, args: ToolArguments): Promise<ToolResponse> {
    if (name !== 'get_wiki_entity_facts') throw new Error(`Unknown entity tool: ${name}`);
    const unexpected = rejectUnknownKeys(args, ['page', 'kind', 'limit']);
    if (unexpected) return unexpected;
    const page = requireString(args?.page, 'page', { minLength: 1, maxLength: 255 });
    if (isToolResponse(page)) return page;
    if (/^https?:\/\//i.test(page) || /[#|]/.test(page)) return validationError('page must be a Wiki title without a URL, #fragment or |separator');
    const kind = args?.kind;
    if (kind !== 'monster' && kind !== 'quest') return validationError('kind must be monster or quest');
    const requested = optionalInteger(args?.limit, 'limit', { minimum: 1, maximum: 10 });
    if (isToolResponse(requested)) return requested;
    const limit = requested ?? 5;
    const info = await makeApiRequest(`${RUNESCAPE_WIKI_API}?${new URLSearchParams({ action: 'query', titles: page,
        prop: 'info', redirects: '1', format: 'json', formatversion: '2' })}`);
    checkApi(info);
    const canonical = info?.query?.pages?.[0];
    if (!canonical || canonical.missing || canonical.invalid || typeof canonical.title !== 'string') return validationError('Wiki page not found or invalid');
    if (canonical.ns !== 0) return validationError('Entity facts require a main-namespace article');
    const title = canonical.title;
    const query = `bucket('infobox_${kind}').select(${fields[kind].map(field => JSON.stringify(field)).join(',')})` +
        `.where('page_name',${luaLiteral(title)}).orderBy('page_name_sub','asc').limit(${limit + 1}).run()`;
    const data = await makeApiRequest(`${RUNESCAPE_WIKI_API}?${new URLSearchParams({ action: 'bucket', query,
        format: 'json', formatversion: '2' })}`);
    checkApi(data);
    if (!Array.isArray(data?.bucket)) throw new Error('Wiki entity API returned an invalid dataset');
    const records = data.bucket.flatMap((row: unknown) => {
        if (!object(row) || typeof row.page_name_sub !== 'string' || row.page_name_sub.length > 512 || /[\u0000-\u001f<>]/.test(row.page_name_sub) ||
            (row.page_name_sub !== title && !row.page_name_sub.startsWith(title + '#'))) return [];
        const record: Record<string, unknown> = { reference: row.page_name_sub };
        const ids = (Array.isArray(row.id) ? row.id : [row.id]).filter(id => typeof id === 'number' && Number.isSafeInteger(id) && id >= 0);
        if (ids.length) record.ids = [...new Set(ids)];
        if (typeof row.is_members_only === 'boolean') record.isMembers = row.is_members_only;
        if (kind === 'monster') {
            const stats: Record<string, number> = {};
            for (const [source, target] of Object.entries(numeric)) {
                const value = row[source];
                if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER) stats[target] = value;
            }
            if (Object.keys(stats).length) record.stats = stats;
        } else {
            if (typeof row.official_difficulty === 'string' && difficulties.includes(row.official_difficulty)) record.difficulty = row.official_difficulty;
            if (typeof row.quest_type === 'string' && questTypes.includes(row.quest_type)) record.questType = row.quest_type;
            const date = releaseDate(row.release_date);
            if (date) record.releaseDate = date;
        }
        return Object.keys(record).length > 1 ? [record] : [];
    });
    if (!records.length) return validationError(`No ${kind} facts indexed for ${title}; choose a matching title with search_wiki`);
    const sourceUrl = `https://runescape.wiki/w/${encodeURIComponent(title.replace(/ /g, '_'))}`;
    return createSuccessResponse(`${kind} facts for ${title}`, { page: title, kind, sourceUrl,
        fetchedAt: new Date().toISOString(), truncated: data.bucket.length > limit, records: records.slice(0, limit),
        attribution: { author: 'RuneScape Wiki contributors', sourceUrl, historyUrl: sourceUrl + '?action=history', license: null } });
}
