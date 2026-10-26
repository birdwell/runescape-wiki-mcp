// Player tools for RuneScape Wiki MCP Server

import type { Tool } from '@modelcontextprotocol/server';
import { GAME_MODE_PATHS, RS3_HISCORES_ORIGIN, RS3_SKILLS } from '../constants.js';
import { fetchPlayerQuests } from '../questData.js';
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
        name: 'get_player_quests',
        title: 'Get Player Quest Journal',
        description: "Read the complete public RS3 RuneMetrics quest journal. Use recommend_next_activity for paid advice or get_player_stats for levels.\n\n- username selects one player's progress, not a quest filter. Unlike hiscores, no gameMode is selected: use the display name directly. Filter returned entries locally for one quest/status.\n- Pass A B with its literal space, not A%20B; pre-encoding changes the submitted name. Only outer whitespace is trimmed. Invalid lengths error before fetching rather than being shortened.\n- All entries return without pagination. Private, unavailable or malformed journals return isError/text, never guessed progress or an empty completion list.\n- One uncached RuneMetrics read has a 12-second default deadline. No Jev, key or login is needed; no account changes or journal storage occur.",
        inputSchema: {
            $schema: JSON_SCHEMA_2020_12, type: 'object',
            properties: { username: { type: 'string', minLength: 1, maxLength: 12, description: 'Exact RS3 player display name' } },
            required: ['username'], additionalProperties: false,
        },
        outputSchema: {
            $schema: JSON_SCHEMA_2020_12, type: 'object',
            properties: {
                username: { type: 'string', description: 'Normalized caller display name' },
                source: { type: 'string', format: 'uri', description: 'RuneMetrics journal request URL' },
                fetchedAt: { type: 'string', format: 'date-time', description: 'UTC retrieval time for this uncached journal' },
                quests: { type: 'array', minItems: 1, maxItems: 600,
                    description: 'Complete journal entries returned by RuneMetrics',
                    items: { type: 'object', properties: {
                        title: { type: 'string', minLength: 1, maxLength: 255, description: 'Quest title from the public journal' },
                        status: { type: 'string', enum: ['COMPLETED', 'STARTED', 'NOT_STARTED'], description: 'Reported player progress for this quest' },
                        members: { type: 'boolean', description: 'Whether this quest requires membership; not the account membership state' },
                        userEligible: { type: 'boolean', description: 'Jagex eligibility flag; not independent verification of equipment, budget or every condition' },
                        questPoints: { type: 'integer', minimum: 0, description: 'Quest-point value reported by RuneMetrics' },
                    }, required: ['title', 'status', 'members', 'userEligible', 'questPoints'], additionalProperties: false },
                },
                counts: { type: 'object', properties: {
                    total: { type: 'integer', minimum: 1, description: 'Number of returned journal entries' },
                    completed: { type: 'integer', minimum: 0, description: 'Entries with COMPLETED status' },
                    started: { type: 'integer', minimum: 0, description: 'Entries with STARTED status' },
                    notStarted: { type: 'integer', minimum: 0, description: 'Entries with NOT_STARTED status' },
                }, required: ['total', 'completed', 'started', 'notStarted'], additionalProperties: false },
            },
            required: ['username', 'source', 'fetchedAt', 'quests', 'counts'],
            additionalProperties: false,
        },
        ...READ_ONLY_TOOL,
    },
    {
        name: 'get_player_stats',
        title: 'Get Player Stats',
        description:
            'Get RS3 hiscores for a player. Normal mode works via Jagex index_lite. Ironman/hardcore use documented Jagex endpoints that currently return HTTP 404; the tool reports that clearly instead of falling back to normal data.',
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

export async function handlePlayerTool(name: string, args: ToolArguments, signal?: AbortSignal): Promise<ToolResponse> {
    switch (name) {
        case 'get_player_quests': {
            const unexpected = rejectUnknownKeys(args, ['username']);
            if (unexpected) return unexpected;
            const username = requireString(args?.username, 'username', { minLength: 1, maxLength: 12 });
            if (isToolResponse(username)) return username;
            return createSuccessResponse(`Quest journal for ${username}`, await fetchPlayerQuests(username,
                signal ?? AbortSignal.timeout(12_000)));
        }
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
                csvData = await makeTextApiRequest(url, signal);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (message.includes('404')) {
                    if (gameMode !== 'normal') {
                        return validationError(
                            `RS3 ${gameMode} hiscores lite API returned HTTP 404 from Jagex ` +
                                `(${path}). This endpoint is documented but currently unavailable. ` +
                                `Try gameMode "normal", or check the HTML hiscores on runescape.com.`
                        );
                    }
                    return validationError(
                        `Player "${username}" was not found on the normal hiscores (HTTP 404).`
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
