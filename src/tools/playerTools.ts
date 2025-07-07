// Player tools for RuneScape Wiki MCP Server

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { RS3_HISCORES_API, RS3_SKILLS, GAME_MODE_ENDPOINTS } from '../constants.js';
import { makeTextApiRequest, createSuccessResponse } from '../utils.js';
import { ToolArguments, ToolResponse, PlayerStatsResponse, GameMode } from '../types.js';

// Tool definitions for player-related functionality
export const playerTools: Tool[] = [
    {
        name: 'get_player_stats',
        description: 'Get player statistics from RuneScape 3 hiscores',
        inputSchema: {
            type: 'object',
            properties: {
                username: {
                    type: 'string',
                    description: 'Player username to lookup',
                },
                gameMode: {
                    type: 'string',
                    enum: ['normal', 'ironman', 'hardcore'],
                    description: 'Game mode hiscores to check',
                    default: 'normal',
                },
            },
            required: ['username'],
        },
    },
];

// Tool handlers for player-related functionality
export async function handlePlayerTool(name: string, args: ToolArguments): Promise<ToolResponse> {
    switch (name) {
        case 'get_player_stats': {
            const username = args?.username as string;

            if (!username) {
                throw new Error('Username is required');
            }

            const gameMode = (args?.gameMode as GameMode) || 'normal';

            const endpoint = GAME_MODE_ENDPOINTS[gameMode];
            const url = `${RS3_HISCORES_API}/${endpoint}?player=${encodeURIComponent(username)}`;

            const csvData = await makeTextApiRequest(url);
            const lines = csvData.trim().split('\n');

            // Parse the CSV data into a more readable format
            const parsedStats: PlayerStatsResponse = {};
            lines.slice(0, 30).forEach((line: string, index: number) => {
                const [rank, level, xp] = line.split(',');
                parsedStats[RS3_SKILLS[index]] = {
                    rank: rank === '-1' ? 'Unranked' : parseInt(rank),
                    level: level === '-1' ? 0 : parseInt(level),
                    experience: xp === '-1' ? 0 : parseInt(xp),
                };
            });

            return createSuccessResponse(`Player Stats for ${username} (${gameMode})`, parsedStats);
        }

        default:
            throw new Error(`Unknown player tool: ${name}`);
    }
} 