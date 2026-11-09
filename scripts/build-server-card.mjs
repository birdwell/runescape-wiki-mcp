// Local Smithery catalogue snapshot. This does not publish or deploy the server.
import { mkdir, writeFile } from 'node:fs/promises';
import { SERVER_CONFIG } from '../dist/constants.js';
import { availableTools } from '../dist/tools/index.js';
import { resources } from '../dist/resources.js';
import { prompts } from '../dist/prompts.js';

const directory = new URL('../.smithery/', import.meta.url);
const tools = availableTools();
await mkdir(directory, { recursive: true });
await writeFile(new URL('server-card.json', directory), JSON.stringify({
    serverInfo: { name: SERVER_CONFIG.name, version: SERVER_CONFIG.version },
    tools, resources, prompts,
}, null, 2) + '\n');
console.log(`Built local Smithery server card with ${tools.length} tools.`);
