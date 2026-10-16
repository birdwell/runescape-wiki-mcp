// Shared MCP tool schema helpers (JSON Schema 2020-12)

export const JSON_SCHEMA_2020_12 = 'https://json-schema.org/draft/2020-12/schema';

export const EMPTY_OBJECT_SCHEMA = {
    $schema: JSON_SCHEMA_2020_12,
    type: 'object' as const,
    additionalProperties: false,
};

// Every tool reads public game data. openWorldHint is true because each call
// reaches Jagex, Weirdgloop, or the RuneScape Wiki.
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
