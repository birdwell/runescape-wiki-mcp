// Stage secrets without putting credentials in shell arguments, output, or Git.
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const apiKey = process.env.TYPESAFE_API_KEY?.trim();
if (!apiKey || /[\r\n]/.test(apiKey)) throw new Error('A valid TYPESAFE_API_KEY is required.');
const app = readFileSync('fly.beta.toml', 'utf8').match(/^app = "([a-z0-9-]+)"$/m)?.[1];
if (!app || app === 'runescape-wiki-mcp') throw new Error('Use a separate beta Fly app.');
const directory = resolve('.cache/beta');
mkdirSync(directory, { recursive: true, mode: 0o700 });
chmodSync(directory, 0o700);
const credentialsPath = resolve(directory, 'credentials.json');
const credentials = existsSync(credentialsPath) ? JSON.parse(readFileSync(credentialsPath, 'utf8')) : {
    ownerToken: randomBytes(32).toString('base64url'),
    budgetCheckToken: randomBytes(32).toString('base64url'),
};
if (![credentials.ownerToken, credentials.budgetCheckToken].every(token => /^[A-Za-z0-9_-]{43}$/.test(token))) {
    throw new Error('Invalid saved beta credentials.');
}
function privateFile(path, text) {
    writeFileSync(path, text, { mode: 0o600 });
    chmodSync(path, 0o600);
}
privateFile(credentialsPath, JSON.stringify(credentials, null, 2) + '\n');
const url = `https://${app}.fly.dev/mcp`;
privateFile(resolve(directory, 'mcp.json'), JSON.stringify({ mcpServers: { runescape_beta: {
    type: 'http', url, headers: { Authorization: `Bearer ${credentials.ownerToken}` },
} } }, null, 2) + '\n');
privateFile(resolve(directory, 'codex.toml'), `[mcp_servers.runescape_beta]\nurl = "${url}"\nhttp_headers = { Authorization = "Bearer ${credentials.ownerToken}" }\n`);
const digest = token => createHash('sha256').update(token).digest('hex');
const tokens = [ { id: 'owner', sha256: digest(credentials.ownerToken) },
    { id: 'budget-check', sha256: digest(credentials.budgetCheckToken), dailyMicros: 0 } ];
const secrets = `TYPESAFE_API_KEY=${apiKey}\nRS3_BETA_TOKENS_JSON=${JSON.stringify(tokens)}\n`;
const result = spawnSync('flyctl', ['secrets', 'import', '--stage', '--app', app], {
    input: secrets, encoding: 'utf8', timeout: 60_000,
});
if (result.status !== 0) throw new Error('Could not stage beta secrets. Check Fly authentication and app access.');
console.log(`Beta secrets staged. Private client configuration saved in ${directory}.`);
