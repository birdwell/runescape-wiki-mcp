// Tests for MCP server
import { describe, it, expect } from '@jest/globals';
import { server, setupServerHandlers } from '../src/server.js';
import { allTools } from '../src/tools/index.js';
import { resources } from '../src/resources.js';

describe('MCP Server', () => {
    beforeEach(() => {
        setupServerHandlers();
    });

    describe('Tools registration', () => {
        it('should have all price tools', () => {
            const priceTools = [
                'get_item_price',
                'get_ge_info',
                'get_category_info',
                'search_items'
            ];

            priceTools.forEach(toolName => {
                expect(allTools.some(t => t.name === toolName)).toBe(true);
            });
        });

        it('should have all item tools', () => {
            const itemTools = [
                'get_item_detail',
                'get_item_graph',
                'browse_items_by_category',
                'get_ge_info'
            ];

            // Note: get_ge_info appears in both price and item tools
            itemTools.forEach(toolName => {
                expect(allTools.some(t => t.name === toolName)).toBe(true);
            });
        });

        it('should have all player tools', () => {
            const playerTools = [
                'get_player_stats'
            ];

            playerTools.forEach(toolName => {
                expect(allTools.some(t => t.name === toolName)).toBe(true);
            });
        });
    });

    describe('Resources registration', () => {
        it('should have required resources', () => {
            expect(resources).toBeDefined();
            expect(resources.length).toBeGreaterThan(0);

            // Check specific resources
            expect(resources.some(r => r.uri === 'runescape://prices/latest')).toBe(true);
            expect(resources.some(r => r.uri === 'runescape://items/mapping')).toBe(true);
        });
    });

    describe('Tool schemas', () => {
        it('should have required parameters defined correctly', () => {
            const itemPriceTool = allTools.find(t => t.name === 'get_item_price');
            expect(itemPriceTool?.inputSchema.required).toContain('itemId');

            const categoryInfoTool = allTools.find(t => t.name === 'get_category_info');
            expect(categoryInfoTool?.inputSchema.required).toContain('category');

            const searchItemsTool = allTools.find(t => t.name === 'search_items');
            expect(searchItemsTool?.inputSchema.required).toContain('category');
            expect(searchItemsTool?.inputSchema.required).toContain('alpha');

            const playerStatsTool = allTools.find(t => t.name === 'get_player_stats');
            expect(playerStatsTool?.inputSchema.required).toContain('username');
        });
    });
}); 