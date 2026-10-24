#!/usr/bin/env node

// Main entry point for RuneScape Wiki MCP Server
// Speaks MCP 2026-07-28 (and legacy 2025-era clients) via serveStdio.

import './instrument.js';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from './server.js';
import { initializeAnalytics, shutdownAnalytics } from './analytics.js';

await initializeAnalytics('stdio');
// Only install lifecycle hooks for an explicitly opted-in local installation.
if (process.env.POSTHOG_STDIO_ENABLED === 'true' && process.env.POSTHOG_ENABLED === 'true') {
    process.once('beforeExit', () => { void shutdownAnalytics(); });
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.once(signal, () => { void shutdownAnalytics().finally(() => process.exit(0)); });
    }
}

console.error('RuneScape 3 MCP Server running on stdio');
serveStdio(() => createServer());
