// Tests for MCP server

import { describe, it, expect } from '@jest/globals';
import { createServer } from '../src/server.js';
import { allTools } from '../src/tools/index.js';
import { resources } from '../src/resources.js';
import { RESOURCE_URIS } from '../src/constants.js';

describe('MCP Server', () => {
    it('should create a configured server instance', () => {
        expect(createServer()).toBeDefined();
    });

    describe('Tools registration', () => {
        it('should expose the consolidated tool surface', () => {
            const expected = [
                'lookup_item',
                'get_item_graph',
                'get_item_price',
                'get_ge_info',
                'get_category_info',
                'get_all_categories',
                'browse_items',
                'summarize_price_history',
                'compare_items',
                'estimate_flip',
                'get_player_stats',
                'get_wiki_page_content',
            ];

            expected.forEach(toolName => {
                expect(allTools.some(t => t.name === toolName)).toBe(true);
            });

            // Removed duplicates / obsolete tools
            expect(allTools.some(t => t.name === 'get_item_detail')).toBe(false);
            expect(allTools.some(t => t.name === 'search_items')).toBe(false);
            expect(allTools.some(t => t.name === 'browse_items_by_category')).toBe(false);
        });

        it('should have unique tool names', () => {
            const names = allTools.map(t => t.name);
            expect(new Set(names).size).toBe(names.length);
        });
    });

    describe('Resources registration', () => {
        it('should have honest GE resources', () => {
            expect(resources.some(r => r.uri === RESOURCE_URIS.GE_INFO)).toBe(true);
            expect(resources.some(r => r.uri === RESOURCE_URIS.GE_CATEGORIES)).toBe(true);
        });
    });

    describe('Tool schemas', () => {
        it('should document lookup and flexible price args', () => {
            const lookup = allTools.find(t => t.name === 'lookup_item');
            expect(lookup?.inputSchema.required).toContain('query');

            const price = allTools.find(t => t.name === 'get_item_price');
            expect(price?.inputSchema.properties).toHaveProperty('itemId');
            expect(price?.inputSchema.properties).toHaveProperty('name');

            const browse = allTools.find(t => t.name === 'browse_items');
            expect(browse?.inputSchema.required).toContain('category');

            const player = allTools.find(t => t.name === 'get_player_stats');
            expect(player?.inputSchema.required).toContain('username');
        });
    });
});
