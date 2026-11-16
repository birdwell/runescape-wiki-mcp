import { z } from 'zod';
import type { RS3_SKILLS } from './constants.js';
import { PLAYER_DATA_API, PlayerDataError, requestPlayerData } from './questData.js';

type SkillName = Exclude<(typeof RS3_SKILLS)[number], 'Overall'>;

// Player Data skill keys (documented internal names) mapped to the names get_player_stats uses.
// https://developer.runescape.com/platform/modules/adventurers-log/player-data.html
const PLAYER_DATA_SKILLS: Record<string, SkillName> = {
    attack: 'Attack', defence: 'Defence', strength: 'Strength', hitpoints: 'Constitution', ranged: 'Ranged',
    prayer: 'Prayer', magic: 'Magic', cooking: 'Cooking', woodcutting: 'Woodcutting', fletching: 'Fletching',
    fishing: 'Fishing', firemaking: 'Firemaking', crafting: 'Crafting', smithing: 'Smithing', mining: 'Mining',
    herblore: 'Herblore', agility: 'Agility', thieving: 'Thieving', slayer: 'Slayer', farming: 'Farming',
    runecraft: 'Runecrafting', hunter: 'Hunter', construction: 'Construction', summoning: 'Summoning',
    dungeoneering: 'Dungeoneering', divination: 'Divination', invention: 'Invention', archaeology: 'Archaeology',
    necromancy: 'Necromancy',
};

const playerDataSkillsSchema = z.object({ skills: z.record(z.string(), z.object({
    fine_xp: z.number().int().nonnegative(),
    level: z.number().int().nonnegative(),
})) });

const MALFORMED_SKILLS = 'Jagex Player Data API returned unavailable or malformed skill data. No skill levels were inferred.';

export interface SkillRow { level: number; experience: number }

/**
 * Current levels and XP from Jagex Player Data. It syncs during play as well as on logout,
 * so it is usually fresher than the hiscores, but it has no ranks.
 */
export async function fetchPlayerSkills(username: string, signal?: AbortSignal) {
    const sourceUrl = `${PLAYER_DATA_API}/${encodeURIComponent(username)}?includeSkills=true`;
    const parsed = playerDataSkillsSchema.safeParse(await requestPlayerData(sourceUrl, signal, 'skill', MALFORMED_SKILLS));
    const skills: Partial<Record<SkillName, SkillRow>> = {};
    if (parsed.success) {
        for (const [key, { fine_xp: fineXp, level }] of Object.entries(parsed.data.skills)) {
            const skill = PLAYER_DATA_SKILLS[key];
            // fine_xp is XP x 10; floor it to the whole XP the game and hiscores show.
            if (skill) skills[skill] = { level, experience: Math.floor(fineXp / 10) };
        }
    }
    if (Object.keys(skills).length === 0) throw new PlayerDataError(MALFORMED_SKILLS);
    return { username, source: 'player_data' as const, sourceUrl, fetchedAt: new Date().toISOString(), skills };
}
