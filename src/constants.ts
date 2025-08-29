// Constants for RuneScape Wiki MCP Server

// API Base URLs
export const RS3_PRICES_API = 'https://secure.runescape.com/m=itemdb_rs/api';
export const RS_GE_API = 'https://secure.runescape.com/m=itemdb_rs/api';
export const RS3_HISCORES_API = 'https://secure.runescape.com/m=hiscore';
export const RUNESCAPE_WIKI_API = 'https://runescape.wiki/api.php';

// User agent for API requests
export const USER_AGENT = 'RuneScape Wiki MCP Server - github.com/user/runescape-wiki-mcp';

// Server configuration
export const SERVER_CONFIG = {
    name: 'runescape-wiki-mcp',
    version: '1.0.0',
} as const;

// RuneScape 3 skills in order (30 skills total)
export const RS3_SKILLS = [
    'Overall', 'Attack', 'Defence', 'Strength', 'Constitution', 'Ranged', 'Prayer',
    'Magic', 'Cooking', 'Woodcutting', 'Fletching', 'Fishing', 'Firemaking',
    'Crafting', 'Smithing', 'Mining', 'Herblore', 'Agility', 'Thieving',
    'Slayer', 'Farming', 'Runecrafting', 'Hunter', 'Construction', 'Summoning',
    'Dungeoneering', 'Divination', 'Invention', 'Archaeology', 'Necromancy'
] as const;

// Game mode endpoints
export const GAME_MODE_ENDPOINTS = {
    normal: 'm=hiscore/index_lite.ws',
    ironman: 'm=hiscore_ironman/index_lite.ws',
    hardcore: 'm=hiscore_hardcore_ironman/index_lite.ws',
} as const;

// MCP Resource URIs
export const RESOURCE_URIS = {
    LATEST_PRICES: 'runescape://prices/latest',
    ITEM_MAPPING: 'runescape://items/mapping',
} as const; 