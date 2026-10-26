// Tools index - exports all tools and handlers

import type { Tool } from '@modelcontextprotocol/server';
import { priceTools, handlePriceTool } from './priceTools.js';
import { itemTools, handleItemTool } from './itemTools.js';
import { playerTools, handlePlayerTool } from './playerTools.js';
import { wikiReferenceTools, handleWikiReferenceTool } from './wikiReferenceTools.js';
import { entityTools, handleEntityTool } from './entityTools.js';
import { wikiTools, handleWikiTool } from './wikiTools.js';
import { historyTools, handleHistoryTool } from './historyTools.js';
import { compareTools, handleCompareTool } from './compareTools.js';
import { flipTools, handleFlipTool } from './flipTools.js';
import { recommendationTools, handleRecommendationTool } from './recommendationTools.js';
import { ToolArguments, ToolResponse } from '../types.js';
import { discoveryTool, implementationToolName } from '../toolNaming.js';
import { unknownToolError } from '../errors.js';

export const allTools: Tool[] = [
    ...itemTools,
    ...priceTools,
    ...historyTools,
    ...compareTools,
    ...flipTools,
    ...playerTools,
    ...wikiTools,
    ...recommendationTools,
    ...entityTools,
    ...wikiReferenceTools,
].filter(tool => !['get_all_categories', 'get_category_info', 'summarize_price_history', 'compare_items'].includes(tool.name)).map(discoveryTool).map(tool => ({
    ...tool,
    // Older directory scanners still read the title from annotations.
    annotations: { ...tool.annotations, title: tool.title ?? tool.name },
}));

export async function handleTool(name: string, args: ToolArguments): Promise<ToolResponse> {
    name = implementationToolName(name);
    if (recommendationTools.some(tool => tool.name === name)) {
        return handleRecommendationTool(name, args);
    }
    if (itemTools.some(tool => tool.name === name)) {
        return handleItemTool(name, args);
    }
    if (priceTools.some(tool => tool.name === name)) {
        return handlePriceTool(name, args);
    }
    if (historyTools.some(tool => tool.name === name)) {
        return handleHistoryTool(name, args);
    }
    if (compareTools.some(tool => tool.name === name)) {
        return handleCompareTool(name, args);
    }
    if (flipTools.some(tool => tool.name === name)) {
        return handleFlipTool(name, args);
    }
    if (playerTools.some(tool => tool.name === name)) {
        return handlePlayerTool(name, args);
    }
    if (wikiReferenceTools.some(tool => tool.name === name)) return handleWikiReferenceTool(name, args);
    if (entityTools.some(tool => tool.name === name)) {
        return handleEntityTool(name, args);
    }
    if (wikiTools.some(tool => tool.name === name)) {
        return handleWikiTool(name, args);
    }

    throw unknownToolError(name);
}

export {
    priceTools,
    itemTools,
    playerTools,
    wikiTools,
    entityTools,
    wikiReferenceTools,
    historyTools,
    compareTools,
    flipTools,
    recommendationTools,
};
