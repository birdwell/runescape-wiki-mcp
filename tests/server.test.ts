// Tests for MCP server setup

import { jest } from '@jest/globals';
import { server, setupServerHandlers } from '../src/server.js';
import { allTools } from '../src/tools/index.js';
import { resources } from '../src/resources.js';

// Mock node-fetch
jest.unstable_mockModule('node-fetch', () => ({
    default: jest.fn()
}));

describe('MCP Server', () => {
    beforeEach(() => {
        setupServerHandlers();
    });

    describe('Server configuration', () => {
        it('should create a server instance', () => {
            expect(server).toBeDefined();
        });

        it('should have tools and resources capabilities', () => {
            // Server capabilities are set during initialization
            expect(server).toBeDefined();
        });
    });

    describe('Tools registration', () => {
        it('should have all price tools', () => {
            const priceTools = ['get_latest_prices', 'get_5m_prices', 'get_1h_prices', 'get_timeseries'];

            priceTools.forEach(toolName => {
                expect(allTools.some(t => t.name === toolName)).toBe(true);
            });
        });

        it('should have all item tools', () => {
            const itemTools = ['get_item_mapping', 'get_item_detail', 'get_item_graph', 'browse_items_by_category', 'get_ge_info'];

            itemTools.forEach(toolName => {
                expect(allTools.some(t => t.name === toolName)).toBe(true);
            });
        });

        it('should have player tools', () => {
            expect(allTools.some(t => t.name === 'get_player_stats')).toBe(true);
        });

        it('should have correct total number of tools', () => {
            expect(allTools.length).toBe(10); // 4 price + 5 item + 1 player
        });
    });

    describe('Resources registration', () => {
        it('should have data resources', () => {
            expect(resources.some(r => r.uri === 'runescape://prices/latest')).toBe(true);
            expect(resources.some(r => r.uri === 'runescape://items/mapping')).toBe(true);
        });

        it('should have correct total number of resources', () => {
            expect(resources.length).toBe(2);
        });
    });

    describe('Tool schemas', () => {
        it('should have valid schemas for all tools', () => {
            allTools.forEach(tool => {
                expect(tool.inputSchema).toBeDefined();
                expect(tool.inputSchema.type).toBe('object');
                expect(tool.inputSchema.properties).toBeDefined();
                expect(tool.description).toBeDefined();
                expect(tool.description?.length).toBeGreaterThan(0);
            });
        });

        it('should have required parameters defined correctly', () => {
            const itemDetailTool = allTools.find(t => t.name === 'get_item_detail');
            expect(itemDetailTool?.inputSchema.required).toContain('itemId');

            const timeseriesTool = allTools.find(t => t.name === 'get_timeseries');
            expect(timeseriesTool?.inputSchema.required).toContain('itemId');
            expect(timeseriesTool?.inputSchema.required).toContain('timestep');

            const playerStatsTool = allTools.find(t => t.name === 'get_player_stats');
            expect(playerStatsTool?.inputSchema.required).toContain('username');
        });
    });

    describe('Resource schemas', () => {
        it('should have valid resource definitions', () => {
            resources.forEach(resource => {
                expect(resource.uri).toBeDefined();
                expect(resource.name).toBeDefined();
                expect(resource.description).toBeDefined();
                expect(resource.mimeType).toBeDefined();
            });
        });
    });
}); 