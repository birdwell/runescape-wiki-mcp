// Tools index - exports all tools and handlers

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { priceTools, handlePriceTool } from './priceTools.js';
import { itemTools, handleItemTool } from './itemTools.js';
import { playerTools, handlePlayerTool } from './playerTools.js';
import { wikiTools, handleWikiTool } from './wikiTools.js';
import { ToolArguments, ToolResponse } from '../types.js';

// Export all tools combined
export const allTools: Tool[] = [
    ...priceTools,
    ...itemTools,
    ...playerTools,
    ...wikiTools,
];

// Main tool handler that routes to appropriate sub-handler
export async function handleTool(name: string, args: ToolArguments): Promise<ToolResponse> {
    // Check if it's a price tool
    if (priceTools.some(tool => tool.name === name)) {
        return handlePriceTool(name, args);
    }

    // Check if it's an item tool
    if (itemTools.some(tool => tool.name === name)) {
        return handleItemTool(name, args);
    }

    // Check if it's a player tool
    if (playerTools.some(tool => tool.name === name)) {
        return handlePlayerTool(name, args);
    }

    // Check if it's a wiki tool
    if (wikiTools.some(tool => tool.name === name)) {
        return handleWikiTool(name, args);
    }

    throw new Error(`Unknown tool: ${name}`);
}

// Export individual tool categories
export { priceTools, itemTools, playerTools, wikiTools }; 