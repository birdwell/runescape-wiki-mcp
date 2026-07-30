// MCP protocol-level errors

import { ProtocolError, ProtocolErrorCode, ResourceNotFoundError } from '@modelcontextprotocol/server';

export function unknownToolError(name: string): ProtocolError {
    return new ProtocolError(ProtocolErrorCode.InvalidParams, `Unknown tool: ${name}`);
}

export function resourceNotFoundError(uri: string): ResourceNotFoundError {
    return new ResourceNotFoundError(uri);
}
