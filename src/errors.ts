// MCP protocol-level errors

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

export function unknownToolError(name: string): McpError {
    return new McpError(ErrorCode.InvalidParams, `Unknown tool: ${name}`);
}

export function resourceNotFoundError(uri: string): McpError {
    return new McpError(ErrorCode.InvalidParams, 'Resource not found', { uri });
}
