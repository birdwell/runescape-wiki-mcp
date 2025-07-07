#!/usr/bin/env node

// Main entry point for RuneScape Wiki MCP Server

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { server, setupServerHandlers } from './server.js';

// Setup all server handlers
setupServerHandlers();

// Start the server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('RuneScape Wiki MCP Server running on stdio');
}

main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
});
