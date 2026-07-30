// Tests for MCP prompts

import { ProtocolError, ProtocolErrorCode } from '@modelcontextprotocol/server';
import { describe, it, expect } from '@jest/globals';
import { prompts, listPrompts, getPrompt } from '../src/prompts.js';

describe('Prompts', () => {
    describe('listPrompts', () => {
        it('should expose exactly the documented prompts', () => {
            const names = listPrompts().map(p => p.name);
            expect(names).toEqual([
                'check_item_price',
                'compare_ge_items',
                'estimate_item_flip',
                'player_overview',
            ]);
        });

        it('should have unique prompt names', () => {
            const names = prompts.map(p => p.name);
            expect(new Set(names).size).toBe(names.length);
        });

        it('should document required and optional arguments', () => {
            const checkPrice = prompts.find(p => p.name === 'check_item_price');
            expect(checkPrice?.arguments).toEqual([
                expect.objectContaining({ name: 'itemName', required: true }),
            ]);

            const estimateFlip = prompts.find(p => p.name === 'estimate_item_flip');
            expect(estimateFlip?.arguments).toEqual([
                expect.objectContaining({ name: 'itemName', required: true }),
                expect.objectContaining({ name: 'quantity', required: false }),
            ]);
        });

        it('should have a non-empty description for every prompt (Smithery quality)', () => {
            prompts.forEach(prompt => {
                expect(prompt.description).toBeTruthy();
                expect(prompt.description!.length).toBeGreaterThan(20);
            });
        });
    });

    describe('getPrompt', () => {
        it('check_item_price should build a lookup_item -> get_item_price playbook', () => {
            const result = getPrompt('check_item_price', { itemName: 'Abyssal whip' });
            expect(result.messages).toHaveLength(1);
            expect(result.messages[0].role).toBe('user');
            const text = (result.messages[0].content as { text: string }).text;
            expect(text).toContain('lookup_item');
            expect(text).toContain('get_item_price');
            expect(text).toContain('summarize_price_history');
            expect(text).toContain('Abyssal whip');
        });

        it('check_item_price should require itemName', () => {
            expect(() => getPrompt('check_item_price', {})).toThrow(ProtocolError);
            try {
                getPrompt('check_item_price', {});
                throw new Error('expected getPrompt to throw');
            } catch (error) {
                expect(error).toMatchObject({
                    code: ProtocolErrorCode.InvalidParams,
                    message: expect.stringContaining('itemName'),
                });
            }
        });

        it('compare_ge_items should build a compare_items playbook', () => {
            const result = getPrompt('compare_ge_items', {
                items: 'Abyssal whip, Dragon bones',
            });
            const text = (result.messages[0].content as { text: string }).text;
            expect(text).toContain('compare_items');
            expect(text).toContain('Abyssal whip, Dragon bones');
        });

        it('estimate_item_flip should build an estimate_flip playbook and mention quantity when provided', () => {
            const withQuantity = getPrompt('estimate_item_flip', {
                itemName: 'Frost dragon bones',
                quantity: '50',
            });
            const withQuantityText = (withQuantity.messages[0].content as { text: string }).text;
            expect(withQuantityText).toContain('estimate_flip');
            expect(withQuantityText).toContain('quantity=50');

            const withoutQuantity = getPrompt('estimate_item_flip', {
                itemName: 'Frost dragon bones',
            });
            const withoutQuantityText = (withoutQuantity.messages[0].content as { text: string })
                .text;
            expect(withoutQuantityText).toContain('default quantity');
        });

        it('estimate_item_flip should require itemName but not quantity', () => {
            expect(() => getPrompt('estimate_item_flip', {})).toThrow(ProtocolError);
            expect(() =>
                getPrompt('estimate_item_flip', { itemName: 'Frost dragon bones' })
            ).not.toThrow();
        });

        it('player_overview should build a get_player_stats playbook', () => {
            const result = getPrompt('player_overview', { username: 'Zezima' });
            const text = (result.messages[0].content as { text: string }).text;
            expect(text).toContain('get_player_stats');
            expect(text).toContain('gameMode="normal"');
            expect(text).toContain('Zezima');
        });

        it('should throw ProtocolError InvalidParams for an unknown prompt', () => {
            expect(() => getPrompt('not_a_real_prompt', {})).toThrow(ProtocolError);
            try {
                getPrompt('not_a_real_prompt', {});
                throw new Error('expected getPrompt to throw');
            } catch (error) {
                expect(error).toMatchObject({
                    code: ProtocolErrorCode.InvalidParams,
                    message: 'Unknown prompt: not_a_real_prompt',
                });
            }
        });
    });
});
