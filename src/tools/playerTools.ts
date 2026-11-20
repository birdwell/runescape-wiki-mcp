// Player tools for RuneScape Wiki MCP Server

import type { Tool } from '@modelcontextprotocol/server';
import { GAME_MODE_PATHS, RS3_HISCORES_ORIGIN, RS3_SKILLS } from '../constants.js';
import { fetchPlayerSkills, type SkillRow } from '../playerSkills.js';
import { fetchPlayerQuests, playerDataFailure } from '../questData.js';
import { JSON_SCHEMA_2020_12, playerStatsOutputSchema, READ_ONLY_TOOL } from '../mcpSchemas.js';
import { GameMode, PlayerStatsResponse, ToolArguments, ToolResponse } from '../types.js';
import { ApiRequestError, createSuccessResponse, makeApiRequest } from '../utils.js';
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

/**
 * Parses Platform API Index Lite skills into the tool's existing output shape.
 * Rows are keyed by `id`, the same order as RS3_SKILLS, because the JSON uses
 * different names for some skills (Hitpoints, Runecraft). Unknown ids are skipped.
 * Rank -1 means unranked; level/xp -1 means no data is stored (older records).
 */
function parseHiscoreSkills(data: unknown): PlayerStatsResponse | null {
    const skills = (data as { skills?: unknown } | null)?.skills;
    if (!Array.isArray(skills)) return null;

    const parsedStats: PlayerStatsResponse = {};
    for (const row of skills) {
        const { id, rank, level, xp } = (row ?? {}) as Record<string, unknown>;
        if (!Number.isInteger(id) || (id as number) < 0 || (id as number) >= RS3_SKILLS.length) continue;
        parsedStats[RS3_SKILLS[id as number]] = {
            rank: Number.isSafeInteger(rank) && (rank as number) > 0 ? (rank as number) : 'Unranked',
            level: Number.isSafeInteger(level) && (level as number) >= 0 ? (level as number) : 0,
            experience: Number.isSafeInteger(xp) && (xp as number) >= 0 ? (xp as number) : 0,
        };
    }
    return Object.keys(parsedStats).length > 0 ? parsedStats : null;
}

export const playerTools: Tool[] = [
    {
        name: 'get_player_quests',
        title: 'Get Player Quest Journal',
        description: "Read a public RS3 character's complete Jagex Player Data quest journal. Use get_player_skills for current levels, get_player_stats for hiscores ranks, or get_wiki_entity_facts with kind=quest for one quest's metadata. If listed, recommend_next_activity offers paid advice.\n\n- username is the character's display name, not a Jagex login, account ID or quest name. No signed-in-player default exists; ask which character when unknown.\n- Send {\"username\":\"A B\"}, not {\"username\":\"A%20B\"}. The server trims outer whitespace and encodes the name once. The returned username echoes that input; no alias or canonical-identity lookup is performed.\n- No gameMode or quest/status selector applies. Filter the complete returned journal locally; there is no pagination. A quest's members flag does not establish current account membership.\n- Invalid names, private/unavailable or malformed journals return isError/text, not an empty journal or guessed progress.\n- Sends the display name to the Jagex Player Data API for one uncached read (Jagex syncs on logout, world hop and periodically, and may serve data up to 10 minutes old; non-members may be refused), with a 12-second default deadline and no automatic retry. No Jev, API key, login or game changes. HTTP shares 60 requests/IP/minute by default; honor Retry-After on 429.",
        inputSchema: {
            $schema: JSON_SCHEMA_2020_12, type: 'object',
            properties: { username: { type: 'string', minLength: 1, maxLength: 12, description: 'Exact RS3 player display name' } },
            required: ['username'], additionalProperties: false,
        },
        outputSchema: {
            $schema: JSON_SCHEMA_2020_12, type: 'object',
            properties: {
                username: { type: 'string', description: 'Trimmed input echoed back; not a separate canonical-identity lookup' },
                source: { type: 'string', format: 'uri', description: 'Jagex Player Data API request URL' },
                fetchedAt: { type: 'string', format: 'date-time', description: 'UTC retrieval time for this uncached journal' },
                quests: { type: 'array', minItems: 1, maxItems: 600,
                    description: 'Complete journal entries returned by the Jagex Player Data API',
                    items: { type: 'object', properties: {
                        title: { type: 'string', minLength: 1, maxLength: 255, description: 'Quest title from the public journal' },
                        status: { type: 'string', enum: ['COMPLETED', 'STARTED', 'NOT_STARTED'], description: 'Reported player progress for this quest' },
                        members: { type: 'boolean', description: 'Whether this quest requires membership; not the account membership state' },
                        userEligible: { type: 'boolean', description: 'Jagex eligibility flag; not independent verification of equipment, budget or every condition' },
                        questPoints: { type: 'integer', minimum: 0, description: 'Quest-point value reported by the Jagex Player Data API' },
                    }, required: ['title', 'status', 'members', 'userEligible', 'questPoints'], additionalProperties: false },
                },
                counts: { type: 'object', description: 'Counts over the returned journal: completed + started + notStarted equals total.', properties: {
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
            "Read an RS3 player's published hiscores ranks, levels and experience, including Overall. Use it for ranks or a specific leaderboard; get_player_skills has fresher levels and XP. Use search_wiki for training guides rather than player data.\n" +
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
    {
        name: 'get_player_skills',
        title: 'Get Player Skills',
        description:
            "Read an RS3 character's current skill levels and XP from Jagex Player Data, which syncs during play and is usually fresher than the hiscores. It has no ranks or Overall row; use get_player_stats for ranks or a specific leaderboard.\n" +
            "- username is the character's display name; send it with spaces, not URL-encoded. No gameMode applies: levels belong to the account, not a leaderboard.\n" +
            "- If Player Data refuses the player (not found, hidden, non-member or malformed), the tool falls back to the normal hiscores board, which also lists ironmen, and reports source=hiscores with fallbackReason. Hiscore skills with no stored data are omitted.\n" +
            "- Experience is whole XP (Player Data fine_xp / 10, rounded down). Jagex may serve Player Data up to 10 minutes old.\n" +
            "- No login, account changes or local cache; 12-second default deadline, no automatic retry. HTTP shares 60 requests/IP/minute by default; honor Retry-After on 429.",
        inputSchema: {
            $schema: JSON_SCHEMA_2020_12, type: 'object',
            properties: { username: { type: 'string', minLength: 1, maxLength: 12, description: 'Exact RS3 player display name' } },
            required: ['username'], additionalProperties: false,
        },
        outputSchema: {
            $schema: JSON_SCHEMA_2020_12, type: 'object',
            properties: {
                username: { type: 'string', description: 'Trimmed input echoed back; not a separate canonical-identity lookup' },
                source: { type: 'string', enum: ['player_data', 'hiscores'], description: 'player_data, or hiscores when Player Data refused the player' },
                sourceUrl: { type: 'string', format: 'uri', description: 'Request URL that supplied the skills' },
                fetchedAt: { type: 'string', format: 'date-time', description: 'UTC retrieval time for this uncached read' },
                fallbackReason: { type: 'string', description: 'Why Player Data was not used; present only when source is hiscores' },
                skills: {
                    type: 'object',
                    description: 'Map of RS3 skill name (same names as get_player_stats, without Overall) to level and XP',
                    additionalProperties: {
                        type: 'object',
                        properties: {
                            level: { type: 'integer', minimum: 0, description: 'Skill level' },
                            experience: { type: 'integer', minimum: 0, description: 'Whole skill experience' },
                        },
                        required: ['level', 'experience'],
                        additionalProperties: false,
                    },
                },
            },
            required: ['username', 'source', 'sourceUrl', 'fetchedAt', 'skills'],
            additionalProperties: false,
        },
        ...READ_ONLY_TOOL,
    },
];

export async function handlePlayerTool(name: string, args: ToolArguments, signal?: AbortSignal): Promise<ToolResponse> {
    switch (name) {
        case 'get_player_quests': {
            const unexpected = rejectUnknownKeys(args, ['username']);
            if (unexpected) return unexpected;
            const username = requireString(typeof args?.username === 'string' ? args.username.trim() : args?.username,
                'username', { minLength: 1, maxLength: 12 });
            if (isToolResponse(username)) return username;
            return createSuccessResponse(`Quest journal for ${username}`, await fetchPlayerQuests(username,
                signal ?? AbortSignal.timeout(12_000)));
        }
        case 'get_player_skills': {
            const unexpected = rejectUnknownKeys(args, ['username']);
            if (unexpected) return unexpected;
            const username = requireString(typeof args?.username === 'string' ? args.username.trim() : args?.username,
                'username', { minLength: 1, maxLength: 12 });
            if (isToolResponse(username)) return username;
            const deadline = signal ?? AbortSignal.timeout(12_000);
            try {
                return createSuccessResponse(`Skills for ${username}`, await fetchPlayerSkills(username, deadline));
            } catch (error) {
                const fallbackReason = playerDataFailure(error);
                if (!fallbackReason) throw error;
                // The normal board lists every player type, so it is the right fallback for account levels.
                const hiscores = await handlePlayerTool('get_player_stats', { username }, deadline);
                if (hiscores.isError) {
                    return validationError(`${fallbackReason} Hiscores fallback: ${hiscores.content[0].text}`);
                }
                const skills: Record<string, SkillRow> = {};
                for (const [skill, row] of Object.entries(hiscores.structuredContent ?? {})) {
                    const { level, experience } = row as SkillRow;
                    if (skill !== 'Overall' && level > 0) skills[skill] = { level, experience };
                }
                return createSuccessResponse(`Skills for ${username} (hiscores fallback)`, {
                    username, source: 'hiscores',
                    sourceUrl: `${RS3_HISCORES_ORIGIN}${GAME_MODE_PATHS.normal}?player=${encodeURIComponent(username)}`,
                    fetchedAt: new Date().toISOString(), fallbackReason, skills,
                });
            }
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

            let data: unknown;
            try {
                data = await makeApiRequest(url, signal);
            } catch (error) {
                if (error instanceof ApiRequestError && error.status === 404) {
                    return validationError(
                        `Player "${username}" was not found on the ${gameMode} hiscores (HTTP 404). ` +
                            'Check the display name and selected leaderboard. No other board was queried.'
                    );
                }
                // fetch's JSON parser may throw a SyntaxError from another realm, so match by name.
                if ((error as { name?: unknown } | null)?.name === 'SyntaxError') {
                    return validationError(`Unexpected hiscores response for "${username}" (${gameMode}).`);
                }
                throw error;
            }

            const parsedStats = parseHiscoreSkills(data);
            if (!parsedStats) {
                return validationError(
                    `Unexpected hiscores response for "${username}" (${gameMode}).`
                );
            }

            return createSuccessResponse(`Player Stats for ${username} (${gameMode})`, parsedStats);
        }

        default:
            throw new Error(`Unknown player tool: ${name}`);
    }
}
