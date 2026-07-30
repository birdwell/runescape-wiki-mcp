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

    it('should register get_wiki_page_content', () => {
        expect(wikiTools.some(t => t.name === 'get_wiki_page_content')).toBe(true);
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
