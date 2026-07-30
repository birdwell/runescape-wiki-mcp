// Types for RuneScape Wiki MCP Server

export interface PlayerStats {
    rank: number | 'Unranked';
    level: number;
    experience: number;
}

export interface PlayerStatsResponse {
    [skillName: string]: PlayerStats;
}

export type GameMode = 'normal' | 'ironman' | 'hardcore';

export interface ItemLookupMatch {
    id: number;
    name: string;
    price?: number;
    volume?: number;
    timestamp?: string;
    wikiUrl?: string;
}

export interface ToolArguments {
    [key: string]: unknown;
}

export interface ToolResponse {
    content: Array<{
        type: 'text';
        text: string;
    }>;
    isError?: boolean;
}
