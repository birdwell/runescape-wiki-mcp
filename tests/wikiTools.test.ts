// Tests for wiki tools

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import { handleWikiTool, wikiTools } from '../src/tools/wikiTools.js';

describe('Wiki Tools', () => {
    beforeEach(() => {
        nock.cleanAll();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    it('should register wiki search and page content', () => {
        expect(wikiTools.some(t => t.name === 'search_wiki')).toBe(true);
        expect(wikiTools.some(t => t.name === 'get_wiki_page_content')).toBe(true);
        const page = wikiTools.find(t => t.name === 'get_wiki_page_content');
        expect(page?.description).toContain('search_wiki');
    });

    describe('search_wiki', () => {
        it('should return titles, plain snippets, and wiki urls', async () => {
            nock('https://runescape.wiki')
                .get('/api.php')
                .query(query => query.action === 'query' && query.list === 'search' && query.srsearch === 'Noxious scythe')
                .reply(200, {
                    query: {
                        search: [
                            {
                                title: 'Noxious scythe',
                                snippet: 'The <span class="searchmatch">Noxious</span> scythe is a weapon.',
                            },
                        ],
                    },
                });

            const result = await handleWikiTool('search_wiki', { query: 'Noxious scythe', limit: 3 });
            expect(result.isError).toBeFalsy();
            expect(result.structuredContent).toEqual({
                results: [
                    {
                        title: 'Noxious scythe',
                        snippet: 'The Noxious scythe is a weapon.',
                        url: 'https://runescape.wiki/w/Noxious_scythe',
                    },
                ],
            });
            const text = result.content.map(part => part.text).join('\n');
            expect(text).toContain('RuneScape Wiki contributors');
            expect(text).toContain('https://runescape.wiki/w/Noxious_scythe?action=history');
            expect(text).toContain('https://creativecommons.org/licenses/by-nc-sa/3.0/');
            expect(text).toContain('HTML highlighting removed');
        });

        it('should return an empty result list when nothing matches', async () => {
            nock('https://runescape.wiki')
                .get('/api.php')
                .query(true)
                .reply(200, { query: { search: [] } });

            const result = await handleWikiTool('search_wiki', { query: 'zzzz-not-a-page' });
            expect(result.isError).toBeFalsy();
            expect(result.structuredContent).toEqual({ results: [] });
            expect(result.content).toHaveLength(1);
        });

        it('should require query', async () => {
            const result = await handleWikiTool('search_wiki', {});
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toBe('query is required');
        });

        it('should reject a limit outside 1-10', async () => {
            const result = await handleWikiTool('search_wiki', { query: 'whip', limit: 0 });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('limit');
        });
    });

    describe('get_wiki_page_content', () => {
        it('should return page extract text and follow redirects', async () => {
            nock('https://runescape.wiki')
                .get('/api.php')
                .query(true)
                .reply(200, {
                    query: {
                        redirects: [{ from: 'Whip', to: 'Whips' }],
                        pages: {
                            '484136': {
                                pageid: 484136,
                                title: 'Whips',
                                extract: 'Whips are fast slashing weapons.',
                            },
                        },
                    },
                });

            const result = await handleWikiTool('get_wiki_page_content', { page: 'Whip' });
            expect(result.isError).toBeFalsy();
            expect(result.content[0].text).toContain('Wiki Page: Whips');
            expect(result.content[0].text).toContain('fast slashing weapons');
            expect(result.content[0].text).toContain('"Whips": https://runescape.wiki/w/Whips');
            expect(result.content[0].text).toContain('https://runescape.wiki/w/Whips?action=history');
            expect(result.content[0].text).toContain('https://creativecommons.org/licenses/by-nc-sa/3.0/');
            expect(result.content[0].text).toContain('formatting omitted');
            expect(result.content[0].text).toContain('except where the source states otherwise');
            expect(result.content[0].text).not.toContain('https://runescape.wiki/w/Whip?');
        });

        it('should error when page is missing', async () => {
            nock('https://runescape.wiki')
                .get('/api.php')
                .query(true)
                .reply(200, {
                    query: {
                        pages: {
                            '-1': {
                                title: 'MissingPage',
                                missing: true,
                            },
                        },
                    },
                });

            const result = await handleWikiTool('get_wiki_page_content', { page: 'MissingPage' });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('was not found');
            expect(result.content[0].text).toContain('search_wiki');
        });

        it('should error on empty extract', async () => {
            nock('https://runescape.wiki')
                .get('/api.php')
                .query(true)
                .reply(200, {
                    query: {
                        pages: {
                            '1': {
                                pageid: 1,
                                title: 'Empty',
                                extract: '',
                            },
                        },
                    },
                });

            const result = await handleWikiTool('get_wiki_page_content', { page: 'Empty' });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('no extractable text');
        });

        it('should require page', async () => {
            const result = await handleWikiTool('get_wiki_page_content', {});
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toBe('page is required');
        });
    });
});
