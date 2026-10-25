// Shared MCP tool schema helpers (JSON Schema 2020-12)

export const JSON_SCHEMA_2020_12 = 'https://json-schema.org/draft/2020-12/schema';

export const EMPTY_OBJECT_SCHEMA = {
    $schema: JSON_SCHEMA_2020_12,
    type: 'object' as const,
    additionalProperties: false,
};

// Default for public API calls. Built-in reference tools override openWorldHint.
export const READ_ONLY_TOOL = {
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
    },
};

export const itemIdProperty = {
    type: 'integer' as const,
    minimum: 0,
    description: 'Grand Exchange item ID',
};

export const categoryProperty = {
    type: 'integer' as const,
    minimum: 0,
    maximum: 43,
    description: 'Category ID (0-43)',
};

export const itemMatchSchema = {
    type: 'object' as const,
    properties: {
        id: { type: 'integer' as const, description: 'Grand Exchange item ID' },
        name: { type: 'string' as const, description: 'Item name' },
        price: { type: 'number' as const, description: 'Latest price in coins, when known' },
        volume: { type: 'number' as const, description: 'Latest trade volume, when known' },
        timestamp: { type: 'string' as const, description: 'ISO timestamp of the price sample' },
        wikiUrl: { type: 'string' as const, description: 'RuneScape Wiki page URL' },
        error: { type: 'string' as const, description: 'Why this row could not be resolved' },
    },
    required: ['id', 'name'],
    additionalProperties: false,
};

export const lookupOutputSchema = {
    $schema: JSON_SCHEMA_2020_12,
    type: 'object' as const,
    properties: {
        matches: {
            type: 'array' as const,
            description: 'Matching Grand Exchange items, best match first',
            items: itemMatchSchema,
        },
    },
    required: ['matches'],
    additionalProperties: false,
};

/** Exactly one selector, matching resolveItemId's runtime validation. */
export const ITEM_SELECTOR = {
    oneOf: [{ required: ['itemId'] }, { required: ['name'] }],
};

export const itemDetailOutputSchema = {
    $schema: JSON_SCHEMA_2020_12,
    type: 'object' as const,
    properties: {
        item: {
            type: 'object' as const,
            description: 'Jagex catalogue item detail; prices are guide values, not executable offers',
            properties: {
                id: itemIdProperty,
                name: { type: 'string' as const },
                wikiUrl: { type: 'string' as const, format: 'uri', description: 'Wiki item-ID lookup link; redirects to the corresponding article without a title search' },
                type: { type: 'string' as const, description: 'Jagex catalogue category name' },
                members: { type: 'string' as const, enum: ['true', 'false'], description: 'Whether the item requires membership; Jagex returns a string' },
                icon: { type: 'string' as const, description: 'Small item icon URL' },
                icon_large: { type: 'string' as const, description: 'Large item icon URL' },
                typeIcon: { type: 'string' as const, description: 'Catalogue category icon URL' },
                description: { type: 'string' as const, description: 'In-game examine text' },
                current: {
                    type: 'object' as const,
                    properties: {
                        price: { type: ['number', 'string'], description: 'Coins, possibly abbreviated with k or m' },
                        trend: { type: 'string' as const },
                    },
                    additionalProperties: true,
                },
                today: { type: 'object' as const, additionalProperties: true },
                day30: { type: 'object' as const, additionalProperties: true },
                day90: { type: 'object' as const, additionalProperties: true },
                day180: { type: 'object' as const, additionalProperties: true },
            },
            additionalProperties: true,
        },
    },
    required: ['item'],
    additionalProperties: true,
};

export const graphOutputSchema = {
    $schema: JSON_SCHEMA_2020_12,
    type: 'object' as const,
    properties: {
        daily: {
            type: 'object' as const,
            description: 'Daily guide prices in coins, keyed by Unix timestamp in milliseconds',
            additionalProperties: { type: 'number' as const },
        },
        average: {
            type: 'object' as const,
            description: 'Jagex averaged guide prices in coins, keyed by Unix timestamp in milliseconds',
            additionalProperties: { type: 'number' as const },
        },
    },
    required: ['daily', 'average'],
    additionalProperties: true,
};

/** Jagex catalogue and graph payloads mix numbers with compact strings such as "80k". */
export const jagexObjectOutputSchema = {
    $schema: JSON_SCHEMA_2020_12,
    type: 'object' as const,
    description:
        'Raw Jagex JSON. Price fields may be integers or compact strings such as "80k".',
    additionalProperties: true,
};

export const priceSummaryOutputSchema = {
    $schema: JSON_SCHEMA_2020_12,
    type: 'object' as const,
    properties: {
        itemId: { type: 'integer' as const, description: 'Grand Exchange item ID' },
        name: { type: 'string' as const, description: 'Name supplied by the caller, when given' },
        windowDays: { type: 'integer' as const, description: 'Trailing window actually summarized' },
        sampleCount: { type: 'integer' as const, description: 'Daily samples inside the window' },
        latestPrice: { type: 'number' as const, description: 'Newest price in the window, in coins' },
        oldestPriceInWindow: { type: 'number' as const, description: 'Oldest price in the window, in coins' },
        minPrice: { type: 'number' as const, description: 'Lowest price in the window, in coins' },
        maxPrice: { type: 'number' as const, description: 'Highest price in the window, in coins' },
        avgPrice: { type: 'number' as const, description: 'Average price in the window, rounded to whole coins' },
        changeAbs: { type: 'number' as const, description: 'latestPrice minus oldestPriceInWindow' },
        changePct: { type: 'number' as const, description: 'Percent change across the window, rounded to two decimals; 0 when the oldest price is 0' },
        avgDailyVolume: { type: 'number' as const, description: 'Average daily volume rounded to a whole number, when the source provided it' },
    },
    required: [
        'itemId',
        'windowDays',
        'sampleCount',
        'latestPrice',
        'oldestPriceInWindow',
        'minPrice',
        'maxPrice',
        'avgPrice',
        'changeAbs',
        'changePct',
    ],
    additionalProperties: false,
};

export const playerStatsOutputSchema = {
    $schema: JSON_SCHEMA_2020_12,
    type: 'object' as const,
    description: 'Map of RS3 skill name to hiscores row. Overall is included.',
    additionalProperties: {
        type: 'object',
        properties: {
            rank: {
                description: 'Hiscores rank, or the string Unranked',
                anyOf: [{ type: 'integer' }, { const: 'Unranked' }],
            },
            level: { type: 'integer', description: 'Skill level' },
            experience: { type: 'integer', description: 'Skill experience' },
        },
        required: ['rank', 'level', 'experience'],
        additionalProperties: false,
    },
};
