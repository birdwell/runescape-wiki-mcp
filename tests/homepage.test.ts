import { readFileSync } from 'node:fs';
import { describe, expect, it } from '@jest/globals';
import { SERVER_CONFIG } from '../src/constants.js';
import { homepageHtml } from '../src/homepage.js';

describe('public copy', () => {
    it('leads the homepage with the question and the price caveat', () => {
        const html = homepageHtml();
        expect(html).toContain("Ask what it's worth, whether the flip clears tax, and what to train next.");
        expect(html).toContain('https://runescape-wiki-mcp.fly.dev/mcp');
        expect(html).toContain('Jagex guide prices and Weirdgloop history');
        expect(html).toContain('https://prices.runescape.wiki/rs');
        expect(html.toLowerCase()).not.toContain('real-time');
        expect(html.indexOf('<h1>')).toBeLessThan(html.indexOf('GitHub'));
    });

    it('uses the same honest summary in the README and the server card', () => {
        const readme = readFileSync('README.md', 'utf8');
        expect(readme).toContain("Ask what it's worth, whether the flip clears tax, and what to train next.");
        expect(readme).toContain('They lag the in-game market.');
        expect(readme.toLowerCase()).not.toContain('real-time');
        expect(SERVER_CONFIG.description.length).toBeLessThanOrEqual(100);
        expect(SERVER_CONFIG.description).toContain('guide prices');
    });
});
