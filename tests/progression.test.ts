import { afterAll, afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import nock from 'nock';
import { guideTables, parseTrainingMethods, inventionRequirements, type Guide } from '../src/wikiGuides.js';
import { standardExperience, experienceGap, planTraining } from '../src/trainingRecommendations.js';
import { buildUnlockPath, rewardDirectlyUnlocks, type UnlockDefinition } from '../src/unlockRecommendations.js';
import { parseQuestPage } from '../src/questParsing.js';
import { attributedWikiSource } from '../src/wikiAttribution.js';
import { JevSession, type ChoiceQuestion } from '../src/jev.js';
import { handleRecommendationTool, recommendationInput } from '../src/tools/recommendationTools.js';
import type { JournalQuest } from '../src/questData.js';
import { trainingLevelFromGoal } from '../src/recommendations.js';

function guide(title: string, html: string): Guide {
    return { title, html, fetchedAt: '2026-10-25T00:00:00Z', revisionId: 123,
        source: attributedWikiSource(title, `https://runescape.wiki/w/${title.replace(/ /g, '_')}`, 'Tables extracted.', 123) };
}
const miningHtml = '<h2 id="rune">Levels 50–99: Runite</h2><p>Mine runite rocks at the Mining Guild.</p>' +
    '<h2 id="stars">Shooting stars</h2><p>Check the daily limit for shooting stars.</p>' +
    '<h2 id="orch">Levels 60–70: Orichalcite</h2><p>Mine orichalcite rocks with a suitable pickaxe.</p>' +
    '<table><tr><th>Levels</th><th>Method</th><th>Experience per hour</th></tr>' +
    '<tr><td>50–99</td><td>Runite</td><td>60,000</td></tr>' +
    '<tr><td>50–99</td><td>Shooting stars</td><td>117,000</td></tr>' +
    '<tr><td>60–70</td><td>Orichalcite</td><td>74,202</td></tr>' +
    '<tr><td>70–80</td><td>Necrite</td><td>95,000</td></tr></table>';
const divinationHtml = '<h2 id="bright">Levels 20–30</h2><p>Harvest bright wisps at the Dig Site.</p>' +
    '<table><tr><th rowspan="2">Levels</th><th rowspan="2">Method</th><th colspan="2">Experience per hour</th></tr>' +
    '<tr><th>Buying additional energy</th><th>Without buying additional energy</th></tr>' +
    '<tr><td>20–30</td><td>Bright wisps</td><td>14,000</td><td>12,000</td></tr>' +
    '<tr><td>30–40</td><td>Glowing wisps</td><td>19,000</td><td>17,000</td></tr></table>';

beforeEach(() => { nock.cleanAll(); nock.disableNetConnect(); });
afterEach(() => nock.cleanAll());
afterAll(() => nock.enableNetConnect());

describe('guide extraction and deterministic progression facts', () => {
    it('preserves multi-row headers and all ordinary Divination methods', () => {
        const methods = parseTrainingMethods(guide('Divination training', divinationHtml), 'Divination', 'unspecified');
        expect(methods).toHaveLength(2);
        expect(methods[0]).toMatchObject({ name: 'Bright wisps', minimumLevel: 20, recommendedUntil: 30,
            rates: [{ label: 'Experience per hour / Buying additional energy', xpPerHour: 14000 },
                { label: 'Experience per hour / Without buying additional energy', xpPerHour: 12000 }] });
    });
    it('matches a method section before another method with the same level band', () => {
        const methods = parseTrainingMethods(guide('Mining training', miningHtml), 'Mining', 'members');
        const stars = methods.find(method => method.name === 'Shooting stars')!;
        expect(stars.evidence).toContain('daily limit');
        expect(stars.evidence).not.toContain('Mining Guild');
        expect(stars.source.url).toContain('#stars');
    });
    it('does not attach Rune essence to Runite prose or an incompatible level band', () => {
        const html = '<h2 id="wrong">Levels 50–99: Runite</h2><p>Wrong runite preparation.</p>' +
            '<h2 id="wrong-band">Levels 50–60: Rune essence</h2><p>Wrong level band.</p>' +
            '<h2 id="right">Levels 1–10: Rune essence</h2><p>Right essence preparation.</p>' +
            '<table><tr><th>Levels</th><th>Method</th><th>XP/hour</th></tr>' +
            '<tr><td>1–10</td><td>Rune essence</td><td>1,000</td></tr></table>';
        const method = parseTrainingMethods(guide('Mining training', html), 'Mining', 'members')[0];
        expect(method.evidence).toContain('Right essence preparation');
        expect(method.evidence).not.toContain('Wrong');
        expect(method.source.url).toContain('#right');
    });
    it('leaves prose unassigned when only a loose or partial name matches', () => {
        const html = '<h2 id="wrong">Levels 1–10: Runite</h2><p>Rune pickaxes help here.</p>' +
            '<table><tr><th>Levels</th><th>Method</th><th>XP/hour</th></tr>' +
            '<tr><td>1–10</td><td>Rune essence</td><td>1,000</td></tr></table>';
        const method = parseTrainingMethods(guide('Mining training', html), 'Mining', 'members')[0];
        expect(method.evidence).not.toContain('pickaxes');
        expect(method.source.url).not.toContain('#');
    });
    it.each(['60', '60+', '60–120'])('keeps entry-level guide requirements for a %s table row', levels => {
        const html = '<h2 id="too-high">Levels 80–90: Orichalcite</h2><p>Wrong higher-level prose.</p>' +
            '<h2 id="broad">Levels 50–70: Orichalcite</h2><p>Less specific prose.</p>' +
            '<h2 id="entry">Levels 60–70: Orichalcite</h2><p>Requires completion of Plague\'s End.</p>' +
            '<table><tr><th>Levels</th><th>Method</th><th>XP/hour</th></tr>' +
            `<tr><td>${levels}</td><td>Orichalcite</td><td>70,000</td></tr></table>`;
        const method = parseTrainingMethods(guide('Mining training', html), 'Mining', 'members')[0];
        expect(method.evidence).toContain("Requires completion of Plague's End");
        expect(method.evidence).not.toContain('higher-level');
        expect(method.evidence).not.toContain('Less specific');
        expect(method.source.url).toContain('#entry');
    });
    it.each(['Levels 1+: Bright wisps', 'Bright wisps', 'Levels 20+: Bright wisps'])('prefers the specific row body over the earlier %s heading', earlier => {
        const html = `<h2 id="earlier">${earlier}</h2><p>Earlier broad prose.</p>` +
            '<h2 id="specific">Levels 20–30</h2><p>Harvest bright wisps. Requires completion of Ode of the Devourer.</p>' +
            '<table><tr><th>Levels</th><th>Method</th><th>XP/hour</th></tr>' +
            '<tr><td>20–30</td><td>Bright wisps</td><td>14,000</td></tr></table>';
        const method = parseTrainingMethods(guide('Divination training', html), 'Divination', 'members')[0];
        expect(method.evidence).toContain('Requires completion of Ode of the Devourer');
        expect(method.evidence).not.toContain('Earlier broad prose');
        expect(method.source.url).toContain('#specific');
    });
    it('does not borrow an earlier open-ended method section when no later-row prose is supported', () => {
        const html = '<h2 id="earlier">Levels 1+: Bright wisps</h2><p>Earlier broad prose.</p>' +
            '<table><tr><th>Levels</th><th>Method</th><th>XP/hour</th></tr>' +
            '<tr><td>20+</td><td>Bright wisps</td><td>14,000</td></tr></table>';
        const method = parseTrainingMethods(guide('Divination training', html), 'Divination', 'members')[0];
        expect(method.evidence).not.toContain('Earlier broad prose');
        expect(method.source.url).not.toContain('#');
    });
    it('keeps nested table cells out of the parent table grid', () => {
        const tables = guideTables(guide('Nested', '<table><tr><td>A<table><tr><td>B</td></tr></table></td><td>C</td></tr></table>'));
        expect(tables[0]).toHaveLength(1);
        expect(tables[0][0]).toHaveLength(2);
        expect(tables[1][0][0].text).toBe('B');
    });
    it('extracts current Invention requirements from sourced prose and refuses absent requirements', () => {
        expect(inventionRequirements(guide('Invention', '<p>Players require level 80 Crafting, Divination, and Smithing to access Invention; these cannot be boosted.</p>')))
            .toEqual({ Crafting: 80, Smithing: 80, Divination: 80 });
        expect(inventionRequirements(guide('Invention', '<p>Requirements unavailable.</p>'))).toBeUndefined();
    });
    it('calculates real standard XP gaps, labels level floors and avoids the elite Invention curve', () => {
        expect(standardExperience(70)).toBe(737627);
        expect(experienceGap('Mining', 64, 70, 428480)).toMatchObject({ remaining: 309147, basis: 'Reported account XP' });
        expect(experienceGap('Mining', 64, 70)?.basis).toContain('upper bound');
        expect(experienceGap('Mining', 64, 70, 1)).toBeNull();
        expect(experienceGap('Invention', 64, 70, 428480)).toBeNull();
    });
});

describe('training goal level targets', () => {
    it.each([
        ['Train Mining to 70', 70],
        ['Train Mining from 64 to 70', 70],
        ['Get 50 GP first, then train Mining to 70', 70],
        ['Currently level 64 Mining; help me train to 70', 70],
        ['Reach level 70', 70],
        ['Get to 70 Mining', 70],
        ['Get 50 GP from Mining', undefined],
        ['Reach 100 XP using Mining', undefined],
        ['Get 100,000 XP from Mining', undefined],
        ['Train Mining to 100k XP', undefined],
        ['Train Mining to 100 k XP', undefined],
        ['Train Mining to 100 XP', undefined],
        ['Train Mining to 20 million XP', undefined],
        ['Train Mining to 100 thousand experience', undefined],
        ['Train Mining to 1 hundred XP', undefined],
        ['Train Mining to 20 billion coins', undefined],
        ['Train Mining to 20 mil XP', undefined],
        ['Train Mining to 20% XP', undefined],
        ['Train Mining to 20 million XP, then reach level 99', 99],
        ['Get 100 Mining XP', undefined],
        ['Train Mining to 10 hours', undefined],
        ['Reach level 121 Mining', undefined],
    ])('interprets %s as %s', (goal, expected) => {
        expect(trainingLevelFromGoal(goal, 'Mining')).toBe(expected);
    });
});

const unlock: UnlockDefinition = { id: 'test', name: 'Test city', requiredQuests: ['Final quest'], requiredSkills: {}, members: true,
    notes: 'Check reward conditions.', source: guide('Unlock guide', '').source };
function journal(title: string, status: JournalQuest['status'] = 'NOT_STARTED'): JournalQuest {
    return { title, status, members: true, userEligible: true, questPoints: 1 };
}
function quest(title: string, requirements = '') {
    return parseQuestPage(title, `{{Quest details|requirements=${requirements}|start=Speak to Doc}}{{Quest rewards|rewards=Access to a city}}`);
}
describe('unlock prerequisite paths', () => {
    it.each(['NOT_STARTED', 'STARTED'] as const)('lets live %s override stale caller completion of the target quest', status => {
        const path = buildUnlockPath(unlock, { members: true, skills: { Mining: 64 }, skillExperience: {}, completedQuests: ['Final quest'] },
            [journal('Final quest', status)], new Map([['final quest', quest('Final quest', '{{Skillreq|Mining|70}}')]]),
            new Map([['Final quest', []]]));
        expect(path.questPath).toMatchObject([{ title: 'Final quest', status }]);
        expect(path.nextActions).toContainEqual(expect.objectContaining({ type: 'train_skill', skill: 'Mining', targetLevel: 70 }));
        expect(path.nextActions.some(action => action.type === 'claim_or_verify')).toBe(false);
    });
    it('uses live prerequisite status for canonical aliases in both the walk and action eligibility', () => {
        const path = buildUnlockPath(unlock, { members: true, skills: {}, skillExperience: {}, completedQuests: ['Canonical quest'] },
            [journal('Final quest'), journal('Journal alias', 'STARTED')],
            new Map([['final quest', quest('Final quest')], ['journal alias', quest('Canonical quest')]]),
            new Map([['Final quest', ['Canonical quest']], ['Canonical quest', []]]));
        expect(path.questPath.map(row => row.title)).toEqual(['Canonical quest', 'Final quest']);
        expect(path.nextActions.filter(action => action.type === 'quest').map(action => action.title)).toEqual(['Canonical quest']);
    });
    it('requires a direct unlock relation rather than an incidental mention of the target', () => {
        expect(rewardDirectlyUnlocks('Access to Prifddinas, the elven city.', 'Prifddinas')).toBe(true);
        expect(rewardDirectlyUnlocks('Ability to use Ancient Curses.', 'Ancient Curses')).toBe(true);
        expect(rewardDirectlyUnlocks('Ability to use any singing bowls, including the one in Prifddinas.', 'Prifddinas')).toBe(false);
        expect(rewardDirectlyUnlocks('A lamp useful for training in Prifddinas.', 'Prifddinas')).toBe(false);
    });
    it('walks prerequisite quests in order and exposes all missing skill targets', () => {
        const metadata = new Map([['final quest', quest('Final quest', '{{Skillreq|Mining|70}}')],
            ['first quest', quest('First quest', '{{Skillreq|Crafting|30}}')]]);
        const path = buildUnlockPath(unlock, { skills: { Mining: 64, Crafting: 40 }, skillExperience: {} },
            [journal('Final quest'), journal('First quest')], metadata,
            new Map([['Final quest', ['First quest']], ['First quest', []]]));
        expect(path.questPath.map(row => row.title)).toEqual(['First quest', 'Final quest']);
        expect(path.nextActions).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'quest', title: 'First quest' }),
            expect.objectContaining({ type: 'train_skill', skill: 'Mining', targetLevel: 70 })]));
    });
    it('skips completed prerequisites without claiming that the final reward was acquired', () => {
        const path = buildUnlockPath(unlock, { skills: {}, skillExperience: {} }, [journal('Final quest', 'COMPLETED')], new Map(), new Map());
        expect(path.questPath).toEqual([]);
        expect(path.alreadyUnlocked).toBe(false);
        expect(path.nextActions[0].type).toBe('claim_or_verify');
    });
    it('keeps missing quest status and unranked skill gaps unknown', () => {
        const path = buildUnlockPath({ ...unlock, requiredSkills: { Divination: 80 } }, { skills: {}, skillExperience: {} }, [], new Map(), new Map());
        expect(path.unknowns).toContain('Completion status unknown: Final quest');
        expect(path.unknowns).toContain('Current Divination level is unknown.');
        expect(path.skillRequirements[0].experience).toBeNull();
        expect(path.nextActions).toEqual([]);
    });
    it('detects cycles and does not treat missing dependency metadata as no prerequisites', () => {
        const metadata = new Map([['final quest', quest('Final quest')], ['first quest', quest('First quest')]]);
        const path = buildUnlockPath(unlock, { skills: {}, skillExperience: {} }, [journal('Final quest'), journal('First quest')], metadata,
            new Map([['Final quest', ['First quest']], ['First quest', ['Final quest']]]));
        expect(path.unknowns.join(' ')).toContain('Cyclic');
        expect(path.nextActions).toEqual([]);
        const missing = buildUnlockPath(unlock, { skills: {}, skillExperience: {} }, [journal('Final quest')], metadata, new Map());
        expect(missing.unknowns).toContain('Prerequisites unknown: Final quest');
    });
    it('requires membership and does not invent eligibility for an unranked level-one Invention skill', () => {
        const target = { ...unlock, name: 'Invention', requiredQuests: [], requiredSkills: { Crafting: 80, Smithing: 80, Divination: 80 } };
        const path = buildUnlockPath(target, { members: false, skills: { Invention: 1, Crafting: 67, Smithing: 71, Divination: 28 }, skillExperience: {} }, [], new Map(), new Map());
        expect(path.alreadyUnlocked).toBe(false);
        expect(path.nextActions).toEqual([]);
        expect(path.blockers).toContain('Membership is required for this unlock.');
    });
    it('never offers reward claiming while an ineligible prerequisite quest is unfinished', () => {
        const path = buildUnlockPath(unlock, { skills: {}, skillExperience: {} },
            [{ ...journal('Final quest'), userEligible: false }], new Map([['final quest', quest('Final quest')]]),
            new Map([['Final quest', []]]));
        expect(path.nextActions).toEqual([]);
        expect(path.unknowns.join(' ')).toContain('ineligible');
    });
});

function mockWiki(title: string, html: string) {
    return nock('https://runescape.wiki').get('/api.php').query(q => q.action === 'parse' && q.page === title)
        .reply(200, { parse: { title, revid: 123, text: { '*': html } } });
}
function mockJev(pick: (id: string, question: ChoiceQuestion, state: any) => string, calls: any[]) {
    return nock('https://api.typesafe.ai').post('/v1/systemone').reply(async (request: Request) => {
        const body = await request.json() as { state: any; questions: Record<string, ChoiceQuestion> };
        calls.push(body);
        const answers = Object.fromEntries(Object.entries(body.questions).map(([id, question]) => {
            const choice = pick(id, question, body.state);
            return [id, { type: 'choice', choice, confidence: 0.8,
                probabilities: Object.fromEntries(Object.keys(question.criteria).map(key => [key, key === choice ? 1 : 0])) }];
        }));
        return [200, { model: 'jev-test', answers, usage: { input_tokens: 100, output_tokens: 10 } }];
    });
}
describe('combined training-guide membership facts', () => {
    it.each([['Membership', 'F2P', 'P2P'], ['Free-to-play', 'Yes', 'No']])(
        'interprets explicit %s facts without marking member methods as free', (column, free, members) => {
            const html = `<table><tr><th>Levels</th><th>Method</th><th>XP/hour</th><th>${column}</th></tr>` +
                `<tr><td>1–20</td><td>Free method</td><td>10000</td><td>${free}</td></tr>` +
                `<tr><td>1–20</td><td>Members method</td><td>20000</td><td>${members}</td></tr></table>`;
            expect(parseTrainingMethods(guide('Combined training', html), 'Mining', 'unspecified')
                .map(method => method.membership)).toEqual(['free', 'members']);
        });
});

describe('bounded training decisions', () => {
    it.each([['Cooking', 0], ['Woodcutting', 1700]] as const)(
        'retains early milestones when %s methods exceed count or request-size limits', async (skill, padding) => {
            const rows = Array.from({ length: 40 }, (_, i) =>
                `<tr><td>${i + 1}–120</td><td>Method ${i + 1}</td><td>10000</td><td>${'x'.repeat(padding)}</td></tr>`).join('');
            mockWiki(`Pay-to-play ${skill} training`, '<table><tr><th>Levels</th><th>Method</th><th>XP/hour</th><th>Requirements</th></tr>' + rows + '</table>');
            const calls: any[] = [];
            mockJev((_id, question, state) => {
                expect(JSON.stringify({ model: 'jev-test', state, questions: calls[0].questions }).length).toBeLessThanOrEqual(40000);
                const eligible = state.methods.filter((method: any) => Object.hasOwn(question.criteria, method.id));
                expect(eligible.length).toBeGreaterThan(0);
                return eligible.sort((a: any, b: any) => b.minimumLevel - a.minimumLevel)[0].id;
            }, calls);
            const plan = await planTraining(`${skill} to 120`, { members: true, skills: { [skill]: 1 }, skillExperience: {}, budgetGp: 0, gear: [] },
                skill, 120, new JevSession({ apiKey: 'test', model: 'jev-test' }), AbortSignal.timeout(5000));
            expect(plan.steps.map(step => step.method.minimumLevel)).toEqual([1, 2, 3, 4, 5, 6]);
            expect(plan.coverage.parsedMethods).toBe(40);
            expect(plan.coverage.comparedMethods).toBeLessThanOrEqual(30);
            if (padding) expect(plan.coverage.comparedMethods).toBeLessThan(30);
            expect(calls).toHaveLength(1);
        });

    it('requests less context without a paid call if the reserved milestone evidence cannot fit', async () => {
        const account = { members: true, skills: { Fletching: 1 }, skillExperience: {}, budgetGp: 0,
            completedQuests: Array(100).fill('Quest'.padEnd(100, 'q')), gear: Array(100).fill('Gear'.padEnd(80, 'g')),
            notes: 'x'.repeat(1000) };
        const input = { goal: 'Fletching to 120', context: account };
        expect(recommendationInput.safeParse(input).success).toBe(true);
        expect(JSON.stringify(input).length).toBeLessThan(20000);
        const rows = Array.from({ length: 40 }, (_, i) =>
            `<tr><td>${i + 1}–120</td><td>Method ${i + 1}</td><td>10000</td><td>${'x'.repeat(1700)}</td></tr>`).join('');
        mockWiki('Pay-to-play Fletching training', '<table><tr><th>Levels</th><th>Method</th><th>XP/hour</th><th>Requirements</th></tr>' + rows + '</table>');
        const session = new JevSession({ apiKey: 'test', model: 'jev-test' });
        const plan = await planTraining(input.goal, account, 'Fletching', 120, session, AbortSignal.timeout(5000));
        expect(plan.status).toBe('needs_context');
        expect(plan.missingContext).toContainEqual(expect.stringContaining('milestone evidence exceeds the request limit'));
        expect(plan.coverage.comparedMethods).toBe(0);
        expect(session.usage.rounds).toBe(0);
    });

    it('keeps combined-guide methods conditional for non-members when the free guide is missing', async () => {
        nock('https://runescape.wiki').get('/api.php').query(q => q.page === 'Free-to-play Fishing training')
            .reply(200, { error: { code: 'missingtitle' } });
        mockWiki('Fishing training', '<table><tr><th>Levels</th><th>Method</th><th>XP/hour</th></tr>' +
            '<tr><td>1–20</td><td>Net fishing</td><td>10000</td></tr></table>');
        const calls: any[] = [];
        mockJev((_id, question) => Object.entries(question.criteria).find(([, label]) => label.startsWith('Net fishing'))![0], calls);
        const plan = await planTraining('Fishing to 20', { members: false, skills: { Fishing: 1 }, skillExperience: {}, budgetGp: 0, gear: [] },
            'Fishing', 20, new JevSession({ apiKey: 'test', model: 'jev-test' }), AbortSignal.timeout(5000));
        expect(plan.status).toBe('needs_context');
        expect(plan.steps[0]).toMatchObject({ conditional: true, method: { name: 'Net fishing', membership: 'unspecified' } });
        expect(plan.missingContext).toContainEqual(expect.stringContaining('Verify free-to-play access'));
        expect(calls).toHaveLength(1);
        expect(nock.isDone()).toBe(true);
    });

    it('uses explicit row membership in a combined guide and excludes members-only methods for F2P', async () => {
        nock('https://runescape.wiki').get('/api.php').query(q => q.page === 'Free-to-play Firemaking training')
            .reply(200, { error: { code: 'missingtitle' } });
        mockWiki('Firemaking training', '<table><tr><th>Levels</th><th>Method</th><th>XP/hour</th><th>Members</th></tr>' +
            '<tr><td>1–20</td><td>Logs</td><td>10000</td><td>No</td></tr>' +
            '<tr><td>1–20</td><td>Members logs</td><td>20000</td><td>Yes</td></tr></table>');
        const calls: any[] = [];
        mockJev((_id, question, state) => {
            expect(state.methods.map((method: any) => method.name)).toEqual(['Logs']);
            return Object.entries(question.criteria).find(([, label]) => label === 'Logs (free)')![0];
        }, calls);
        const plan = await planTraining('Firemaking to 20', { members: false, skills: { Firemaking: 1 }, skillExperience: {}, budgetGp: 0, gear: [] },
            'Firemaking', 20, new JevSession({ apiKey: 'test', model: 'jev-test' }), AbortSignal.timeout(5000));
        expect(plan.status).toBe('recommended');
        expect(plan.steps[0]).toMatchObject({ conditional: false, method: { name: 'Logs', membership: 'free' } });
        expect(nock.isDone()).toBe(true);
    });

    it('excludes future-level methods from the immediate choice and returns a concrete conditional method', async () => {
        mockWiki('Pay-to-play Mining training', miningHtml);
        const calls: any[] = [];
        mockJev((_id, question) => Object.entries(question.criteria).find(([, label]) => label.startsWith('Orichalcite'))![0], calls);
        const plan = await planTraining('Mining to 70', { members: true, skills: { Mining: 64 }, skillExperience: { Mining: 428480 } },
            'Mining', 70, new JevSession({ apiKey: 'test', model: 'jev-test' }), AbortSignal.timeout(5000));
        expect(plan.steps[0].method.name).toBe('Orichalcite');
        expect(Object.values(calls[0].questions.step_0.criteria).join(' ')).not.toContain('Necrite');
        expect(plan.experience?.remaining).toBe(309147);
        expect(plan.status).toBe('needs_context');
        expect(plan.steps[0].method.source).toHaveProperty('revisionId', 123);
    });
    it('supports training past a recommended band and does not use it as an eligibility maximum', async () => {
        mockWiki('Free-to-play Mining training', miningHtml);
        const calls: any[] = [];
        mockJev((_id, question) => Object.entries(question.criteria).find(([, label]) => label.startsWith('Runite'))![0], calls);
        const plan = await planTraining('Mining to 105', { members: false, skills: { Mining: 100 }, skillExperience: {}, budgetGp: 0, gear: [] },
            'Mining', 105, new JevSession({ apiKey: 'test', model: 'jev-test' }), AbortSignal.timeout(5000));
        expect(plan.steps[0].method.name).toBe('Runite');
        expect(plan.steps[0].method.membership).toBe('free');
    });
    it('does not make a paid decision if the target is already met or the skill is unknown', async () => {
        const session = new JevSession({ apiKey: 'test', model: 'jev-test' });
        expect((await planTraining('Mining to 60', { skills: { Mining: 64 }, skillExperience: {} }, 'Mining', 60, session, AbortSignal.timeout(1000))).status).toBe('goal_met');
        expect((await planTraining('Mining to 60', { skills: {}, skillExperience: {} }, 'Mining', 60, session, AbortSignal.timeout(1000))).missingContext).toContain('Current Mining level');
        expect(session.usage.rounds).toBe(0);
    });
    it('excludes an explicitly quest-locked method and retains only relevant fresh quest statuses', async () => {
        mockWiki('Pay-to-play Smithing training', '<h2>Forging bars</h2><p>Requires completion of Plague\'s End.</p>' +
            '<table><tr><th>Levels</th><th>Method</th><th>XP/hour</th></tr><tr><td>70–80</td><td>Forging bars</td><td>100,000</td></tr></table>');
        nock('https://apps.runescape.com').get('/runemetrics/quests').query({ user: 'Fixture' }).reply(200,
            { quests: [journal("Plague's End"), journal("Cook's Assistant", 'COMPLETED')] });
        const calls: any[] = [];
        mockJev(() => 'none', calls);
        const session = new JevSession({ apiKey: 'test', model: 'jev-test' });
        const plan = await planTraining('Smithing to 80', { username: 'Fixture', members: true, skills: { Smithing: 71 }, skillExperience: {},
            completedQuests: ["Plague's End"] }, 'Smithing', 80, session, AbortSignal.timeout(5000));
        expect(plan.questJournal).toMatchObject({ total: 2, completed: [], unfinished: ["Plague's End"] });
        expect(JSON.stringify(plan.questJournal)).not.toContain("Cook's Assistant");
        expect(plan.blockedMethods).toEqual([{ method: 'Forging bars', blockers: [expect.stringContaining("Plague's End")] }]);
        expect(plan.status).toBe('no_match');
        expect(calls).toHaveLength(0);
        expect(session.usage.rounds).toBe(0);
    });
    it('routes an Invention goal into all three requirements and a concrete ordinary Divination method', async () => {
        const enabled = process.env.RUNESCAPE_RECOMMENDATIONS_ENABLED, key = process.env.TYPESAFE_API_KEY;
        process.env.RUNESCAPE_RECOMMENDATIONS_ENABLED = 'true'; process.env.TYPESAFE_API_KEY = 'fake-test-key';
        try {
            mockWiki('Invention', '<p>Players require level 80 Crafting, Divination, and Smithing to access Invention; all cannot be boosted.</p>');
            nock('https://runescape.wiki').get('/api.php').query(q => q.page === 'Pay-to-play Divination training').reply(200, { error: { code: 'missingtitle' } });
            mockWiki('Divination training', divinationHtml);
            const calls: any[] = [];
            mockJev(id => id === 'category' ? 'unlocking' : 'Invention', calls);
            mockJev((id, _question, state) => id === 'target' ? 'u0' : state.targets[0].nextActions.find((action: any) => action.skill === 'Divination').id, calls);
            mockJev((_id, question) => Object.entries(question.criteria).find(([, label]) => label.startsWith('Bright wisps'))![0], calls);
            const response = await handleRecommendationTool('recommend_next_activity', { goal: 'Unlock Invention', context: {
                members: true, skills: { Crafting: 67, Smithing: 71, Divination: 28, Invention: 1 } } });
            expect(response.isError).toBeFalsy();
            expect(response.structuredContent).toMatchObject({ recommendation: { title: 'Invention', nextStep: expect.stringContaining('Bright wisps') },
                unlockPlan: { skillRequirements: expect.arrayContaining([
                    expect.objectContaining({ skill: 'Crafting', requiredLevel: 80 }), expect.objectContaining({ skill: 'Smithing', requiredLevel: 80 }),
                    expect.objectContaining({ skill: 'Divination', requiredLevel: 80 })]) }, usage: { rounds: 3 } });
            expect(calls).toHaveLength(3);
        } finally {
            if (enabled === undefined) delete process.env.RUNESCAPE_RECOMMENDATIONS_ENABLED; else process.env.RUNESCAPE_RECOMMENDATIONS_ENABLED = enabled;
            if (key === undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY = key;
        }
    });
});
