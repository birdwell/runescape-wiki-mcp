import { z } from 'zod';
import { RUNESCAPE_WIKI_API } from './constants.js';
import { makeApiRequest } from './utils.js';
import { parseQuestDependencies, parseQuestPage, templates, wikiText, type QuestMetadata } from './questParsing.js';

export const RUNEMETRICS_QUESTS = 'https://apps.runescape.com/runemetrics/quests';
export const questJournalSchema = z.object({ quests: z.array(z.object({
    title: z.string().min(1).max(255),
    status: z.enum(['COMPLETED', 'STARTED', 'NOT_STARTED']),
    members: z.boolean(),
    userEligible: z.boolean(),
    questPoints: z.number().int().nonnegative(),
})).min(1).max(600) });
export type JournalQuest = z.infer<typeof questJournalSchema>['quests'][number];

export async function fetchPlayerQuests(username: string, signal?: AbortSignal) {
    const source = `${RUNEMETRICS_QUESTS}?user=${encodeURIComponent(username)}`;
    const raw = await makeApiRequest(source, signal);
    const parsed = questJournalSchema.safeParse(raw);
    if (!parsed.success) {
        throw new Error('RuneMetrics quest journal is unavailable or private. Make the RuneMetrics profile public to use account-specific quest recommendations. No completion statuses were inferred.');
    }
    const quests = parsed.data.quests;
    if (new Set(quests.map(quest => quest.title)).size !== quests.length) {
        throw new Error('RuneMetrics returned duplicate quest titles; no completion statuses were inferred.');
    }
    return { username, source, fetchedAt: new Date().toISOString(), quests,
        counts: {
            total: quests.length,
            completed: quests.filter(quest => quest.status === 'COMPLETED').length,
            started: quests.filter(quest => quest.status === 'STARTED').length,
            notStarted: quests.filter(quest => quest.status === 'NOT_STARTED').length,
        },
    };
}

interface RevisionPage {
    title: string;
    missing?: unknown;
    revisions?: { revid?: number; slots?: { main?: { '*'?: string } } }[];
}
interface RevisionResponse {
    error?: unknown;
    continue?: unknown;
    query?: {
        pages?: Record<string, RevisionPage>;
        normalized?: { from: string; to: string }[];
        redirects?: { from: string; to: string }[];
    };
}
const TTL = 6 * 60 * 60_000;
// Public quest metadata only. Account journals are always fetched fresh and never cached here.
const pageCache = new Map<string, { until: number; metadata: QuestMetadata }>();
let dependencyCache: { until: number; values: Map<string, string[]> } | undefined;
const DEPENDENCY_PAGE = 'Module:Questreq/data';

export function questKey(title: string): string {
    return title.replace(/_/g, ' ').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
}

async function revisions(titles: string[], signal: AbortSignal): Promise<RevisionResponse> {
    const params = new URLSearchParams({ action: 'query', format: 'json', prop: 'revisions',
        rvprop: 'ids|content', rvslots: 'main', redirects: '1', titles: titles.join('|') });
    const response = await makeApiRequest(`${RUNESCAPE_WIKI_API}?${params}`,
        AbortSignal.any([signal, AbortSignal.timeout(12_000)])) as RevisionResponse;
    if (response.error || response.continue || !response.query?.pages) {
        throw new Error('Wiki quest catalogue response was incomplete. No claim of full quest coverage can be made.');
    }
    return response;
}

export async function fetchQuestGuide(title: string, signal: AbortSignal) {
    const response = await revisions([`${title}/Quick guide`], signal);
    const page = Object.values(response.query!.pages!)[0];
    const source = page?.revisions?.[0]?.slots?.main?.['*'];
    if (!source || page.missing !== undefined) return { steps: [] as string[], preparation: [] as string[] };
    const beforeRewards = source.split(/^==\s*Rewards?\s*==/im)[0];
    const checklists = templates(beforeRewards, 'Checklist');
    const text = checklists.length
        ? checklists.map(parts => wikiText(parts.slice(1).join('|'))).join('\n') : wikiText(beforeRewards);
    const steps: string[] = [];
    for (const line of text.split('\n').map(line => line.trim())) {
        if (/^(\*(?!\*)|#(?!#))/.test(line)) steps.push(line.replace(/^[*#]\s*/, ''));
        else if (/^[*#]{2,}/.test(line) && steps.length) {
            steps[steps.length - 1] += `; ${line.replace(/^[*#]+\s*/, '')}`;
        }
    }
    return {
        steps: steps.slice(0, 8).map(line => line.length <= 700 ? line : `${line.slice(0, 680)}… (continued in guide)`),
        preparation: [...new Set(templates(beforeRewards, 'Needed').flatMap(parts => parts.slice(1)
            .filter(part => !part.includes('=')).map(wikiText)))].slice(0, 8),
    };
}

export async function fetchQuestCatalogue(titles: string[], signal: AbortSignal) {
    if (titles.length > 600) throw new Error('Quest catalogue limit exceeded.');
    const metadata = new Map<string, QuestMetadata>();
    const pending: string[] = [];
    for (const title of titles) {
        const cached = pageCache.get(questKey(title));
        if (cached && cached.until > Date.now()) metadata.set(questKey(title), cached.metadata);
        else pending.push(title);
    }
    if (!dependencyCache || dependencyCache.until <= Date.now()) pending.unshift(DEPENDENCY_PAGE);
    const batches: string[][] = [];
    for (let i = 0; i < pending.length; i += 40) batches.push(pending.slice(i, i + 40));
    // Respect the wiki: at most two upstream catalogue fetches concurrently.
    for (let i = 0; i < batches.length; i += 2) {
        const responses = await Promise.all(batches.slice(i, i + 2).map(async batch => ({
            batch, response: await revisions(batch, signal),
        })));
        for (const { batch, response } of responses) {
            const pages = new Map(Object.values(response.query!.pages!).map(page => [questKey(page.title), page]));
            const redirects = new Map([...(response.query!.normalized ?? []), ...(response.query!.redirects ?? [])]
                .map(alias => [questKey(alias.from), questKey(alias.to)]));
            for (const requested of batch) {
                let key = questKey(requested);
                const seen = new Set<string>();
                while (redirects.has(key) && !seen.has(key)) { seen.add(key); key = redirects.get(key)!; }
                const page = pages.get(key);
                const revision = page?.revisions?.[0];
                const source = revision?.slots?.main?.['*'];
                if (!page || page.missing !== undefined || !source) continue;
                if (requested === DEPENDENCY_PAGE) {
                    const values = parseQuestDependencies(source);
                    if (values.size < 1) throw new Error('Wiki quest prerequisite table could not be parsed.');
                    dependencyCache = { until: Date.now() + TTL, values };
                } else {
                    const parsed = parseQuestPage(page.title, source, revision.revid);
                    metadata.set(questKey(requested), parsed);
                    if (pageCache.size >= 1200) pageCache.delete(pageCache.keys().next().value!);
                    pageCache.set(questKey(requested), { until: Date.now() + TTL, metadata: parsed });
                }
            }
        }
    }
    // Some journal names are also a boss or D&D page, not a redirect to the quest.
    // Resolve the quest-disambiguated page and retain the journal alias for status matching.
    const ambiguous = titles.filter(title => !metadata.get(questKey(title))?.available && !/\(quest\)$/i.test(title));
    if (ambiguous.length) {
        const fallback = await fetchQuestCatalogue(ambiguous.map(title => `${title} (quest)`), signal);
        for (const title of ambiguous) {
            const parsed = fallback.metadata.get(questKey(`${title} (quest)`));
            if (parsed?.available) {
                metadata.set(questKey(title), parsed);
                pageCache.set(questKey(title), { until: Date.now() + TTL, metadata: parsed });
            }
        }
    }
    const dependencies = dependencyCache?.values ?? new Map<string, string[]>();
    const missingDependencies = [...new Set([...metadata.values()].filter(page => page.available &&
        !dependencies.has(page.title)).map(page => page.title))];
    // A missing Lua-table entry can mean "None" in the wiki renderer. Verify that
    // explicitly rather than assuming absence is proof of no prerequisites.
    if (missingDependencies.length <= 12) {
        for (let i = 0; i < missingDependencies.length; i += 2) {
            await Promise.all(missingDependencies.slice(i, i + 2).map(async title => {
                const params = new URLSearchParams({ action: 'expandtemplates', format: 'json', prop: 'wikitext',
                    title, text: `{{Questreq|${title}}}` });
                try {
                    const result = await makeApiRequest(`${RUNESCAPE_WIKI_API}?${params}`,
                        AbortSignal.any([signal, AbortSignal.timeout(8_000)]));
                    const rendered = result.expandtemplates?.wikitext;
                    if (typeof rendered !== 'string') return;
                    const links = [...rendered.matchAll(/\[\[([^\]|]+)/g)].map(match => match[1])
                        .filter(link => !/^(File|Image):/i.test(link));
                    if (links.length === 1 && questKey(links[0]) === questKey(title) && /''None''/.test(rendered)) {
                        dependencies.set(title, []);
                    }
                } catch { /* Preserve unknown requirements if verification is unavailable. */ }
            }));
        }
    }
    return { metadata, dependencies };
}
