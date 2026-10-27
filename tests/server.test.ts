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
                'get_price_series',
                'get_item_details',
                'get_ge_info',
                'browse_items',
                'estimate_flip',
                'get_player_stats',
                'get_player_quests',
                'search_wiki',
                'get_wiki_page_content',
                'recommend_next_activity',
                'get_wiki_entity_facts',
                'list_wiki_category_members',
                'get_wiki_drop_table',
            ];

            expected.forEach(toolName => {
                expect(allTools.some(t => t.name === toolName)).toBe(true);
            });

            expect(allTools).toHaveLength(expected.length);
            expect(allTools.some(t => t.name === 'get_all_categories' || t.name === 'get_category_info')).toBe(false);

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

            const price = allTools.find(t => t.name === 'get_item_details');
            expect(price?.inputSchema.properties).toHaveProperty('itemId');
            expect(price?.inputSchema.properties).not.toHaveProperty('name');
            for (const name of ['get_price_series','estimate_flip']) expect(allTools.find(t => t.name === name)?.inputSchema.properties).not.toHaveProperty('name');
            expect(allTools.some(t => t.name === 'compare_item_prices')).toBe(false);
            const history = allTools.find(t => t.name === 'get_price_series')?.inputSchema as any;
            expect(history.properties.days.default).toBeUndefined();
            expect(history.properties.source.default).toBeUndefined();
            expect(history.oneOf[1].properties.days.default).toBe(30);
            expect(allTools.some(t => t.name === 'summarize_price_history')).toBe(false);

            const browse = allTools.find(t => t.name === 'browse_items');
            expect(browse?.inputSchema.required).toContain('category');

            const player = allTools.find(t => t.name === 'get_player_stats');
            expect(player?.inputSchema.required).toContain('username');
        });
    });
});
