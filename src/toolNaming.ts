import type { Tool } from '@modelcontextprotocol/server';
import { comparisonOutputSchema } from './tools/compareTools.js';
import { priceSummaryOutputSchema } from './mcpSchemas.js';

// Discovery uses precise resource names. Existing call names remain valid compatibility aliases.
const discoveryNames = new Map([
    ['get_item_price', 'get_item_details'],
    ['get_item_graph', 'get_price_series'],
    ['compare_items', 'compare_item_prices'],
]);
const implementationNames = new Map([...discoveryNames].map(([legacy, canonical]) => [canonical, legacy]));
const referenceNames = new Map([...discoveryNames, ['get_all_categories', 'get_ge_info (view=categories)'], ['get_category_info', 'get_ge_info (view=category_counts)'], ['summarize_price_history', 'get_price_series (view=statistics)'], ['compare_items', 'get_item_details (view=comparison)']]);
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
        input.properties.view = { type: 'string', enum: ['records', 'comparison'], default: 'records', description: 'Detailed Jagex records (original default) or compact Weirdgloop comparison snapshots' };
        input.oneOf = [
            { properties: { view: { const: 'records' } }, oneOf: [{ required: ['itemId'] }, { required: ['itemIds'] }] },
            { properties: { view: { const: 'comparison' }, includeLiveData: { const: false } }, required: ['view', 'itemIds'], not: { required: ['itemId'] } },
        ];
        published.title = 'Read Current Item Data';
        published.outputSchema = { type: 'object', anyOf: [published.outputSchema!, comparisonOutputSchema] };
        input.properties.itemIds.description = 'GE IDs of the target candidates';
        input.properties.includeLiveData.description = 'Optional trade/mapping enrichment for the records view';
        delete input.examples;
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
        input.properties.days = { type: 'integer', minimum: 7, maximum: 90, description: 'Sample window for the statistics view' };
        delete input.properties.source.default;
        input.properties.source.description = 'History data provider; allowed values and defaults depend on view';
        input.oneOf = [
            { properties: { view: { const: 'observations' }, source: { default: 'jagex' } }, not: { required: ['days'] } },
            { properties: { view: { const: 'statistics' }, source: { const: 'weirdgloop', default: 'weirdgloop' }, days: { default: 30 } }, required: ['view'], not: { anyOf: [{ required: ['from'] }, { required: ['to'] }] } },
        ];
        published.outputSchema = { type: 'object', anyOf: [published.outputSchema!, priceSummaryOutputSchema] };
    }
    return published;
}
