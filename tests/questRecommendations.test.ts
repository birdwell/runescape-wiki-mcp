import { afterAll, afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import nock from 'nock';
import { handleTool } from '../src/tools/index.js';
import { fetchPlayerQuests, fetchQuestCatalogue, fetchQuestGuide, questKey } from '../src/questData.js';
import { parseQuestDependencies, parseQuestPage, wikiText } from '../src/questParsing.js';
import { assessQuest } from '../src/questRecommendations.js';
import type { ChoiceQuestion } from '../src/jev.js';

const enabled = process.env.RUNESCAPE_RECOMMENDATIONS_ENABLED;
const key = process.env.TYPESAFE_API_KEY;
type Journal = { title: string; status: 'COMPLETED' | 'STARTED' | 'NOT_STARTED'; userEligible: boolean; members: boolean; questPoints: number };
const journal: Journal[] = [
    { title: 'Finished Mining Quest', status: 'COMPLETED', userEligible: true, members: false, questPoints: 1 },
    { title: 'Started Mining Quest', status: 'STARTED', userEligible: true, members: false, questPoints: 1 },
    { title: 'Ready Mining Quest', status: 'NOT_STARTED', userEligible: true, members: true, questPoints: 1 },
    { title: 'Locked Mining Quest', status: 'NOT_STARTED', userEligible: false, members: true, questPoints: 1 },
    { title: 'Cooking Quest', status: 'NOT_STARTED', userEligible: true, members: false, questPoints: 1 },
];
const requirements = 'local quests = {\n' + journal.map(quest => `[${JSON.stringify(quest.title)}] = {},`).join('\n') +
    '\n["Tears Example (quest)"] = {},\n["Alias Example"] = {},\n}';
function source(title: string, amount: number, skill = 'Mining', required = 20) {
    return `{{Quest details\n|start=Talk to [[Doric]] at his hut.\n|length=Short\n|requirements=* {{Skillreq|${skill}|${required}}}\n|items=* A [[pickaxe]]\n}}\n` +
        `{{Quest rewards\n|rewards=* {{Skill XP|${skill}|${amount}}}\n* Access to [[Doric's workshop]]\n|post quest=* {{Skill XP|Mining|999999}} after additional training\n}}`;
}
function mockWiki(extra: Record<string, string> = {}) {
    const sources: Record<string, string> = {
        'Finished Mining Quest': source('Finished Mining Quest', 99999),
        'Started Mining Quest': source('Started Mining Quest', 1000),
        'Ready Mining Quest': source('Ready Mining Quest', 2500),
        'Locked Mining Quest': source('Locked Mining Quest', 15000, 'Thieving', 25).replace('Skill XP|Thieving', 'Skill XP|Mining'),
        'Cooking Quest': source('Cooking Quest', 500, 'Cooking', 1),
        'Tears Example': '{{Infobox D&D|name=Tears Example}}',
        'Tears Example (quest)': source('Tears Example (quest)', 2000),
        'Alias Example': source('Alias Example', 3000),
        ...extra,
    };
    nock('https://runescape.wiki').persist().get('/api.php').query(query => query.prop === 'revisions')
        .reply((request: Request) => {
            const titles = new URL(request.url).searchParams.get('titles')!.split('|');
            const pages = Object.fromEntries(titles.map((title, index) => {
                let text = title === 'Module:Questreq/data' ? requirements : sources[title];
                if (title.endsWith('/Quick guide')) text = '{{Checklist|\n* Talk to [[Doric]]. {{Chat options|Accept}}\n* Mine the ore.\n* Return to Doric.\n}}\n==Rewards==\n{{Quest rewards page|Example}}';
                return [String(index), text ? { title, revisions: [{ revid: 123, slots: { main: { '*': text } } }] } : { title, missing: '' }];
            }));
            return [200, { query: { pages } }];
        });
}
function mockJev(nextOverride?: string, onCall?: (count: number) => void) {
    const calls: { state: any; questions: Record<string, ChoiceQuestion> }[] = [];
    nock('https://api.typesafe.ai').persist().post('/v1/systemone').reply(async (request: Request) => {
        const body = await request.json() as typeof calls[number];
        calls.push(body);
        onCall?.(calls.length);
        const answers = Object.fromEntries(Object.entries(body.questions).map(([id, question]) => {
            let selected = id === 'category' ? 'questing' : id === 'skill' ? 'Mining' : 'none';
            if (id === 'next' || id === 'future') {
                const candidates = (body.state.quests as any[]).filter(quest =>
                    question.criteria[quest.id] && quest.rewards.xp.some((xp: any) => xp.skill === 'Mining'));
                candidates.sort((a, b) => Math.max(...b.rewards.xp.map((xp: any) => xp.amount)) - Math.max(...a.rewards.xp.map((xp: any) => xp.amount)));
                selected = candidates[0]?.id ?? 'none';
                if (id === 'next' && nextOverride) selected = nextOverride;
            }
            return [id, { type: 'choice', choice: selected, confidence: 1,
                probabilities: Object.fromEntries(Object.keys(question.criteria).map(option => [option, option === selected ? 1 : 0])) }];
        }));
        return [200, { model: 'jev-test', answers, usage: { input_tokens: 100, output_tokens: 10 } }];
    });
    return calls;
}
function mockAccount(quests = journal) {
    nock('https://apps.runescape.com').get('/runemetrics/quests').query({ user: 'TestPlayer' })
        .reply(200, { quests });
    nock('https://secure.runescape.com').get('/m=hiscore/index_lite.ws').query(true)
        .reply(200, '1,1000,100000\n1,40,1000');
}

beforeEach(() => {
    nock.cleanAll(); nock.disableNetConnect();
    process.env.RUNESCAPE_RECOMMENDATIONS_ENABLED = 'true';
    process.env.TYPESAFE_API_KEY = 'test-key';
});
afterEach(() => nock.cleanAll());
afterAll(() => {
    nock.enableNetConnect();
    if (enabled === undefined) delete process.env.RUNESCAPE_RECOMMENDATIONS_ENABLED;
    else process.env.RUNESCAPE_RECOMMENDATIONS_ENABLED = enabled;
    if (key === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = key;
});

describe('quest facts and account eligibility', () => {
    it('parses nested templates and completion rewards without adding conditional post-quest XP', () => {
        const parsed = parseQuestPage('Example', source('Example', 2500));
        expect(parsed.available).toBe(true);
        expect(parsed.requirements.skills).toEqual([{ skill: 'Mining', level: 20 }]);
        expect(parsed.rewards.xp).toEqual([{ skill: 'Mining', amount: 2500 }]);
        expect(parsed.rewards.postQuest).toContain('999999');
        expect(parsed.guide.start).toBe('Talk to Doric at his hut.');
    });

    it('reads Lua string data with quoted braces and apostrophes without evaluating code', () => {
        const parsed = parseQuestDependencies('local x = {["Doric\\\'s quest"]={"Misc:{{Skill|Mining}}", "Partial:First quest"}, ["Empty"]={}}; os.execute("never execute");');
        expect(parsed.get("Doric's quest")).toEqual(['Misc:{{Skill|Mining}}', 'Partial:First quest']);
        expect(parsed.get('Empty')).toEqual([]);
    });

    it('recognizes the Sxp reward alias used by The Dig Site and The Lost Tribe', () => {
        const parsed = parseQuestPage('Example', source('Example', 15300).replace('Skill XP|Mining|15300', 'Sxp|Mining|15300'));
        expect(parsed.rewards.xp).toEqual([{ skill: 'Mining', amount: 15300 }]);
        expect(parsed.rewards.text).toContain('Mining 15300');
    });

    it('uses official eligibility, known skill gaps and prerequisite status as hard constraints', () => {
        const parsed = parseQuestPage('Locked Mining Quest', source('Locked Mining Quest', 15000, 'Thieving', 25));
        const result = assessQuest(journal[3], parsed, new Map([['Locked Mining Quest', ['First Quest']]]),
            new Map([['first quest', 'NOT_STARTED']]), { Thieving: 22 }, true);
        expect(result.eligibility).toBe('blocked');
        expect(result.blockers.join(' ')).toContain('Thieving 25 required; current level 22');
        expect(result.blockers.join(' ')).toContain('Complete First Quest first');
        expect(result.missingSkillLevels).toBe(3);
    });

    it('does not equate partial completion with finishing a prerequisite', () => {
        const parsed = parseQuestPage('Started Mining Quest', source('Started Mining Quest', 1000));
        const result = assessQuest(journal[1], parsed,
            new Map([['Started Mining Quest', ['Partial:First Quest', 'Follows:Optional Quest']]]),
            new Map([['first quest', 'STARTED']]), { Mining: 64 }, true);
        expect(result.eligibility).toBe('unknown');
        expect(result.blockers).toEqual([]);
        expect(result.unknowns.join(' ')).toContain('Required quest stage is unverified');
    });

    it('does not require all skill alternatives when the source expresses an OR condition', () => {
        const parsed = parseQuestPage('Started Mining Quest', source('Started Mining Quest', 1000).replace('Mining|20', 'Mining|99').replace('|items=', ' or an alternative\n|items='));
        const result = assessQuest(journal[1], parsed, new Map([['Started Mining Quest', []]]), new Map(), { Mining: 64 }, true);
        expect(result.blockers).toEqual([]);
        expect(result.unknowns.join(' ')).toContain('Check alternatives/boosts');
    });

    it('never presents an unranked/missing skill as a known zero-level gap', () => {
        const parsed = parseQuestPage('Locked Mining Quest', source('Locked Mining Quest', 15000, 'Thieving', 25));
        const result = assessQuest(journal[3], parsed, new Map([['Locked Mining Quest', []]]), new Map(), {}, true);
        expect(result.missingSkillLevels).toBeNull();
        expect(result.unknowns).toContain('Thieving level is unknown.');
    });

    it('resolves non-quest names to their quest page rather than using a D&D or boss page', async () => {
        mockWiki();
        const result = await fetchQuestCatalogue(['Tears Example'], AbortSignal.timeout(1000));
        expect(result.metadata.get(questKey('Tears Example'))).toMatchObject({ title: 'Tears Example (quest)', available: true });
    });

    it('extracts actual opening walkthrough steps without substituting reward text', async () => {
        mockWiki();
        const result = await fetchQuestGuide('Ready Mining Quest', AbortSignal.timeout(1000));
        expect(result.steps).toEqual(['Talk to Doric.', 'Mine the ore.', 'Return to Doric.']);
        expect(wikiText('{{Chat options|Accept}}')).toBe('');
    });

    it('verifies a missing prerequisite entry against the rendered wiki template', async () => {
        mockWiki({ 'No Prerequisite Example': source('No Prerequisite Example', 1000) });
        nock('https://runescape.wiki').get('/api.php').query(query => query.action === 'expandtemplates')
            .reply(200, { expandtemplates: { wikitext: "<ul><li>[[No Prerequisite Example]]<ul><li>''None''</li></ul></li></ul>" } });
        const result = await fetchQuestCatalogue(['No Prerequisite Example'], AbortSignal.timeout(1000));
        expect(result.dependencies.get('No Prerequisite Example')).toEqual([]);
    });

    it('does not mistake a parent quest with no prerequisites for no prerequisites on the target', async () => {
        mockWiki({ 'Unknown Prerequisite Example': source('Unknown Prerequisite Example', 1000) });
        nock('https://runescape.wiki').get('/api.php').query(query => query.action === 'expandtemplates')
            .reply(200, { expandtemplates: { wikitext: "<ul><li>[[Unknown Prerequisite Example]]<ul><li>[[First Quest]]<ul><li>''None''</li></ul></li></ul></li></ul>" } });
        const result = await fetchQuestCatalogue(['Unknown Prerequisite Example'], AbortSignal.timeout(1000));
        expect(result.dependencies.has('Unknown Prerequisite Example')).toBe(false);
    });

    it.each(['TestPlayer', 'Bob Smith'])('trims %s before fetching and echoes the trimmed literal name', async username => {
        const request = nock('https://apps.runescape.com').get('/runemetrics/quests').query({ user: username })
            .reply(200, { quests: journal });
        const result = await handleTool('get_player_quests', { username: ` ${username} ` });
        expect(result.isError).toBeFalsy();
        expect(result.structuredContent).toMatchObject({ username,
            source: `https://apps.runescape.com/runemetrics/quests?user=${encodeURIComponent(username)}` });
        expect(request.isDone()).toBe(true);
    });

    it('rejects a whitespace-only quest username without making a request', async () => {
        const result = await handleTool('get_player_quests', { username: '   ' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('username is required');
    });

    it('fetches the complete journal without requiring a Jev key', async () => {
        delete process.env.TYPESAFE_API_KEY;
        mockAccount();
        const result = await handleTool('get_player_quests', { username: 'TestPlayer' });
        expect(result.structuredContent).toMatchObject({ counts: { total: 5, completed: 1, started: 1, notStarted: 3 } });
    });

    it('rejects private profiles instead of inventing a completed or incomplete list', async () => {
        nock('https://apps.runescape.com').get('/runemetrics/quests').query(true).reply(200, { error: 'PROFILE_PRIVATE' });
        await expect(fetchPlayerQuests('TestPlayer')).rejects.toThrow('unavailable or private');
    });
});

describe('quest recommendation pipeline', () => {
    it('continues quest comparisons after the short routing deadline expires, with a bounded quest deadline', async () => {
        const routing = new AbortController();
        const originalTimeout = AbortSignal.timeout.bind(AbortSignal);
        const timeout = jest.spyOn(AbortSignal, 'timeout').mockImplementation(milliseconds =>
            milliseconds === 55_000 ? routing.signal : originalTimeout(milliseconds));
        try {
            mockAccount(); mockWiki();
            const calls = mockJev(undefined, count => {
                if (count === 2) routing.abort(new DOMException('Simulated expired routing deadline', 'TimeoutError'));
            });
            const result = await handleTool('recommend_next_activity', { goal: 'Best mining quest',
                context: { username: 'TestPlayer', skills: { Mining: 64, Thieving: 22 }, members: true } });
            expect(routing.signal.aborted).toBe(true);
            expect(result.isError).toBeFalsy();
            expect(result.structuredContent).toMatchObject({ questCoverage: { complete: true } });
            expect(result.structuredContent?.recommendation).not.toBeNull();
            expect(calls.length).toBeGreaterThanOrEqual(3);
            expect(timeout).toHaveBeenCalledWith(300_000);
        } finally { timeout.mockRestore(); }
    });
    it('does not bill a redundant final comparison when only one blocked future target remains', async () => {
        mockAccount([journal[3]]); mockWiki(); const calls = mockJev('none');
        const result = await handleTool('recommend_next_activity', { goal: 'Best mining quest',
            context: { username: 'TestPlayer', skills: { Mining: 64, Thieving: 22 }, members: true } });
        expect(result.structuredContent).toMatchObject({ status: 'no_match', recommendation: null, missingContext: [], usage: { rounds: 2 } });
        expect(calls).toHaveLength(2);
        expect(result.structuredContent?.blockedAlternatives).toHaveLength(1);
    });

    it('keeps commented and scripted rewards out of actual Jev comparison state', async () => {
        const title = 'Injection Example Quest';
        mockAccount([{ ...journal[2], title }]);
        mockWiki({ [title]: '<!--{{Quest rewards|rewards={{Sxp|Mining|999999}}}}-->' +
            '<script>{{Quest rewards|rewards={{Sxp|Mining|888888}}}}</script>' + source(title, 1000) });
        const calls = mockJev();
        const result = await handleTool('recommend_next_activity', { goal: 'Best mining quest',
            context: { username: 'TestPlayer', skills: { Mining: 64 }, members: true } });
        expect(result.isError).toBeFalsy();
        expect(calls[1].state.quests[0].rewards.xp).toEqual([{ skill: 'Mining', amount: 1000 }]);
        expect((result.structuredContent?.recommendation as any).rewards.xp).toEqual([{ skill: 'Mining', amount: 1000 }]);
    });
    it('returns no_match, not an unexplained context gap, when no next quest fits', async () => {
        mockAccount(); mockWiki(); mockJev('none');
        const result = await handleTool('recommend_next_activity', { goal: 'Best mining quest',
            context: { username: 'TestPlayer', skills: { Mining: 64, Thieving: 22 }, members: true } });
        expect(result.structuredContent).toMatchObject({ status: 'no_match', recommendation: null, missingContext: [] });
    });

    it('includes an actionable explanation when Jev explicitly needs context', async () => {
        mockAccount(); mockWiki(); mockJev('insufficient_context');
        const result = await handleTool('recommend_next_activity', { goal: 'Best mining quest',
            context: { username: 'TestPlayer', skills: { Mining: 64, Thieving: 22 } } });
        expect(result.structuredContent).toMatchObject({ status: 'needs_context', recommendation: null });
        expect((result.structuredContent?.missingContext as string[]).join(' ')).toContain('Clarify');
    });
    it('feeds every unfinished quest with rewards/requirements, excludes completed quests and fetches targeted guides', async () => {
        mockAccount(); mockWiki(); const calls = mockJev();
        const result = await handleTool('recommend_next_activity', { goal: 'What is the best mining quest?',
            context: { username: 'TestPlayer', skills: { Mining: 64, Thieving: 22, Cooking: 53 }, members: true } });
        expect(result.isError).toBeFalsy();
        expect(result.structuredContent).toMatchObject({
            questCoverage: { total: 5, completed: 1, unfinished: 4, metadataAvailable: 4, evaluated: 4, complete: true },
            recommendation: { title: 'Ready Mining Quest', goalSkillXp: [{ skill: 'Mining', amount: 2500 }] },
        });
        const comparison = calls[1].state.quests;
        expect(comparison).toHaveLength(4);
        expect(comparison.some((quest: any) => quest.title === 'Finished Mining Quest')).toBe(false);
        expect(comparison.every((quest: any) => quest.requirements && quest.rewards)).toBe(true);
        expect(calls[1].questions.next.criteria).not.toHaveProperty(comparison.find((quest: any) => quest.title === 'Locked Mining Quest').id);
        expect(calls.at(-1)?.state.account.skills.Mining).toBe(64);
        expect((result.structuredContent?.recommendation as any).guideSummary.steps[0]).toBe('Talk to Doric.');
        expect((result.structuredContent?.recommendation as any).source).toMatchObject({
            contributors: 'RuneScape Wiki contributors', license: 'CC BY-NC-SA 3.0',
            quickGuide: { contributors: 'RuneScape Wiki contributors', license: 'CC BY-NC-SA 3.0' },
        });
        expect((result.structuredContent?.blockedAlternatives as any[])[0]).toMatchObject({
            title: 'Locked Mining Quest', eligibility: 'blocked',
        });
    });

    it('respects membership restrictions while keeping started quests as candidates', async () => {
        mockAccount(); mockWiki(); mockJev();
        const result = await handleTool('recommend_next_activity', { goal: 'Best mining quest',
            context: { username: 'TestPlayer', skills: { Mining: 64, Thieving: 22, Cooking: 53 }, members: false } });
        expect(result.structuredContent?.recommendation).toMatchObject({ title: 'Started Mining Quest', questStatus: 'STARTED' });
        expect((result.structuredContent?.recommendation as any).nextStep).toContain('in-game quest journal');
    });

    it('does not trust an incomplete caller list over the fresh official journal', async () => {
        mockAccount(); mockWiki(); mockJev();
        const result = await handleTool('recommend_next_activity', { goal: 'Best mining quest', context: {
            username: 'TestPlayer', skills: { Mining: 64, Thieving: 22, Cooking: 53 }, members: true,
            completedQuests: ['Ready Mining Quest'],
        } });
        expect(result.structuredContent?.recommendation).toMatchObject({ title: 'Ready Mining Quest' });
        expect((result.structuredContent?.account as any).completedQuests).toEqual(['Finished Mining Quest']);
    });

    it('asks for a public journal when completion data is private', async () => {
        mockJev();
        nock('https://secure.runescape.com').get('/m=hiscore/index_lite.ws').query(true).reply(200, '1,1000,100000');
        nock('https://apps.runescape.com').get('/runemetrics/quests').query(true).reply(200, { error: 'PROFILE_PRIVATE' });
        const result = await handleTool('recommend_next_activity', { goal: 'Best mining quest', context: { username: 'TestPlayer' } });
        expect(result.structuredContent).toMatchObject({ status: 'needs_context', recommendation: null, questCoverage: { evaluated: 0 } });
    });

    it('asks for a username rather than inferring unfinished quests from an incomplete list', async () => {
        mockJev();
        const result = await handleTool('recommend_next_activity', { goal: 'Best mining quest', context: { completedQuests: [] } });
        expect(result.structuredContent).toMatchObject({ status: 'needs_context', usage: { rounds: 1 } });
        expect((result.structuredContent?.missingContext as string[])[0]).toContain('Username');
    });

    it('batches a large catalogue without dropping any unfinished quests or exceeding request limits', async () => {
        const quests: Journal[] = Array.from({ length: 70 }, (_, index) => ({
            title: `Bulk Mining Quest ${index}`, status: 'NOT_STARTED', userEligible: true, members: false, questPoints: 1,
        }));
        mockAccount(quests);
        mockWiki(Object.fromEntries(quests.map((quest, index) => [quest.title, source(quest.title, 1000 + index)])));
        const calls = mockJev();
        const result = await handleTool('recommend_next_activity', { goal: 'Best mining quest',
            context: { username: 'TestPlayer', skills: { Mining: 64 } } });
        expect(result.isError).toBeFalsy();
        expect(result.structuredContent?.questCoverage).toMatchObject({ unfinished: 70, evaluated: 70 });
        const comparisons = calls.slice(1, -1);
        expect(comparisons.length).toBeGreaterThan(1);
        expect(new Set(comparisons.flatMap(call => call.state.quests.map((quest: any) => quest.id))).size).toBe(70);
        expect(calls.every(call => JSON.stringify({ model: 'jev-latest', ...call }).length <= 40_000)).toBe(true);
        expect((result.structuredContent?.usage as any).rounds).toBeLessThanOrEqual(24);
    });
});
