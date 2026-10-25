// Builds an OpenAI Agent Plugins package from the shared directory copy.
// --draft permits missing publication fields, and must not be submitted for review.
import { readFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const here = new URL('./', import.meta.url);
const listing = JSON.parse(await readFile(new URL('listing.json', here), 'utf8'));
const cases = JSON.parse(await readFile(new URL('review-cases.json', here), 'utf8'));
let config = {};
try {
    config = JSON.parse(await readFile(new URL('submission-config.json', here), 'utf8'));
} catch (error) {
    if (error.code !== 'ENOENT') throw error;
}
const draft = process.argv.includes('--draft');
const missing = ['privacyPolicyURL', 'termsOfServiceURL', 'demo_recording_url', 'developerName', 'category']
    .filter(key => !config[key]);
if (!draft && missing.length) {
    throw new Error(`Submission blocked: set ${missing.join(', ')} in distribution/submission-config.json. See distribution/README.md.`);
}
for (const key of ['privacyPolicyURL', 'termsOfServiceURL', 'demo_recording_url', 'publisherURL']) {
    if (!config[key]) continue;
    const url = new URL(config[key]);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`${key} must use HTTPS without embedded credentials`);
}
if (cases.positive.length !== 5 || cases.negative.length !== 3) throw new Error('Expected five positive and three negative cases');
if (listing.name.length > 30 || listing.subtitle.length > 30) throw new Error('Listing title/subtitle exceeds 30 characters');
if (listing.starterPrompts.length > 3 || listing.starterPrompts.some(prompt => prompt.length > 128)) throw new Error('Starter prompts exceed submission limits');

// A fresh directory keeps stale or unrelated local files out of the archive.
const output = await mkdtemp(join(tmpdir(), `runescape-wiki-plugin${draft ? '-draft' : ''}-`)) + '/';
await mkdir(`${output}assets`, { recursive: true });
const manifest = {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name: 'runescape-wiki', version: '1.0.0', description: listing.summary,
    author: { name: config.developerName ?? 'birdwell', url: config.publisherURL ?? 'https://github.com/birdwell' },
    homepage: listing.website, repository: listing.repository, license: 'MIT', keywords: listing.keywords,
    extensions: { 'com.openai': {
        interface: {
            displayName: listing.name, shortDescription: listing.subtitle, longDescription: listing.description,
            websiteURL: listing.website, supportURL: listing.support,
            ...(config.developerName ? { developerName: config.developerName } : {}),
            ...(config.category ? { category: config.category } : {}),
            ...(config.privacyPolicyURL ? { privacyPolicyURL: config.privacyPolicyURL } : {}),
            ...(config.termsOfServiceURL ? { termsOfServiceURL: config.termsOfServiceURL } : {}),
            defaultPrompt: listing.starterPrompts,
            logo: './assets/icon.svg', composerIcon: './assets/icon.svg',
        },
        review: {
            test_cases: cases,
            ...(config.demo_recording_url ? { demo_recording_url: config.demo_recording_url } : {}),
            commerce: false, commerce_description: 'Read-only game information. No purchases, payments or game trades.',
        },
        publication: { release_notes: 'Initial chat plugin package for RS3 guide prices, daily history, flip estimates, normal-mode hiscores and wiki source links; article text requires a reviewed revision.' },
    } },
};
const mcp = {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
    mcpServers: { 'runescape-wiki': { type: 'streamable-http', url: listing.mcpUrl } },
};
await writeFile(`${output}plugin.json`, `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(`${output}mcp.json`, `${JSON.stringify(mcp, null, 2)}\n`);
// Original abstract price bars: no third-party logo, font or game artwork.
await writeFile(`${output}assets/icon.svg`, '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="48" fill="#172f3b"/><path d="M54 184V132H90V184ZM110 184V92H146V184ZM166 184V56H202V184Z" fill="#e6bd69"/><path d="M54 206H202" stroke="#edf3f5" stroke-width="10" stroke-linecap="round"/></svg>\n');
const archive = output.slice(0, -1) + '.zip';
const result = spawnSync('zip', ['-q', '-r', '-FS', archive, 'plugin.json', 'mcp.json', 'assets'], { cwd: output, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`zip exited with ${result.status}`);
console.log(JSON.stringify({ archive, draft, missingPublicationFields: missing }, null, 2));
