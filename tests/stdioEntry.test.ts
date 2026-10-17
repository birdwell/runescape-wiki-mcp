// Smoke coverage for the stdio entry (serveStdio) supporting both eras

import { describe, it, expect, afterEach } from '@jest/globals';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const entry = path.join(root, 'dist', 'index.js');

let child: ChildProcessWithoutNullStreams | undefined;

afterEach(async () => {
    if (!child || child.killed || child.exitCode !== null) {
        child = undefined;
        return;
    }
    child.kill('SIGKILL');
    await new Promise<void>(resolve => {
        child?.once('exit', () => resolve());
        setTimeout(resolve, 500).unref();
    });
    child = undefined;
});

// Waits for one complete response line per request that carries an `id`, or for
// the server to exit, instead of a fixed delay: cold start (Sentry + MCP SDK
// load) is CPU-bound and can exceed a few hundred ms on a loaded CI runner.
// `timeoutMs` only guards against a hung server.
async function runStdioRpc(messages: object[], timeoutMs = 25_000): Promise<string> {
    const expectedResponses = messages.filter(message => 'id' in message).length;
    child = spawn(process.execPath, [entry], {
        cwd: root,
        stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
        stdout += chunk;
    });

    for (const message of messages) {
        child.stdin.write(`${JSON.stringify(message)}\n`);
    }
    child.stdin.end();

    await new Promise<void>(resolve => {
        const timer = setTimeout(() => resolve(), timeoutMs);
        timer.unref();
        const finish = () => {
            clearTimeout(timer);
            resolve();
        };
        child?.once('exit', finish);
        child?.stdout.on('data', () => {
            const responseLines = stdout.split('\n').filter(line => line.trim() !== '');
            if (stdout.endsWith('\n') && responseLines.length >= expectedResponses) {
                finish();
            }
        });
    });

    if (child.exitCode === null && !child.killed) {
        child.kill('SIGKILL');
        await new Promise<void>(resolve => {
            child?.once('exit', () => resolve());
            setTimeout(resolve, 500).unref();
        });
    }

    return stdout;
}

describe('stdio entry (serveStdio)', () => {
    it('should serve 2026-07-28 server/discover', async () => {
        const stdout = await runStdioRpc([
            {
                jsonrpc: '2.0',
                id: 1,
                method: 'server/discover',
                params: {
                    _meta: {
                        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
                        'io.modelcontextprotocol/clientInfo': {
                            name: 'stdio-test',
                            version: '1.0.0',
                        },
                        'io.modelcontextprotocol/clientCapabilities': {},
                    },
                },
            },
        ]);

        expect(stdout).toContain('"id":1');
        expect(stdout).toContain('2026-07-28');
        expect(stdout).toContain('runescape-wiki-mcp');
    }, 30_000);

    it('should serve legacy initialize', async () => {
        const stdout = await runStdioRpc([
            {
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: '2025-11-25',
                    capabilities: {},
                    clientInfo: { name: 'stdio-legacy', version: '1.0.0' },
                },
            },
        ]);

        expect(stdout).toContain('"id":1');
        expect(stdout).toContain('2025-11-25');
        expect(stdout).toContain('runescape-wiki-mcp');
    }, 30_000);
});
