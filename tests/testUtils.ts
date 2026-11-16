// Simple test utilities - no complex mocking

// Mock API response data
export const mockResponses = {
    itemMapping: [
        {
            id: 4151,
            name: "Abyssal whip",
            examine: "A weapon from the abyss.",
            members: true,
            lowalch: 72000,
            highalch: 120000,
            limit: 70,
            value: 120001,
            icon: "Abyssal whip.png"
        }
    ],

    latestPrices: {
        "4151": {
            high: 2400000,
            highTime: 1640995200,
            low: 2350000,
            lowTime: 1640995200
        }
    },

    itemDetail: {
        item: {
            id: 4151,
            name: "Abyssal whip",
            description: "A weapon from the abyss.",
            type: "Melee weapons - high level",
            members: "true",
            current: { trend: "neutral", price: "2.4m" }
        }
    },

    playerStats: hiscoresJson([[55, 2736, 5400000000], [493, 99, 200000000], [966, 99, 200000000]]),

    geInfo: {
        lastConfigUpdateRuneday: 1640995200
    }
};

// Builds a Platform API Index Lite body (index_lite.json) from [rank, level, xp] rows in skill-id order.
// Names mirror the live API (e.g. Hitpoints), not the tool's output keys.
export function hiscoresJson(rows: Array<[number, number, number]>, name = 'TestPlayer') {
    const names = ['Overall', 'Attack', 'Defence', 'Strength', 'Hitpoints', 'Ranged'];
    return {
        name,
        skills: rows.map(([rank, level, xp], id) => ({ id, name: names[id] ?? `Skill ${id}`, rank, level, xp })),
        activities: [{ id: 0, name: 'Grid Points', rank: -1, score: 0 }],
    };
}

// Helper to validate tool response structure
export function validateToolResponse(response: any) {
    expect(response).toHaveProperty('content');
    expect(Array.isArray(response.content)).toBe(true);
    expect(response.content[0]).toHaveProperty('type', 'text');
    expect(response.content[0]).toHaveProperty('text');
} 
type JournalFixture = { title: string; status: string; members: boolean; userEligible: boolean; questPoints: number };

/** Path and reply body for the Jagex Player Data API quest journal (replaced RuneMetrics). */
export function playerDataPath(username: string): string {
    return `/m=adventurers-log/api/v1/playerData/${encodeURIComponent(username)}`;
}

export function playerDataQuests(quests: JournalFixture[]) {
    return { name: 'Fixture', qp: 0, qp_max: 0, quests: Object.fromEntries(quests.map((quest, index) => [String(index + 1), {
        title: quest.title, status: quest.status, members: quest.members, eligible: quest.userEligible,
        qp: quest.questPoints, difficulty: 0,
    }])) };
}
