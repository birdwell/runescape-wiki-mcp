import { describe, expect, it } from '@jest/globals';
import { finishRpcMetrics, trackRpcMethods, trackToolResult, type RpcMetrics } from '../src/rpcMetrics.js';
import { isKnownToolName } from '../src/tools/index.js';

function call(id: number, name: string) {
    return { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: {} } };
}

describe('rpc metrics', () => {
    it('matches out-of-order results to the tool that finished', () => {
        const metrics: RpcMetrics = { trafficSource: 'public', pendingTools: new Map() };
        // A legacy batch can repeat an id across different tools.
        trackRpcMethods(metrics, [call(7, 'estimate_flip'), call(7, 'get_ge_info'), call(7, 'estimate_flip')]);
        expect(metrics.pendingTools.get(7)).toEqual(['estimate_flip', 'get_ge_info', 'estimate_flip']);

        trackToolResult(metrics, 7, 'success', 'get_ge_info');
        expect(metrics.pendingTools.get(7)).toEqual(['estimate_flip', 'estimate_flip']);
        trackToolResult(metrics, 7, 'failed', 'estimate_flip');
        expect(metrics.pendingTools.get(7)).toEqual(['estimate_flip']);
        finishRpcMetrics(metrics, false);
        expect(metrics.pendingTools.size).toBe(0);
    });

    it('bounds unknown names but keeps every accepted alias', () => {
        const metrics: RpcMetrics = { trafficSource: 'public', pendingTools: new Map() };
        trackRpcMethods(metrics, [call(1, 'no_such_tool'), call(2, 'compare_item_prices')]);
        expect(metrics.pendingTools.get(1)).toEqual(['other']);
        expect(metrics.pendingTools.get(2)).toEqual(['compare_item_prices']);

        trackToolResult(metrics, 1, 'failed', 'no_such_tool');
        expect(metrics.pendingTools.has(1)).toBe(false);
    });

    it.each([
        'get_item_details', 'get_item_price', 'get_price_series', 'get_item_graph', 'compare_item_prices',
        'compare_items', 'get_all_categories', 'get_category_info', 'summarize_price_history', 'lookup_item',
    ])('accepts %s as a known tool name', name => {
        expect(isKnownToolName(name)).toBe(true);
    });

    it('rejects names the dispatcher does not handle', () => {
        expect(isKnownToolName('unknown_tool')).toBe(false);
        expect(isKnownToolName('')).toBe(false);
    });
});
