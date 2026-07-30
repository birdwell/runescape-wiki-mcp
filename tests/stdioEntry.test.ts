// Smoke coverage for the stdio entry (serveStdio) supporting both eras

import { describe, it, expect, afterEach } from '@jest/globals';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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

async function runStdioRpc(messages: object[], settleMs = 600): Promise<string> {
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
        const timer = setTimeout(() => resolve(), settleMs);
        timer.unref();
        child?.once('exit', () => {
            clearTimeout(timer);
            resolve();
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
    });

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
    });
});
