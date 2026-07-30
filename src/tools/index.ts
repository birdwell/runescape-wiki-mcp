// Tools index - exports all tools and handlers

import type { Tool } from '@modelcontextprotocol/server';
import { priceTools, handlePriceTool } from './priceTools.js';
import { itemTools, handleItemTool } from './itemTools.js';
import { playerTools, handlePlayerTool } from './playerTools.js';
import { wikiTools, handleWikiTool } from './wikiTools.js';
import { historyTools, handleHistoryTool } from './historyTools.js';
import { compareTools, handleCompareTool } from './compareTools.js';
import { flipTools, handleFlipTool } from './flipTools.js';
import { ToolArguments, ToolResponse } from '../types.js';
import { unknownToolError } from '../errors.js';

export const allTools: Tool[] = [
    ...itemTools,
    ...priceTools,
    ...historyTools,
    ...compareTools,
    ...flipTools,
    ...playerTools,
    ...wikiTools,
];

export async function handleTool(name: string, args: ToolArguments): Promise<ToolResponse> {
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
    historyTools,
    compareTools,
    flipTools,
};
