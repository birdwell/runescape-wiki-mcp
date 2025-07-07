// Types for RuneScape Wiki MCP Server

export interface PlayerStats {
    rank: number | 'Unranked';
    level: number;
    experience: number;
}

export interface PlayerStatsResponse {
    [skillName: string]: PlayerStats;
}

export interface ItemMapping {
    id: number;
    name: string;
    examine: string;
    members: boolean;
    lowalch: number;
    highalch: number;
    limit: number;
    value: number;
    icon: string;
}

export interface PriceData {
    high?: number;
    highTime?: number;
    low?: number;
    lowTime?: number;
}

export interface TimeSeriesData {
    [timestamp: string]: number;
}

export interface ItemDetail {
    item: {
        id: number;
        name: string;
        description: string;
        type: string;
        typeIcon: string;
        icon: string;
        icon_large: string;
        members: string;
        current: {
            trend: string;
            price: string;
        };
        today: {
            trend: string;
            price: string;
        };
        day30?: {
            trend: string;
            change: string;
        };
        day90?: {
            trend: string;
            change: string;
        };
        day180?: {
            trend: string;
            change: string;
        };
    };
}

export interface ItemGraph {
    daily: TimeSeriesData;
    average: TimeSeriesData;
}

export interface CategoryItems {
    total: number;
    items: Array<{
        id: number;
        name: string;
        description: string;
        type: string;
        typeIcon: string;
        icon: string;
        icon_large: string;
        members: string;
        current: {
            trend: string;
            price: string;
        };
        today: {
            trend: string;
            price: string;
        };
    }>;
}

export interface GEInfo {
    lastConfigUpdateRuneday: number;
}

export type GameMode = 'normal' | 'ironman' | 'hardcore';
export type TimeStep = '5m' | '1h' | '6h' | '24h';

export interface ToolArguments {
    [key: string]: any;
}

export interface ToolResponse {
    content: Array<{
        type: 'text';
        text: string;
    }>;
    isError?: boolean;
} 