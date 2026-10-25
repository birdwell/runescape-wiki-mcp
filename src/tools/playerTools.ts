// Player tools for RuneScape Wiki MCP Server

import type { Tool } from '@modelcontextprotocol/server';
import { GAME_MODE_PATHS, RS3_HISCORES_ORIGIN, RS3_SKILLS } from '../constants.js';
import { JSON_SCHEMA_2020_12, playerStatsOutputSchema, READ_ONLY_TOOL } from '../mcpSchemas.js';
import { GameMode, PlayerStatsResponse, ToolArguments, ToolResponse } from '../types.js';
import { createSuccessResponse, makeTextApiRequest } from '../utils.js';
import {
    isToolResponse,
    rejectUnknownKeys,
    requireString,
    validationError,
} from '../validation.js';

const GAME_MODES = ['normal', 'ironman', 'hardcore'] as const;

function isGameMode(value: string): value is GameMode {
    return (GAME_MODES as readonly string[]).includes(value);
}

export const playerTools: Tool[] = [
    {
        name: 'get_player_stats',
        title: 'Get Player Stats',
        description:
            "Read an RS3 player's published hiscores ranks, levels and experience, including Overall. Use search_wiki for training guides rather than player data.\n" +
            "- username is the literal in-game display name, including spaces; the server URL-encodes it. gameMode chooses a separate leaderboard, not a filter on normal stats. Omit it for normal mode.\n" +
            "- Normal, ironman and hardcore boards are supported. A player absent from the selected board returns a 404 tool error; the tool never substitutes another board. Unranked skills use rank Unranked; unavailable level/XP becomes 0.\n" +
            "- No login, account changes or local cache. HTTP shares a default 60 requests/IP/minute budget; honor Retry-After on 429.",
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
                    description: 'Hiscores board (default: normal)',
                    default: 'normal',
                },
            },
            required: ['username'],
            additionalProperties: false,
        },
        outputSchema: playerStatsOutputSchema,
        ...READ_ONLY_TOOL,
    },
];

export async function handlePlayerTool(name: string, args: ToolArguments): Promise<ToolResponse> {
    switch (name) {
        case 'get_player_stats': {
            const unexpected = rejectUnknownKeys(args, ['username', 'gameMode']);
            if (unexpected) {
                return unexpected;
            }

            const username = requireString(args?.username, 'username', { minLength: 1 });
            if (isToolResponse(username)) {
                return username;
            }

            let gameMode: GameMode = 'normal';
            if (args?.gameMode !== undefined) {
                if (typeof args.gameMode !== 'string' || !isGameMode(args.gameMode)) {
                    return validationError('gameMode must be one of: normal, ironman, hardcore');
                }
                gameMode = args.gameMode;
            }

            const path = GAME_MODE_PATHS[gameMode];
            const url = `${RS3_HISCORES_ORIGIN}${path}?player=${encodeURIComponent(username)}`;

            let csvData: string;
            try {
                csvData = await makeTextApiRequest(url);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (message.includes('404')) {
                    return validationError(
                        `Player "${username}" was not found on the ${gameMode} hiscores (HTTP 404). ` +
                            'Check the display name and selected leaderboard. No other board was queried.'
                    );
                }
                throw error;
            }

            const lines = csvData.trim().split('\n').filter(line => line.length > 0);
            if (lines.length === 0 || !lines[0].includes(',')) {
                return validationError(
                    `Unexpected hiscores response for "${username}" (${gameMode}).`
                );
            }

            const parsedStats: PlayerStatsResponse = {};
            const skillCount = Math.min(RS3_SKILLS.length, lines.length);
            for (let index = 0; index < skillCount; index += 1) {
                const parts = lines[index]?.split(',') ?? [];
                const [rank, level, xp] = parts;
                const rankNum = Number.parseInt(rank ?? '', 10);
                const levelNum = Number.parseInt(level ?? '', 10);
                const xpNum = Number.parseInt(xp ?? '', 10);
                parsedStats[RS3_SKILLS[index]] = {
                    rank: rank === '-1' || !Number.isFinite(rankNum) ? 'Unranked' : rankNum,
                    level: level === '-1' || !Number.isFinite(levelNum) ? 0 : levelNum,
                    experience: xp === '-1' || !Number.isFinite(xpNum) ? 0 : xpNum,
                };
            }

            return createSuccessResponse(`Player Stats for ${username} (${gameMode})`, parsedStats);
        }

        default:
            throw new Error(`Unknown player tool: ${name}`);
    }
}
