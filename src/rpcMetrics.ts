import { isJSONRPCNotification, isJSONRPCRequest, type RequestId } from '@modelcontextprotocol/server';
import * as Sentry from '@sentry/node';
import { isKnownToolName } from './tools/index.js';
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
    /** Requested tool names per pending tools/call id, in arrival order. */
    pendingTools: Map<RequestId, string[]>;
}

export type ToolOutcome = 'success' | 'failed' | 'aborted';

export function trackRpcMethods(metrics: RpcMetrics, body: unknown): void {
    const received = new Map<string, number>();
    let toolCall = false;
    for (const message of Array.isArray(body) ? body : [body]) {
        const request = isJSONRPCRequest(message);
        if (!request && !isJSONRPCNotification(message)) continue;
        if (request && message.method === 'tools/call') {
            const names = metrics.pendingTools.get(message.id) ?? [];
            names.push(metricToolName(message.params?.name));
            metrics.pendingTools.set(message.id, names);
            toolCall = true;
            continue;
        }
        // Keep unrecognized client strings out of the metric dimensions.
        const method = rpcMethods.has(message.method) ? message.method : 'other';
        received.set(method, (received.get(method) ?? 0) + 1);
    }
    for (const [method, count] of received) countRpc(metrics, method, 'received', count);
    // Lets Sentry count unique callers that used a tool, apart from setup-only scanners.
    if (toolCall) tagRequestSpan({ 'mcp.tool_call': true });
}

/** Adds attributes to the HTTP request's root span, so trace queries can filter on them. */
export function tagRequestSpan(attributes: Record<string, string | boolean>): void {
    try {
        const span = Sentry.getActiveSpan();
        if (span) Sentry.getRootSpan(span).setAttributes(attributes);
    } catch {
        debugLog('Could not tag MCP request span');
    }
}

export function trackToolResult(metrics: RpcMetrics, id: RequestId, outcome: ToolOutcome): void {
    const names = metrics.pendingTools.get(id);
    if (!names?.length) return;
    const toolName = names.shift()!;
    if (!names.length) metrics.pendingTools.delete(id);
    countRpc(metrics, 'tools/call', outcome, 1, toolName);
}

export function finishRpcMetrics(metrics: RpcMetrics, aborted: boolean): void {
    // The SDK can reject a tool request before calling the registered handler.
    const remaining = new Map<string, number>();
    for (const names of metrics.pendingTools.values()) {
        for (const name of names) remaining.set(name, (remaining.get(name) ?? 0) + 1);
    }
    metrics.pendingTools.clear();
    for (const [toolName, count] of remaining) {
        countRpc(metrics, 'tools/call', aborted ? 'aborted' : 'failed', count, toolName);
    }
}

function metricToolName(name: unknown): string {
    return typeof name === 'string' && isKnownToolName(name) ? name : 'other';
}

function countRpc(metrics: RpcMetrics, method: string, outcome: ToolOutcome | 'received', count = 1, toolName?: string): void {
    try {
        Sentry.metrics.count('runescape.mcp.rpc.message', count, {
            attributes: {
                rpc_method: method, outcome, traffic_source: metrics.trafficSource,
                ...(toolName === undefined ? {} : { tool_name: toolName }),
            },
        });
    } catch {
        debugLog('Could not record MCP method metric');
    }
}
