import { ITEM_CATEGORIES } from './categories.js';
import { RS3_GE_API } from './constants.js';
import { makeApiRequest } from './utils.js';

const DAY_MS = 86_400_000;
// RuneDate epoch: https://runescape.wiki/w/Runedate (27 February 2002, UTC).
const RUNEDATE_EPOCH = Date.UTC(2002, 1, 27);

export function enrichGeInfo(data: unknown, fetchedAt = new Date()) {
    const value = data && typeof data === 'object' && !Array.isArray(data)
        ? (data as Record<string, unknown>).lastConfigUpdateRuneday : undefined;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        throw new Error('Jagex returned an invalid catalogue configuration day');
    }
    const updatedAt = new Date(RUNEDATE_EPOCH + value * DAY_MS);
    if (!Number.isFinite(updatedAt.getTime()) || !Number.isFinite(fetchedAt.getTime())) {
        throw new Error('Catalogue configuration date is outside the supported date range');
    }
    const fetchDay = Date.UTC(fetchedAt.getUTCFullYear(), fetchedAt.getUTCMonth(), fetchedAt.getUTCDate());
    return {
        ...data as Record<string, unknown>,
        lastConfigUpdateRuneday: value,
        lastConfigUpdateDate: updatedAt.toISOString().slice(0, 10),
        configurationAgeDays: Math.floor((fetchDay - updatedAt.getTime()) / DAY_MS),
        fetchedAt: fetchedAt.toISOString(),
        categoryCount: ITEM_CATEGORIES.length,
        priceFreshness: 'not_reported' as const,
    };
}

export async function fetchGeInfo() {
    return enrichGeInfo(await makeApiRequest(`${RS3_GE_API}/info.json`));
}
