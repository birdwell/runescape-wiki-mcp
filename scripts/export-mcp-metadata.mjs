// Run after `bun run build`. Export exactly the schemas clients discover.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createServer } from '../dist/server.js';
import { SERVER_CONFIG } from '../dist/constants.js';

const handler = createMcpHandler(createServer);
async function discover(method) {
    const response = await handler.fetch(new Request('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: method, method, params: {} }),
    }));
    const body = await response.text();
    const message = response.headers.get('content-type')?.includes('text/event-stream')
        ? JSON.parse(body.split('\n').find(line => line.startsWith('data:')).slice(5))
        : JSON.parse(body);
    if (!response.ok || message.error) throw new Error(`${method}: ${body}`);
    return message.result;
}
try {
    const { tools } = await discover('tools/list');
    const { resources } = await discover('resources/list');
    const { prompts } = await discover('prompts/list');
    const cardPath = '.smithery/shttp/manifest.json';
    await mkdir(dirname(cardPath), { recursive: true });
    await writeFile(cardPath, JSON.stringify({
        type: 'hosted', stateful: false, hasAuthAdapter: false,
        serverCard: { serverInfo: SERVER_CONFIG, tools, resources, prompts },
    }, null, 2) + '\n');
    if (process.argv[2]) {
        await mkdir(dirname(process.argv[2]), { recursive: true });
        await writeFile(process.argv[2], JSON.stringify({ serverName: 'RuneScape Wiki', tools }, null, 2) + '\n');
    }
    console.log(`Exported ${tools.length} tools, ${resources.length} resources, ${prompts.length} prompts; rebuilt ${cardPath}`);
} finally {
    await handler.close();
}
