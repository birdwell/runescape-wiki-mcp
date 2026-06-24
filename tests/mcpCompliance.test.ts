// MCP specification compliance tests

import { describe, it, expect } from '@jest/globals';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { handleTool } from '../src/tools/index.js';
import { handlePriceTool } from '../src/tools/priceTools.js';

describe('MCP specification compliance', () => {
    it('should throw protocol error for unknown tools', async () => {
        await expect(handleTool('not_a_real_tool', {})).rejects.toBeInstanceOf(McpError);
        await expect(handleTool('not_a_real_tool', {})).rejects.toMatchObject({
            code: ErrorCode.InvalidParams,
            message: 'MCP error -32602: Unknown tool: not_a_real_tool',
        });
    });

    it('should return tool execution errors for missing required arguments', async () => {
        const result = await handlePriceTool('get_item_price', {});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe('itemId is required');
    });

    it('should return tool execution errors for invalid argument types', async () => {
        const result = await handlePriceTool('get_item_price', { itemId: 'not-a-number' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe('itemId must be an integer');
    });
});
