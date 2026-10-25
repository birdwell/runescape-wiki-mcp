// Inclusive UTC calendar-day bounds for timestamp-keyed Jagex price maps.
import type { ToolResponse } from './types.js';
import { isToolResponse, validationError } from './validation.js';

export const dateProperty = {
    type: 'string' as const,
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    description: 'Inclusive UTC calendar date, YYYY-MM-DD',
};

export interface DateRange { start?: number; endExclusive?: number }

function optionalDate(value: unknown, label: string): number | ToolResponse | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return validationError(`${label} must be a UTC date in YYYY-MM-DD format`);
    }
    const timestamp = Date.parse(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
        return validationError(`${label} must be a valid calendar date`);
    }
    return timestamp;
}

export function parseDateRange(from: unknown, to: unknown): DateRange | ToolResponse {
    const start = optionalDate(from, 'from');
    if (isToolResponse(start)) return start;
    const end = optionalDate(to, 'to');
    if (isToolResponse(end)) return end;
    if (start !== undefined && end !== undefined && start > end) {
        return validationError('from must be on or before to');
    }
    return { start, endExclusive: end === undefined ? undefined : end + 86_400_000 };
}

export function isWithinDateRange(timestamp: number, range: DateRange): boolean {
    return Number.isFinite(timestamp) &&
        (range.start === undefined || timestamp >= range.start) &&
        (range.endExclusive === undefined || timestamp < range.endExclusive);
}

export function filterPriceMap(series: Record<string, number>, range: DateRange): Record<string, number> {
    return Object.fromEntries(Object.entries(series).filter(([key]) => isWithinDateRange(Number(key), range)));
}
