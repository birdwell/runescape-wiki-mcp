// Read data from wiki templates and the quest-requirement Lua table without executing either.
import { htmlText, withoutWikiComments } from './wikiText.js';
export function splitWikiFields(text: string): string[] {
    const fields: string[] = [];
    let braces = 0, links = 0, start = 0;
    for (let i = 0; i < text.length; i += 1) {
        const pair = text.slice(i, i + 2);
        if (pair === '{{') { braces += 1; i += 1; }
        else if (pair === '}}') { braces -= 1; i += 1; }
        else if (pair === '[[') { links += 1; i += 1; }
        else if (pair === ']]') { links -= 1; i += 1; }
        else if (text[i] === '|' && braces === 0 && links === 0) {
            fields.push(text.slice(start, i).trim()); start = i + 1;
        }
    }
    fields.push(text.slice(start).trim());
    return fields;
}

export function templates(text: string, name: string): string[][] {
    const result: string[][] = [];
    const pattern = new RegExp(`\\{\\{\\s*${name}\\s*(?=[|}])`, 'ig');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
        let depth = 1, end = match.index + 2;
        for (; end < text.length - 1; end += 1) {
            const pair = text.slice(end, end + 2);
            if (pair === '{{') { depth += 1; end += 1; }
            else if (pair === '}}') {
                depth -= 1;
                if (depth === 0) break;
                end += 1;
            }
        }
        if (depth === 0) result.push(splitWikiFields(text.slice(match.index + 2, end)));
    }
    return result;
}

function fields(parts: string[] | undefined): Record<string, string> {
    return Object.fromEntries((parts ?? []).slice(1).flatMap(part => {
        const equal = part.indexOf('=');
        return equal < 0 ? [] : [[part.slice(0, equal).trim().toLowerCase(), part.slice(equal + 1).trim()]];
    }));
}

export function wikiText(text: string): string {
    let plain = withoutWikiComments(text)
        .replace(/\[\[(?:File|Image|Category):[^\]]*\]\]/gi, '')
        .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
        .replace(/\[\[([^\]]+)\]\]/g, '$1');
    for (let i = 0; i < 8 && plain.includes('{{'); i += 1) {
        plain = plain.replace(/\{\{([^{}]+)\}\}/g, (_match, body: string) => {
            const [name, ...args] = splitWikiFields(body);
            if (/^(skillreq|skill xp|skillxp|sxp)$/i.test(name)) return `${args[0]} ${args[1] ?? ''}`;
            if (/^nocoins$/i.test(name)) return `${args[0]} coins`;
            if (/^floornumber$/i.test(name)) return `floor ${args[0]}`;
            if (/^(map|npc map|clear|reflist|chat options\d*|cite\w*)$/i.test(name)) return '';
            return args.filter(arg => !arg.includes('=')).join(' ');
        });
    }
    return htmlText(plain.replace(/'{2,5}/g, ''));
}

export interface QuestMetadata {
    title: string;
    url: string;
    revisionId?: number;
    fetchedAt: string;
    available: boolean;
    requirements: {
        skills: { skill: string; level: number }[];
        text: string;
        complex: boolean;
    };
    rewards: {
        xp: { skill: string; amount: number }[];
        text: string;
        postQuest: string;
    };
    guide: { start: string; length: string; items: string; enemies: string };
}

export function parseQuestPage(title: string, source: string, revisionId?: number): QuestMetadata {
    // Remove non-content elements before reading template fields, but leave entities
    // encoded until each field's one and only text-conversion pass.
    source = htmlText(withoutWikiComments(source), false);
    const details = fields(templates(source, 'Quest details')[0]);
    const reward = fields(templates(source, 'Quest rewards')[0]);
    const requirements = details.requirements ?? '';
    const rewardText = reward.rewards ?? '';
    return {
        title, url: `https://runescape.wiki/w/${encodeURIComponent(title.replace(/ /g, '_'))}`,
        revisionId, fetchedAt: new Date().toISOString(),
        available: Object.keys(details).length > 0 && Object.keys(reward).length > 0,
        requirements: {
            skills: templates(requirements, 'Skillreq').flatMap(([, skill, raw]) => {
                const level = Number(raw);
                return skill && Number.isInteger(level) && level > 0 ? [{ skill, level }] : [];
            }),
            text: wikiText(requirements),
            complex: /\b(or|either|one of)\b/i.test(wikiText(requirements)),
        },
        rewards: {
            // Only quest-completion rewards. Post-quest XP is kept separate and never summed into these.
            xp: templates(rewardText, '(?:Skill[ _]?XP|Sxp)').flatMap(([, skill, raw, ...options]) => {
                const amount = Number(raw?.replace(/,/g, ''));
                return skill && Number.isFinite(amount) && amount > 0 && !options.includes('calc=no')
                    ? [{ skill, amount }] : [];
            }),
            text: wikiText(rewardText), postQuest: wikiText(reward['post quest'] ?? ''),
        },
        guide: {
            start: wikiText(details.start ?? ''), length: wikiText(details.length ?? ''),
            items: wikiText(details.items ?? ''), enemies: wikiText(details.kills ?? ''),
        },
    };
}

function luaString(raw: string): string {
    return raw.slice(1, -1).replace(/\\([\\'"nrt])/g, (_all, escaped: string) =>
        ({ n: '\n', r: '\r', t: '\t' }[escaped] ?? escaped));
}

export function parseQuestDependencies(source: string): Map<string, string[]> {
    const entries = new Map<string, string[]>();
    const header = /\[\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\s*\]\s*=\s*\{/g;
    let match: RegExpExecArray | null;
    while ((match = header.exec(source))) {
        let i = header.lastIndex, quote = '', end = -1;
        for (; i < source.length; i += 1) {
            const char = source[i];
            if (quote) {
                if (char === '\\') i += 1;
                else if (char === quote) quote = '';
            } else if (char === '"' || char === "'") quote = char;
            else if (char === '}') { end = i; break; }
        }
        if (end < 0) continue;
        const values = source.slice(header.lastIndex, end).match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g) ?? [];
        entries.set(luaString(match[1]), values.map(luaString));
        header.lastIndex = end + 1;
    }
    return entries;
}
