// Constants for RuneScape Wiki MCP Server

// API Base URLs
export const RS3_GE_API = 'https://secure.runescape.com/m=itemdb_rs/api';
/** @deprecated Use RS3_GE_API */
export const RS3_PRICES_API = RS3_GE_API;
/** @deprecated Use RS3_GE_API */
export const RS_GE_API = RS3_GE_API;

export const RS3_HISCORES_ORIGIN = 'https://secure.runescape.com';
export const RUNESCAPE_WIKI_API = 'https://runescape.wiki/api.php';
export const WEIRDGLOOP_EXCHANGE_API = 'https://api.weirdgloop.org/exchange/history/rs';

// Full hiscores lite paths. Ironman/hardcore are documented by Jagex but currently
// return HTTP 404 from secure.runescape.com; handlers surface that clearly.
export const GAME_MODE_PATHS = {
    normal: '/m=hiscore/index_lite.ws',
    ironman: '/m=hiscore_ironman/index_lite.ws',
    hardcore: '/m=hiscore_hardcore_ironman/index_lite.ws',
} as const;

// User agent for API requests
export const USER_AGENT =
    'RuneScape Wiki MCP Server - github.com/birdwell/runescape-wiki-mcp';

/** Official MCP Registry name (GitHub namespace). */
export const REGISTRY_NAME = 'io.github.birdwell/runescape-wiki-mcp';
export const SERVER_TITLE = 'RuneScape 3 MCP Server';
export const PUBLIC_ORIGIN = 'https://runescape-wiki-mcp.fly.dev';
export const MCP_PATH = '/mcp';
export const REPOSITORY_URL = 'https://github.com/birdwell/runescape-wiki-mcp';
/** GitHub repository id. Stable across renames. */
export const REPOSITORY_ID = '1047256430';

// Server configuration. description stays within the 100-character server-card limit.
export const SERVER_CONFIG = {
    name: 'runescape-wiki-mcp',
    version: '1.2.0',
    description:
        'RS3 guide prices and history, flip tax, hiscores, and wiki. Lags the live GE.',
} as const;

/** Shown to MCP clients before they pick a tool. */
export const SERVER_INSTRUCTIONS =
    'RS3 only. Prices are Jagex guide prices and Weirdgloop daily history, and they lag the live high/low market at prices.runescape.wiki. Do not call them real-time. Do not rank the whole Grand Exchange. Resolve names with lookup_item. get_player_stats works for normal mode; ironman and hardcore currently return HTTP 404 from Jagex. get_player_quests reads the complete public RuneMetrics journal without Jev. estimate_flip is an estimate after the 2% seller tax. recommend_next_activity is opt-in and paid: for quest goals pass a username and goal such as best mining quest; it compares unfinished quests using sourced rewards and requirements and returns guide summaries. Communicate membership, inventory, combat and other unverified conditions. Unofficial, not affiliated with Jagex or the RuneScape Wiki.';

// RuneScape 3 skills in order (30 skills total)
export const RS3_SKILLS = [
    'Overall',
    'Attack',
    'Defence',
    'Strength',
    'Constitution',
    'Ranged',
    'Prayer',
    'Magic',
    'Cooking',
    'Woodcutting',
    'Fletching',
    'Fishing',
    'Firemaking',
    'Crafting',
    'Smithing',
    'Mining',
    'Herblore',
    'Agility',
    'Thieving',
    'Slayer',
    'Farming',
    'Runecrafting',
    'Hunter',
    'Construction',
    'Summoning',
    'Dungeoneering',
    'Divination',
    'Invention',
    'Archaeology',
    'Necromancy',
] as const;

// MCP Resource URIs
export const RESOURCE_URIS = {
    GE_INFO: 'runescape://ge/info',
    GE_CATEGORIES: 'runescape://ge/categories',
} as const;
