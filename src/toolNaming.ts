import type { Tool } from '@modelcontextprotocol/server';
import { priceSummaryOutputSchema } from './mcpSchemas.js';

// Discovery uses precise resource names. Existing call names remain valid compatibility aliases.
const discoveryNames = new Map([
    ['get_item_price', 'get_item_details'],
    ['get_item_graph', 'get_price_series'],
    ['compare_items', 'compare_item_prices'],
]);
const implementationNames = new Map([...discoveryNames].map(([legacy, canonical]) => [canonical, legacy]));
const referenceNames = new Map([...discoveryNames, ['get_all_categories', 'get_ge_info (view=categories)'], ['get_category_info', 'get_ge_info (view=category_counts)'], ['summarize_price_history', 'get_price_series (view=statistics)']]);
const references = /\b(get_item_price|get_item_graph|compare_items|get_all_categories|get_category_info|summarize_price_history)\b/g;

export function implementationToolName(name: string): string {
    return implementationNames.get(name) ?? name;
}

/** Metadata only: never rewrite caller arguments, game data, or tool results. */
export function discoveryTool(tool: Tool): Tool {
    const published = JSON.parse(JSON.stringify(tool).replace(references, name => referenceNames.get(name)!)) as Tool;
    // Preferred discovery resolves names once through lookup_item. Existing handlers
    // still accept deprecated name selectors for cached clients and legacy calls.
    const input = published.inputSchema as any;
    if (['get_item_price', 'get_item_graph', 'estimate_flip'].includes(tool.name)) {
        delete input.properties.name;
        input.properties.itemId.description = 'Known GE item ID resolved with lookup_item';
        delete input.oneOf;
        input.required = ['itemId'];
        if (input.examples) input.examples = input.examples.filter((example: any) => example.name === undefined);
    }
    if (tool.name === 'get_item_price') {
        delete input.required;
        input.oneOf = [{ required: ['itemId'] }, { required: ['itemIds'] }];
        input.properties.itemIds.description = 'Known GE IDs for an ordered catalogue batch; exclusive with itemId';
    }
    if (tool.name === 'compare_items') {
        delete input.properties.names;
        delete input.oneOf;
        input.required = ['itemIds'];
        input.properties.itemIds.description = 'Known GE IDs for the candidate set; resolve names with lookup_item first';
    }
    if (tool.name === 'get_item_graph') {
        published.title = 'Read Item Price History';
        input.properties.view = { type: 'string', enum: ['observations', 'statistics'], default: 'observations', description: 'Raw observations (original default) or computed Weirdgloop statistics' };
        input.properties.days = { type: 'integer', minimum: 7, maximum: 90, description: 'Defaults to 30 trailing usable daily samples for statistics only; not a calendar-date range' };
        delete input.properties.source.default;
        input.properties.source.description = 'Observations: jagex by default or weirdgloop. Statistics: weirdgloop only, also the default for that view.';
        input.oneOf = [
            { properties: { view: { const: 'observations' }, source: { default: 'jagex' } }, not: { required: ['days'] } },
            { properties: { view: { const: 'statistics' }, source: { const: 'weirdgloop', default: 'weirdgloop' }, days: { default: 30 } }, required: ['view'], not: { anyOf: [{ required: ['from'] }, { required: ['to'] }] } },
        ];
        published.outputSchema = { type: 'object', anyOf: [published.outputSchema!, priceSummaryOutputSchema] };
    }
    return published;
}
