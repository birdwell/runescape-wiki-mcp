import { describe, expect, it } from '@jest/globals';
import { htmlText, withoutWikiComments } from '../src/wikiText.js';
import { parseQuestPage, wikiText } from '../src/questParsing.js';

describe('wiki plain-text extraction', () => {
    it('decodes one entity layer without double unescaping', () => {
        expect(wikiText('&amp;quot; &amp;#39; &amp;apos; &amp;nbsp;')).toBe('&quot; &#39; &apos; &nbsp;');
        expect(wikiText('&quot; &#39; &apos; &nbsp; &amp;')).toBe('" \' \' &');
        expect(wikiText('&amp;lt;script&amp;gt;')).toBe('&lt;script&gt;');
    });
    it('does not reparse encoded text as HTML', () => {
        expect(htmlText('&lt;b&gt;literal&lt;/b&gt;')).toBe('<b>literal</b>');
    });
    it('cannot reassemble comment delimiters across removed comments', () => {
        expect(withoutWikiComments('<!-<!--x-->-{{Quest details|start=Hidden}}-->')).not.toContain('<!--');
        expect(withoutWikiComments('before<!-- unterminated {{Skillreq|Mining|99}}')).toBe('before ');
    });
    it('drops hidden scripts, style, references and incomplete tags', () => {
        expect(wikiText('A<script>danger()</script><style>hidden</style><ref>citation</ref><ref name="x"/> B')).toBe('A B');
        expect(wikiText('Visible<script')).toBe('Visible');
        expect(wikiText('<scr<script>ipt>text')).not.toContain('<script');
    });
    it('keeps legitimate links, templates, comparisons and formatting', () => {
        expect(wikiText("[[Mining]] <b>training</b>: {{Skillreq|Mining|40}}; 2 < 3")).toBe('Mining training: Mining 40; 2 < 3');
    });
    it('does not extract quest data from comments or non-content HTML elements', () => {
        const source = '<!--{{Quest rewards|rewards={{Sxp|Mining|999999}}}}-->' +
            '<script>{{Quest details|start=Hidden}}{{Quest rewards|rewards={{Sxp|Mining|888888}}}}</script>' +
            '{{Quest details|start=Talk to Doric|requirements={{Skillreq|Mining|20}}}}' +
            '{{Quest rewards|rewards={{Sxp|Mining|1000}} &amp;quot;}}';
        const result = parseQuestPage('Example', source);
        expect(result.guide.start).toBe('Talk to Doric');
        expect(result.rewards.xp).toEqual([{ skill: 'Mining', amount: 1000 }]);
        expect(result.rewards.text).toContain('&quot;');
        expect(result.requirements.skills).toEqual([{ skill: 'Mining', level: 20 }]);
    });
});
