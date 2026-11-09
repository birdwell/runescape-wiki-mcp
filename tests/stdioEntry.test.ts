// Smoke coverage for the stdio entry (serveStdio) supporting both eras

import { describe, it, expect } from '@jest/globals';
import { spawn } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const entry = path.join(root, 'dist', 'index.js');

// Keep stdin open until the server responds. The SDK cancels in-flight requests on EOF.
async function runStdioRpc(messages: object[], timeoutMs = 25_000): Promise<string> {
    const expectedResponses = messages.filter(message => 'id' in message).length;
    const child = spawn(process.execPath, [entry], {
        cwd: root,
        stdio: ['pipe', 'pipe', 'pipe'],
    });
    const closed = new Promise<void>(resolve => { child.once('close', () => resolve()); });
    let stdout = '';
    let stderr = '';
    let timer: NodeJS.Timeout | undefined;
    try {
        return await new Promise<string>((resolve, reject) => {
            const fail = (message: string) => reject(new Error(`${message}\n${stderr}`.trim()));
            child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
            child.once('error', error => fail(`Could not start stdio server: ${error.message}`));
            child.stdin.on('error', error => fail(`Could not write to stdio server: ${error.message}`));
            child.once('close', (code, signal) => fail(`Stdio server exited before replying (${signal ?? code})`));
            child.stdout.setEncoding('utf8').on('data', chunk => {
                stdout += chunk;
                const responseLines = stdout.split('\n').slice(0, -1).filter(line => line.trim() !== '');
                if (responseLines.length >= expectedResponses) resolve(stdout);
            });
            timer = setTimeout(() => fail(`Timed out waiting for ${expectedResponses} stdio responses`), timeoutMs);
            child.stdin.write(messages.map(message => `${JSON.stringify(message)}\n`).join(''));
        });
    } finally {
        clearTimeout(timer);
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        await closed;
    }
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
