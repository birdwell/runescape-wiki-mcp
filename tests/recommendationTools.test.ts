import { afterAll, afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { createMcpHandler } from '@modelcontextprotocol/server';
import nock from 'nock';
import { JevSession, type ChoiceQuestion } from '../src/jev.js';
import { createServer } from '../src/server.js';
import { handleTool } from '../src/tools/index.js';
import { recommendationInput } from '../src/tools/recommendationTools.js';

const originalEnabled = process.env.RUNESCAPE_RECOMMENDATIONS_ENABLED;
const originalKey = process.env.TYPESAFE_API_KEY;
let sequence = 0;
type RequestBody = { state: Record<string, any>; questions: Record<string, ChoiceQuestion> };

function answer(question: ChoiceQuestion, selected: string, confidence = 1) {
    return { type: 'choice', choice: selected, confidence,
        probabilities: Object.fromEntries(Object.keys(question.criteria).map(key => [key, key === selected ? 1 : 0])) };
}

function fixture(options: {
    eligibility?: string; budget?: string; session?: string; confidence?: number;
    pages?: number; extractFailure?: boolean;
} = {}) {
    sequence += 1;
    const titles = Array.from({ length: options.pages ?? 2 }, (_, index) => `Prayer method ${sequence}-${index}`);
    const calls: RequestBody[] = [];
    const extracts = 'Train Prayer using this method. Check the skill level and any unlocks before starting. ' +
        'There is no supported exact cost or duration in this fixture.';
    nock('https://runescape.wiki').get('/api.php').query(q => q.list === 'search').twice().reply(200, {
        query: { search: titles.map(title => ({ title, snippet: 'A Prayer training method.' })) },
    });
    for (const title of titles.slice(0, 3)) {
        nock('https://runescape.wiki').get('/api.php').query(q => q.titles === title)
            .reply(options.extractFailure ? 503 : 200, {
                query: { pages: { '1': { title, extract: extracts } } },
            });
    }
    nock('https://api.typesafe.ai').post('/v1/systemone').times(3).reply(async (requestMessage: Request) => {
        const request = await requestMessage.json() as RequestBody;
        calls.push(request);
        const answers = Object.fromEntries(Object.entries(request.questions).map(([id, question]) => {
            let selected = 'direct';
            if (id === 'category') selected = 'skilling';
            if (id === 'skill') selected = 'Prayer';
            if (id.endsWith('_eligibility')) selected = options.eligibility ?? 'unknown';
            if (id.endsWith('_budget')) selected = options.budget ?? 'unknown';
            if (id.endsWith('_session')) selected = options.session ?? 'unknown';
            return [id, answer(question, selected, options.confidence ?? 1)];
        }));
        return [200, { model: 'jev-test', answers, usage: { input_tokens: 100, output_tokens: 10 } }];
    });
    return { calls, titles };
}

beforeEach(() => {
    nock.cleanAll();
    nock.disableNetConnect();
    process.env.RUNESCAPE_RECOMMENDATIONS_ENABLED = 'true';
    process.env.TYPESAFE_API_KEY = 'test-key-never-live';
});

afterEach(() => { nock.cleanAll(); });
afterAll(() => {
    nock.enableNetConnect();
    if (originalEnabled === undefined) delete process.env.RUNESCAPE_RECOMMENDATIONS_ENABLED;
    else process.env.RUNESCAPE_RECOMMENDATIONS_ENABLED = originalEnabled;
    if (originalKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = originalKey;
});

describe('recommend_next_activity', () => {
    it('executes the three-stage loop and preserves unknown account facts', async () => {
        const { calls, titles } = fixture();
        const response = await handleTool('recommend_next_activity', {
            goal: 'Train Prayer toward bossing', context: { skills: { Prayer: 50 }, budgetGp: 0 },
        });
        expect(response.isError).toBeFalsy();
        expect(calls).toHaveLength(3);
        expect(calls[0].state.account.skills).toEqual({ Prayer: 50 });
        expect(calls[0].state.account.budgetGp).toBe(0);
        expect(calls[0].state.account.gear).toBeUndefined();
        expect(calls[2].state.pages[0].evidence).toContain('Train Prayer');
        expect(response.structuredContent).toMatchObject({
            status: 'needs_context',
            recommendation: { title: titles[0], conditional: true, requirementsVerified: false },
            usage: { rounds: 3, inputTokens: 300, outputTokens: 30, maxRounds: 3 },
        });
        expect(response.structuredContent?.missingContext).toContain('Relevant completed quests and unlocks');
        expect(response.structuredContent?.missingContext).not.toContain('Available spending budget in GP');
        expect(response.structuredContent?.sources).toHaveLength(2);
    });

    it('excludes candidates judged blocked instead of recommending around known restrictions', async () => {
        fixture({ eligibility: 'blocked' });
        const response = await handleTool('recommend_next_activity', { goal: 'Train Prayer' });
        expect(response.structuredContent).toMatchObject({ status: 'no_match', recommendation: null, alternatives: [] });
    });

    it.each([{ budget: 'exceeds' }, { session: 'conflicts' }])('excludes candidates with a known constraint conflict %j', async options => {
        fixture(options);
        const response = await handleTool('recommend_next_activity', { goal: 'Train Prayer' });
        expect(response.structuredContent?.recommendation).toBeNull();
    });

    it('returns a nonconditional recommendation only when all assessed dimensions support it', async () => {
        fixture({ eligibility: 'possible', budget: 'fits', session: 'fits' });
        const response = await handleTool('recommend_next_activity', { goal: 'Train Prayer', context: {
            skills: { Prayer: 50 }, gameMode: 'normal', members: true, completedQuests: [],
            gear: [], budgetGp: 1000, sessionMinutes: 20, playStyle: 'active',
        } });
        expect(response.structuredContent).toMatchObject({ status: 'recommended', missingContext: [],
            recommendation: { conditional: false, requirementsVerified: false } });
    });

    it('does not treat low-confidence choices as a confident recommendation', async () => {
        const { calls } = fixture({ confidence: 0.1 });
        const response = await handleTool('recommend_next_activity', { goal: 'Train Prayer' });
        expect(response.structuredContent?.recommendation).toBeNull();
        expect(calls).toHaveLength(2);
    });

    it('fetches public hiscores and records per-skill provenance without overwriting supplied levels', async () => {
        const { calls } = fixture();
        nock('https://secure.runescape.com').get('/m=hiscore/index_lite.ws')
            .query({ player: 'TestPlayer' }).reply(200, '1,2000,100000\n1,80,10000\n1,70,9000');
        const response = await handleTool('recommend_next_activity', { goal: 'Train Prayer',
            context: { username: 'TestPlayer', skills: { Attack: 90 } } });
        expect(calls[0].state.account.skills).toEqual({ Attack: 90, Defence: 70 });
        expect(response.structuredContent?.account).toMatchObject({
            skillSources: { Attack: 'caller', Defence: 'hiscores' },
        });
    });

    it('does not substitute normal hiscores when ironman lookup fails', async () => {
        fixture();
        const ironman = nock('https://secure.runescape.com').get('/m=hiscore_ironman/index_lite.ws')
            .query(true).reply(404);
        const response = await handleTool('recommend_next_activity', { goal: 'Train Prayer',
            context: { username: 'TestPlayer', gameMode: 'ironman' } });
        expect(ironman.isDone()).toBe(true);
        expect(response.structuredContent?.account).toMatchObject({ skills: {} });
        expect((response.structuredContent?.warnings as string[]).join(' ')).toContain('HTTP 404');
    });

    it('excludes completed quest titles before evaluating candidates', async () => {
        const { titles, calls } = fixture();
        const response = await handleTool('recommend_next_activity', { goal: 'Train Prayer',
            context: { completedQuests: [titles[0]] } });
        expect(calls[1].state.candidates).toHaveLength(1);
        expect(response.structuredContent?.recommendation).toMatchObject({ title: titles[1] });
    });

    it('bounds searches to six candidates and reads no more than three pages', async () => {
        const { calls } = fixture({ pages: 10 });
        const response = await handleTool('recommend_next_activity', { goal: 'Train Prayer' });
        expect(calls[1].state.candidates).toHaveLength(6);
        expect(calls[2].state.pages).toHaveLength(3);
        expect(response.structuredContent?.alternatives).toHaveLength(2);
    });

    it('does not evaluate candidates whose wiki extract could not be fetched', async () => {
        const { calls } = fixture({ extractFailure: true });
        const response = await handleTool('recommend_next_activity', { goal: 'Train Prayer' });
        expect(calls).toHaveLength(2);
        expect(response.structuredContent).toMatchObject({ status: 'no_match', recommendation: null });
    });

    it('returns an empty result without further Jev calls when searches find nothing', async () => {
        fixture({ pages: 0 });
        const response = await handleTool('recommend_next_activity', { goal: 'Train Prayer' });
        expect(response.structuredContent).toMatchObject({ status: 'no_match', usage: { rounds: 1 } });
    });

    it('fails closed without operator opt-in, before any network calls', async () => {
        delete process.env.RUNESCAPE_RECOMMENDATIONS_ENABLED;
        const response = await handleTool('recommend_next_activity', { goal: 'Train Prayer' });
        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('Recommendations are disabled');
    });

    it('requires a key even when enabled', async () => {
        delete process.env.TYPESAFE_API_KEY;
        const response = await handleTool('recommend_next_activity', { goal: 'Train Prayer' });
        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('TYPESAFE_API_KEY');
    });

    it.each([
        {}, { goal: ' ' }, { goal: 'x', unexpected: true },
        { goal: 'x', context: { budgetGp: -1 } }, { goal: 'x', context: { sessionMinutes: 0 } },
        { goal: 'x', context: { skills: { Sailing: 50 } } },
        { goal: 'x', context: { skills: { Prayer: 121 } } },
        { goal: 'x', context: { username: '../secret' } },
        { goal: 'x', context: { apiKey: 'do-not-accept' } },
    ])('rejects malformed inputs before network access: %j', async args => {
        expect(recommendationInput.safeParse(args).success).toBe(false);
        expect((await handleTool('recommend_next_activity', args)).isError).toBe(true);
    });

    it('does not reflect a provider error body or retry a failed paid request', async () => {
        const provider = nock('https://api.typesafe.ai').post('/v1/systemone')
            .reply(429, 'sensitive provider detail test-key-never-live');
        const response = await handleTool('recommend_next_activity', { goal: 'Train Prayer' });
        expect(provider.isDone()).toBe(true);
        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('HTTP 429');
        expect(response.content[0].text).not.toContain('sensitive');
        expect(response.content[0].text).not.toContain('test-key');
    });

    it('rejects provider-selected values outside the server-defined choices', async () => {
        nock('https://api.typesafe.ai').post('/v1/systemone').reply(200, {
            model: 'jev-test', answers: { category: { type: 'choice', choice: 'execute_shell',
                confidence: 1, probabilities: { execute_shell: 1 } } },
            usage: { input_tokens: 1, output_tokens: 1 },
        });
        const response = await handleTool('recommend_next_activity', { goal: 'Train Prayer' });
        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('out-of-range');
    });

    it('exposes and calls the recommendation tool through the real MCP HTTP handler', async () => {
        fixture();
        const handler = createMcpHandler(() => createServer());
        const response = await handler.fetch(new Request('http://test.local/mcp', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream',
                'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/call',
                'Mcp-Name': 'recommend_next_activity' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
                name: 'recommend_next_activity', arguments: { goal: 'Train Prayer' },
                _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28',
                    'io.modelcontextprotocol/clientInfo': { name: 'recommendation-test', version: '1' },
                    'io.modelcontextprotocol/clientCapabilities': {} },
            } }),
        }));
        const body = await response.text();
        const data = body.split('\n').find(line => line.startsWith('data: '));
        const message = JSON.parse(data ? data.slice(6) : body);
        expect(response.status).toBe(200);
        expect(message.error).toBeUndefined();
        expect(message.result.structuredContent).toMatchObject({ status: 'needs_context', usage: { rounds: 3 } });
        await handler.close();
    });
});

describe('Jev session budget', () => {
    it('refuses a fourth request and sends the key only in the authorization header', async () => {
        const question = { type: 'choice' as const, instructions: 'Which?', criteria: { yes: 'Yes', no: 'No' } };
        nock('https://api.typesafe.ai', { reqheaders: { authorization: 'Bearer private-test-key' } })
            .post('/v1/systemone', body => !JSON.stringify(body).includes('private-test-key')).times(3)
            .reply(200, { model: 'jev-test', answers: { q: answer(question, 'yes') },
                usage: { input_tokens: 10, output_tokens: 1 } });
        const session = new JevSession({ apiKey: 'private-test-key', model: 'jev-latest' });
        const signal = AbortSignal.timeout(1000);
        for (let i = 0; i < 3; i += 1) await session.decide({}, { q: question }, signal);
        await expect(session.decide({}, { q: question }, signal)).rejects.toThrow('round limit');
        expect(session.usage.rounds).toBe(3);
    });
});
