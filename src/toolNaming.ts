import type { Tool } from '@modelcontextprotocol/server';

// Discovery uses precise resource names. Existing call names remain valid compatibility aliases.
const discoveryNames = new Map([
    ['get_item_price', 'get_item_details'],
    ['get_item_graph', 'get_price_series'],
    ['compare_items', 'compare_item_prices'],
]);
const implementationNames = new Map([...discoveryNames].map(([legacy, canonical]) => [canonical, legacy]));
const referenceNames = new Map([...discoveryNames, ['get_all_categories', 'get_ge_info (view=categories)'], ['get_category_info', 'get_ge_info (view=category_counts)']]);
const references = /\b(get_item_price|get_item_graph|compare_items|get_all_categories|get_category_info)\b/g;

export function implementationToolName(name: string): string {
    return implementationNames.get(name) ?? name;
}

/** Metadata only: never rewrite caller arguments, game data, or tool results. */
export function discoveryTool(tool: Tool): Tool {
    return JSON.parse(JSON.stringify(tool).replace(references, name => referenceNames.get(name)!)) as Tool;
}
