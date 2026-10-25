import { RS3_LIVE_PRICE_API } from './constants.js';
import { makeApiRequest } from './utils.js';

type Loader = (url: string) => Promise<unknown>;
type Facts = Partial<Record<'buyLimit' | 'highAlchemy' | 'lowAlchemy' | 'value', number>>;
interface TradeSnapshot {
    high: number | null; highTime: number | null;
    low: number | null; lowTime: number | null;
    sourceUrl: string; fetchedAt: string;
}
function object(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function cached<K, V>(load: (key: K) => Promise<V>, ttl: number, now: () => number, max: number) {
    const values = new Map<K, { until: number; value: V }>();
    const pending = new Map<K, Promise<V>>();
    return (key: K): Promise<V> => {
        const hit = values.get(key);
        if (hit && now() < hit.until) return Promise.resolve(hit.value);
        values.delete(key);
        const inflight = pending.get(key);
        if (inflight) return inflight;
        const request = load(key).then(value => {
            values.set(key, { until: now() + ttl, value });
            while (values.size > max) values.delete(values.keys().next().value!);
            return value;
        }).finally(() => pending.delete(key));
        pending.set(key, request);
        return request;
    };
}
function side(row: Record<string, unknown>, priceKey: string, timeKey: string) {
    const price = row[priceKey], time = row[timeKey];
    if (price === null && time === null) return { price: null, time: null };
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > Number.MAX_SAFE_INTEGER ||
        typeof time !== 'number' || !Number.isSafeInteger(time) || time < 0) {
        throw new Error('RS3 trade feed returned an invalid price/timestamp pair');
    }
    return { price, time };
}

/** Public data caches are per process. No article prose is retained or returned. */
export function createLiveItemReader(load: Loader = makeApiRequest, now: () => number = Date.now) {
    const mapping = cached(async (_key: string) => {
        const data = await load(`${RS3_LIVE_PRICE_API}/mapping`);
        if (!Array.isArray(data)) throw new Error('RS3 item mapping returned an invalid payload');
        const items = new Map<number, Facts>();
        for (const row of data) {
            if (!object(row) || typeof row.id !== 'number' || !Number.isSafeInteger(row.id) || row.id < 0) continue;
            const facts: Facts = {};
            for (const [source, target] of [['limit', 'buyLimit'], ['highalch', 'highAlchemy'],
                ['lowalch', 'lowAlchemy'], ['value', 'value']] as const) {
                const value = row[source];
                if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) facts[target] = value;
            }
            if (Object.keys(facts).length) items.set(row.id, facts);
        }
        return { items, fetchedAt: new Date(now()).toISOString() };
    }, 600_000, now, 1);
    const latest = cached<number, TradeSnapshot>(async itemId => {
        const data = await load(`${RS3_LIVE_PRICE_API}/latest?id=${itemId}`);
        if (!object(data) || !object(data.data)) throw new Error('RS3 trade feed returned an invalid payload');
        const raw = data.data[String(itemId)];
        const row = raw === undefined ? { high: null, highTime: null, low: null, lowTime: null } : raw;
        if (!object(row)) throw new Error('RS3 trade feed returned an invalid item');
        const high = side(row, 'high', 'highTime'), low = side(row, 'low', 'lowTime');
        return { high: high.price, highTime: high.time, low: low.price, lowTime: low.time,
            sourceUrl: `https://prices.runescape.wiki/rs/item/${itemId}`, fetchedAt: new Date(now()).toISOString() };
    }, 30_000, now, 512);
    return async (itemId: number) => {
        if (!Number.isSafeInteger(itemId) || itemId < 0) throw new Error('A safe nonnegative GE item ID is required');
        // Sequential within each row keeps the existing two-row batch concurrency bound.
        const catalogue = await mapping('mapping');
        const trades = await latest(itemId);
        const facts = catalogue.items.get(itemId);
        return { liveTrades: { ...trades }, wikiFacts: facts ? { ...facts,
            sourceUrl: trades.sourceUrl, fetchedAt: catalogue.fetchedAt } : null };
    };
}
export const fetchLiveItemData = createLiveItemReader();
