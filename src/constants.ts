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
    'RuneScape Wiki MCP Server - github.com/joshbirdwell/runescape-wiki-mcp';

// Server configuration
export const SERVER_CONFIG = {
    name: 'runescape-wiki-mcp',
    version: '1.1.0',
    description:
        'RS3 Grand Exchange prices, item lookup, player hiscores, and RuneScape Wiki content',
} as const;

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
