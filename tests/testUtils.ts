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

    playerStats: "55,2736,5400000000\n493,99,200000000\n966,99,200000000",

    geInfo: {
        lastConfigUpdateRuneday: 1640995200
    }
};

// Helper to validate tool response structure
export function validateToolResponse(response: any) {
    expect(response).toHaveProperty('content');
    expect(Array.isArray(response.content)).toBe(true);
    expect(response.content[0]).toHaveProperty('type', 'text');
    expect(response.content[0]).toHaveProperty('text');
} 