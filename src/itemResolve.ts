// Resolve RS3 item names to Grand Exchange IDs via Weirdgloop + wiki opensearch

import {
    RUNESCAPE_WIKI_API,
    WEIRDGLOOP_EXCHANGE_API,
} from './constants.js';
import { makeApiRequest } from './utils.js';
import { ItemLookupMatch, ToolArguments, ToolResponse } from './types.js';
import {
    isToolResponse,
    rejectUnknownKeys,
    requireInteger,
    requireString,
    validationError,
} from './validation.js';

interface WeirdgloopEntry {
    id: string;
    price?: number;
    volume?: number;
    timestamp?: string;
}

function wikiUrlForTitle(title: string): string {
    return `https://runescape.wiki/w/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

function parseWeirdgloopPayload(data: unknown): ItemLookupMatch[] {
    if (!data || typeof data !== 'object') {
        return [];
    }
    const record = data as Record<string, unknown>;
    if (record.success === false) {
        return [];
    }

    const matches: ItemLookupMatch[] = [];
    for (const [name, value] of Object.entries(record)) {
        if (!value || typeof value !== 'object') {
            continue;
        }
        const entry = value as WeirdgloopEntry;
        const id = Number.parseInt(String(entry.id), 10);
        if (!Number.isFinite(id)) {
            continue;
        }
        matches.push({
            id,
            name,
            price: typeof entry.price === 'number' ? entry.price : undefined,
            volume: typeof entry.volume === 'number' ? entry.volume : undefined,
            timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : undefined,
            wikiUrl: wikiUrlForTitle(name),
        });
    }
    return matches;
}

export async function lookupByNameExact(name: string): Promise<ItemLookupMatch[]> {
    const url = `${WEIRDGLOOP_EXCHANGE_API}/latest?name=${encodeURIComponent(name)}`;
    try {
        const data = await makeApiRequest(url);
        return parseWeirdgloopPayload(data);
    } catch {
        return [];
    }
}

export async function lookupByItemId(itemId: number): Promise<ItemLookupMatch[]> {
    const url = `${WEIRDGLOOP_EXCHANGE_API}/latest?id=${itemId}`;
    try {
        const data = await makeApiRequest(url);
        return parseWeirdgloopPayload(data);
    } catch {
        return [];
    }
}

async function opensearchTitles(query: string, limit: number): Promise<string[]> {
    const url =
        `${RUNESCAPE_WIKI_API}?action=opensearch` +
        `&search=${encodeURIComponent(query)}` +
        `&limit=${limit}&format=json`;
    const data = await makeApiRequest(url);
    if (!Array.isArray(data) || !Array.isArray(data[1])) {
        return [];
    }
    return data[1].filter((title): title is string => typeof title === 'string');
}

export async function lookupItems(query: string, limit = 5): Promise<ItemLookupMatch[]> {
    const exact = await lookupByNameExact(query);
    if (exact.length > 0) {
        return exact.slice(0, limit);
    }

    const titles = await opensearchTitles(query, limit);
    const matches: ItemLookupMatch[] = [];
    for (const title of titles) {
        const found = await lookupByNameExact(title);
        if (found.length > 0) {
            matches.push(...found);
        } else {
            matches.push({
                name: title,
                id: -1,
                wikiUrl: wikiUrlForTitle(title),
            });
        }
        if (matches.length >= limit) {
            break;
        }
    }

    return matches
        .filter(match => match.id >= 0)
        .slice(0, limit);
}

/**
 * Resolve an itemId from tool args that accept either `itemId` or `name`.
 */
export async function resolveItemId(
    args: ToolArguments | undefined,
    allowedKeys: readonly string[]
): Promise<number | ToolResponse> {
    const unexpected = rejectUnknownKeys(args, allowedKeys);
    if (unexpected) {
        return unexpected;
    }

    const hasItemId = args?.itemId !== undefined && args?.itemId !== null;
    const hasName = args?.name !== undefined && args?.name !== null && args?.name !== '';

    if (hasItemId && hasName) {
        return validationError('Provide either itemId or name, not both');
    }
    if (!hasItemId && !hasName) {
        return validationError('Either itemId or name is required');
    }

    if (hasItemId) {
        return requireInteger(args?.itemId, 'itemId', { minimum: 0 });
    }

    const name = requireString(args?.name, 'name', { minLength: 1 });
    if (isToolResponse(name)) {
        return name;
    }

    const matches = await lookupItems(name, 5);
    if (matches.length === 0) {
        return validationError(
            `No Grand Exchange item found for "${name}". Try lookup_item for wiki suggestions.`
        );
    }
    if (matches.length > 1) {
        const options = matches
            .map(m => `${m.name} (id ${m.id})`)
            .join(', ');
        return validationError(
            `Multiple items matched "${name}": ${options}. Pass itemId for the exact item.`
        );
    }
    return matches[0].id;
}
