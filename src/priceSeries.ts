import { WEIRDGLOOP_EXCHANGE_API } from './constants.js';
import { isWithinDateRange, type DateRange } from './dateRange.js';
import { makeApiRequest } from './utils.js';

interface DailyObservation { timestamp: number; price: number; volume?: number }

export async function fetchWeirdgloopSeries(itemId: number, range: DateRange) {
    const data = await makeApiRequest(`${WEIRDGLOOP_EXCHANGE_API}/last90d?id=${itemId}`);
    const rows: unknown = data?.[String(itemId)];
    if (!Array.isArray(rows)) throw new Error(`No Weirdgloop history available for item ${itemId}`);
    const observations: DailyObservation[] = [];
    for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const { timestamp, price, volume } = row as Record<string, unknown>;
        if (typeof timestamp !== 'number' || !Number.isSafeInteger(timestamp) ||
            timestamp < 0 || timestamp > 8.64e15 ||
            typeof price !== 'number' || !Number.isFinite(price) || price < 0) continue;
        observations.push({ timestamp, price,
            ...(typeof volume === 'number' && Number.isFinite(volume) && volume >= 0 ? { volume } : {}),
        });
    }
    if (rows.length && !observations.length) throw new Error('Weirdgloop returned no valid timestamped price observations');
    observations.sort((a, b) => a.timestamp - b.timestamp);
    return { itemId, source: 'weirdgloop' as const,
        samples: observations.filter(point => isWithinDateRange(point.timestamp, range)) };
}
