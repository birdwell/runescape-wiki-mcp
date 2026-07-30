// Player tools for RuneScape Wiki MCP Server

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { RS3_HISCORES_API, RS3_SKILLS, GAME_MODE_ENDPOINTS } from '../constants.js';
import { makeTextApiRequest, createSuccessResponse } from '../utils.js';
import { ToolArguments, ToolResponse, PlayerStatsResponse, GameMode } from '../types.js';
import { JSON_SCHEMA_2020_12, READ_ONLY_TOOL } from '../mcpSchemas.js';
import { isToolResponse, requireString, validationError } from '../validation.js';

const GAME_MODES = ['normal', 'ironman', 'hardcore'] as const;

function isGameMode(value: string): value is GameMode {
    return (GAME_MODES as readonly string[]).includes(value);
}

// Tool definitions for player-related functionality
export const playerTools: Tool[] = [
    {
        name: 'get_player_stats',
        title: 'Get Player Stats',
        description: 'Get player statistics from RuneScape 3 hiscores',
        inputSchema: {
            $schema: JSON_SCHEMA_2020_12,
            type: 'object',
            properties: {
                username: {
                    type: 'string',
                    minLength: 1,
                    description: 'Player username to lookup',
                },
                gameMode: {
                    type: 'string',
                    enum: ['normal', 'ironman', 'hardcore'],
                    description: 'Game mode hiscores to check',
                },
            },
            required: ['username'],
            additionalProperties: false,
        },
        ...READ_ONLY_TOOL,
    },
];

// Tool handlers for player-related functionality
export async function handlePlayerTool(name: string, args: ToolArguments): Promise<ToolResponse> {
    switch (name) {
        case 'get_player_stats': {
            const username = requireString(args?.username, 'username');
            if (isToolResponse(username)) {
                return username;
            }

            const rawGameMode = args?.gameMode;
            let gameMode: GameMode = 'normal';
            if (rawGameMode !== undefined) {
                if (typeof rawGameMode !== 'string' || !isGameMode(rawGameMode)) {
                    return validationError('gameMode must be one of: normal, ironman, hardcore');
                }
                gameMode = rawGameMode;
            }

            const endpoint = GAME_MODE_ENDPOINTS[gameMode];
            const url = `${RS3_HISCORES_API}/${endpoint}?player=${encodeURIComponent(username)}`;

            const csvData = await makeTextApiRequest(url);
            const lines = csvData.trim().split('\n');

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
