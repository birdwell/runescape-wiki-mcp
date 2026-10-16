// Sentry must be initialized before the MCP server is constructed.

import * as Sentry from '@sentry/node';
import { SERVER_CONFIG } from './constants.js';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
    Sentry.init({
        dsn,
        environment: process.env.SENTRY_ENVIRONMENT ?? 'production',
        release: process.env.SENTRY_RELEASE ?? `runescape-wiki-mcp@${SERVER_CONFIG.version}`,
        tracesSampleRate: 1,
    });
}
