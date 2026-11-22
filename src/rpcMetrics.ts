import { isJSONRPCNotification, isJSONRPCRequest, type RequestId } from '@modelcontextprotocol/server';
import * as Sentry from '@sentry/node';
import { debugLog } from './utils.js';

const rpcMethods = new Set([
    'initialize', 'notifications/initialized', 'server/discover', 'ping',
    'tools/list', 'tools/call', 'resources/list', 'resources/read', 'resources/templates/list',
    'prompts/list', 'prompts/get', 'completion/complete', 'logging/setLevel',
    'resources/subscribe', 'resources/unsubscribe', 'subscriptions/listen',
    'notifications/cancelled', 'notifications/progress', 'notifications/roots/list_changed',
    'tasks/list', 'tasks/get', 'tasks/result', 'tasks/cancel',
]);

export interface RpcMetrics {
    trafficSource: 'public' | 'smoke_test';
    pendingTools: Map<RequestId, number>;
}

export type ToolOutcome = 'success' | 'failed' | 'aborted';

export function trackRpcMethods(metrics: RpcMetrics, body: unknown): void {
    const received = new Map<string, number>();
    for (const message of Array.isArray(body) ? body : [body]) {
        const request = isJSONRPCRequest(message);
        if (!request && !isJSONRPCNotification(message)) continue;
        if (request && message.method === 'tools/call') {
            metrics.pendingTools.set(message.id, (metrics.pendingTools.get(message.id) ?? 0) + 1);
            continue;
        }
        // Keep unrecognized client strings out of the metric dimensions.
        const method = rpcMethods.has(message.method) ? message.method : 'other';
        received.set(method, (received.get(method) ?? 0) + 1);
    }
    for (const [method, count] of received) countRpc(metrics, method, 'received', count);
}

export function trackToolResult(metrics: RpcMetrics, id: RequestId, outcome: ToolOutcome): void {
    const count = metrics.pendingTools.get(id);
    if (count === undefined) return;
    if (count === 1) metrics.pendingTools.delete(id);
    else metrics.pendingTools.set(id, count - 1);
    countRpc(metrics, 'tools/call', outcome);
}

export function finishRpcMetrics(metrics: RpcMetrics, aborted: boolean): void {
    // The SDK can reject a tool request before calling the registered handler.
    let remaining = 0;
    for (const count of metrics.pendingTools.values()) remaining += count;
    metrics.pendingTools.clear();
    if (remaining) countRpc(metrics, 'tools/call', aborted ? 'aborted' : 'failed', remaining);
}

function countRpc(metrics: RpcMetrics, method: string, outcome: ToolOutcome | 'received', count = 1): void {
    try {
        Sentry.metrics.count('runescape.mcp.rpc.message', count, {
            attributes: { rpc_method: method, outcome, traffic_source: metrics.trafficSource },
        });
    } catch {
        debugLog('Could not record MCP method metric');
    }
}
