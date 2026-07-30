#!/usr/bin/env node

// Main entry point for RuneScape Wiki MCP Server
// Speaks MCP 2026-07-28 (and legacy 2025-era clients) via serveStdio.

import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from './server.js';

console.error('RuneScape Wiki MCP Server running on stdio');
serveStdio(() => createServer());
