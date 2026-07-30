// MCP prompts (workflow templates) for RuneScape Wiki MCP Server

import {
    ProtocolError,
    ProtocolErrorCode,
    type GetPromptRequest,
    type GetPromptResult,
    type Prompt,
    type PromptMessage,
    type Server,
} from '@modelcontextprotocol/server';

function userMessage(text: string): PromptMessage {
    return { role: 'user', content: { type: 'text', text } };
}

function unknownPromptError(name: string): ProtocolError {
    return new ProtocolError(ProtocolErrorCode.InvalidParams, `Unknown prompt: ${name}`);
}

function missingArgumentError(promptName: string, argName: string): ProtocolError {
    return new ProtocolError(
        ProtocolErrorCode.InvalidParams,
        `Prompt "${promptName}" requires argument "${argName}"`
    );
}

function requireArg(
    promptName: string,
    args: Record<string, string>,
    argName: string
): string {
    const value = args[argName];
    if (!value) {
        throw missingArgumentError(promptName, argName);
    }
    return value;
}

export const prompts: Prompt[] = [
    {
        name: 'check_item_price',
        title: 'Check Item Price',
        description:
            'Look up the current Grand Exchange price and recent trend for an item by name, resolving the exact item first.',
        arguments: [
            {
                name: 'itemName',
                description: 'Item name to check, e.g. "Abyssal whip"',
                required: true,
            },
        ],
    },
    {
        name: 'compare_ge_items',
        title: 'Compare Grand Exchange Items',
        description:
            'Compare current Grand Exchange prices for a list of items side by side in one call.',
        arguments: [
            {
                name: 'items',
                description: 'Comma-separated item names to compare, e.g. "Abyssal whip, Dragon bones"',
                required: true,
            },
        ],
    },
    {
        name: 'estimate_item_flip',
        title: 'Estimate Item Flip',
        description:
            'Estimate the profitability of flipping an item on the Grand Exchange, including GE tax and margin.',
        arguments: [
            {
                name: 'itemName',
                description: 'Item name to flip, e.g. "Frost dragon bones"',
                required: true,
            },
            {
                name: 'quantity',
                description: 'Quantity to flip (default 1 if omitted)',
                required: false,
            },
        ],
    },
    {
        name: 'player_overview',
        title: 'Player Overview',
        description:
            'Summarize a normal-mode RS3 hiscores overview for a player: overall rank, total level, and experience.',
        arguments: [
            {
                name: 'username',
                description: 'RS3 player username to look up',
                required: true,
            },
        ],
    },
];

export function listPrompts(): Prompt[] {
    return prompts;
}

export function getPrompt(name: string, args: Record<string, string> = {}): GetPromptResult {
    switch (name) {
        case 'check_item_price': {
            const itemName = requireArg(name, args, 'itemName');
            return {
                description: `Check the current Grand Exchange price for "${itemName}"`,
                messages: [
                    userMessage(
                        `Check the current Grand Exchange price for "${itemName}".\n` +
                            `1. Call \`lookup_item\` with query="${itemName}" to resolve the exact item name and Grand Exchange ID (skip this if you already have an exact match).\n` +
                            `2. Call \`get_item_price\` with the resolved itemId or name to get the current price, trend, and examine text.\n` +
                            `3. Optionally call \`summarize_price_history\` with the same itemId/name to see the min/max/average price and % change over the last 30 days.\n` +
                            `Report the current price, trend, and any notable recent price movement.`
                    ),
                ],
            };
        }

        case 'compare_ge_items': {
            const items = requireArg(name, args, 'items');
            return {
                description: `Compare Grand Exchange prices for: ${items}`,
                messages: [
                    userMessage(
                        `Compare the current Grand Exchange prices for these items: ${items}.\n` +
                            `1. Split the comma-separated list into individual item names, trimming whitespace.\n` +
                            `2. Call \`compare_items\` once with the \`names\` array containing all of them (up to 10 items per call).\n` +
                            `3. Present a clear comparison of price and volume per item, and call out any names that could not be resolved.`
                    ),
                ],
            };
        }

        case 'estimate_item_flip': {
            const itemName = requireArg(name, args, 'itemName');
            const quantity = args.quantity;
            return {
                description: `Estimate flip profitability for "${itemName}"`,
                messages: [
                    userMessage(
                        `Estimate the profitability of flipping "${itemName}"` +
                            `${quantity ? ` for a quantity of ${quantity}` : ''} on the Grand Exchange.\n` +
                            `1. Call \`lookup_item\` with query="${itemName}" if you need to resolve the exact item name or ID first.\n` +
                            `2. Call \`estimate_flip\` with the resolved item` +
                            `${quantity ? ` and quantity=${quantity}` : ' (default quantity)'} to get projected buy/sell prices, GE tax, and estimated profit.\n` +
                            `3. Summarize the estimated margin, GE tax, and total profit/loss, noting that Grand Exchange prices can move before the flip completes.`
                    ),
                ],
            };
        }

        case 'player_overview': {
            const username = requireArg(name, args, 'username');
            return {
                description: `Hiscores overview for ${username}`,
                messages: [
                    userMessage(
                        `Give a hiscores overview for player "${username}".\n` +
                            `1. Call \`get_player_stats\` with username="${username}" and gameMode="normal" to get overall rank, total level, and experience.\n` +
                            `2. If the user asks about a specific skill, look it up in the returned skills data.\n` +
                            `3. Only call \`get_wiki_page_content\` with page="${username}" if the user specifically asks for wiki or lore information about this player.\n` +
                            `Summarize overall rank, total level, and total experience, and call out any standout skills (e.g. level 99s or top ranks).`
                    ),
                ],
            };
        }

        default:
            throw unknownPromptError(name);
    }
}

export function registerPromptHandlers(server: Server): void {
    server.setRequestHandler('prompts/list', async () => {
        return { prompts: listPrompts() };
    });

    server.setRequestHandler('prompts/get', async (request: GetPromptRequest) => {
        const { name, arguments: args } = request.params;
        return getPrompt(name, args ?? {});
    });
}
