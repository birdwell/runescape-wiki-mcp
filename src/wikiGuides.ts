import { parseDocument, DomUtils } from 'htmlparser2';
import { RUNESCAPE_WIKI_API, RS3_SKILLS } from './constants.js';
import { makeApiRequest } from './utils.js';
import { attributedWikiSource } from './wikiAttribution.js';

type Element = ReturnType<typeof DomUtils.getElementsByTagName>[number];
type Node = ReturnType<typeof parseDocument>['children'][number];
export interface GuideSection { title: string; anchor: string; text: string }
export interface Guide {
    title: string; html: string; revisionId?: number; fetchedAt: string;
    source: ReturnType<typeof attributedWikiSource>;
}
const cache = new Map<string, { until: number; guide: Guide }>();

export async function fetchGuide(title: string, signal: AbortSignal): Promise<Guide> {
    const cached = cache.get(title);
    if (cached && cached.until > Date.now()) return cached.guide;
    const params = new URLSearchParams({ action: 'parse', format: 'json', page: title,
        redirects: '1', prop: 'text|revid' });
    const data = await makeApiRequest(`${RUNESCAPE_WIKI_API}?${params}`,
        AbortSignal.any([signal, AbortSignal.timeout(12_000)]));
    const parsed = data.parse;
    if (data.error || !parsed || typeof parsed.text?.['*'] !== 'string') {
        throw new Error(`Wiki guide "${title}" is unavailable.`);
    }
    if (parsed.text['*'].length > 4_000_000) throw new Error('Wiki guide exceeds the parsing budget.');
    const resolved = parsed.title ?? title;
    const url = `https://runescape.wiki/w/${encodeURIComponent(resolved.replace(/ /g, '_'))}`;
    const guide: Guide = { title: resolved, html: parsed.text['*'], revisionId: parsed.revid,
        fetchedAt: new Date().toISOString(), source: attributedWikiSource(resolved, url,
            'Rendered guide tables and section text extracted; formatting omitted and long excerpts shortened.', parsed.revid) };
    if (cache.size >= 16) cache.delete(cache.keys().next().value!);
    cache.set(title, { until: Date.now() + 6 * 60 * 60_000, guide });
    return guide;
}

function element(node: Node): node is Element { return 'name' in node; }
function ancestor(node: Node, names: string[]): Element | undefined {
    let parent = node.parent;
    while (parent) {
        if ('name' in parent && names.includes(parent.name)) return parent;
        parent = parent.parent;
    }
    return undefined;
}

/** DOM text is already decoded once. Never run an entity decoder on this result. */
export function guideText(node: Node): string {
    if (node.type === 'text') return node.data;
    if (!('children' in node)) return '';
    if (element(node)) {
        if (['script', 'style', 'ref', 'sup'].includes(node.name)) return '';
        if (node.name === 'img') return '';
        if (node.name === 'a' && !DomUtils.textContent(node).trim()) return node.attribs.title ?? '';
    }
    const body = node.children.map(guideText).join('');
    return body + (element(node) && ['p', 'div', 'li', 'tr', 'br'].includes(node.name) ? '\n' : '');
}
function clean(node: Node): string { return guideText(node).replace(/\s+/g, ' ').trim(); }
export interface Cell { text: string; header: boolean; links: string[] }

export function guideTables(guide: Guide): Cell[][][] {
    const document = parseDocument(guide.html);
    return DomUtils.findAll(node => node.name === 'table', document.children).map(table => {
        const rows = DomUtils.findAll(node => node.name === 'tr', table.children)
            .filter(row => ancestor(row, ['table']) === table);
        const spans = new Map<number, { remaining: number; cell: Cell }>();
        return rows.map(row => {
            const result: Cell[] = [];
            for (const [column, span] of spans) {
                result[column] = span.cell;
                span.remaining -= 1;
                if (!span.remaining) spans.delete(column);
            }
            let column = 0;
            for (const cell of row.children.filter((child): child is Element => element(child) && ['td', 'th'].includes(child.name))) {
                while (result[column]) column += 1;
                const value: Cell = { text: clean(cell), header: cell.name === 'th',
                    links: [...new Set(DomUtils.findAll(node => node.name === 'a' &&
                        Boolean(node.attribs.title) && /^\/w\//.test(node.attribs.href ?? ''), cell.children)
                        .map(link => link.attribs.title))] };
                const width = Math.max(1, Math.min(30, Number(cell.attribs.colspan) || 1));
                const height = Math.max(1, Math.min(300, Number(cell.attribs.rowspan) || 1));
                for (let offset = 0; offset < width; offset += 1) {
                    result[column + offset] = value;
                    if (height > 1) spans.set(column + offset, { remaining: height - 1, cell: value });
                }
                column += width;
            }
            return result;
        });
    });
}

export function guideSections(guide: Guide): GuideSection[] {
    const doc = parseDocument(guide.html);
    const sections: GuideSection[] = [{ title: guide.title, anchor: '', text: '' }];
    for (const node of DomUtils.findAll(node => /^h[1-6]$/.test(node.name) ||
        ['p', 'ul', 'ol'].includes(node.name), doc.children)) {
        if (ancestor(node, ['table', 'ul', 'ol', 'p'])) continue;
        if (/^h[1-6]$/.test(node.name)) {
            const title = clean(node).replace(/\[edit\]$/i, '').trim();
            const anchor = node.attribs.id ?? DomUtils.findOne(child => Boolean(child.attribs.id), node.children)?.attribs.id ?? '';
            sections.push({ title, anchor, text: '' });
        } else {
            const section = sections[sections.length - 1];
            section.text = `${section.text}\n${guideText(node).trim()}`.slice(0, 4000).trim();
        }
    }
    return sections;
}

export function levelRange(text: string, skill: string): { minimum: number; maximum: number; maximumSpecified: boolean } | undefined {
    const normalized = text.replace(new RegExp(`\\b${skill}\\b`, 'gi'), '').replace(/\[\d+\]/g, '').trim();
    const match = /^(\d{1,3})(?:\s*[–—-]\s*(\d{1,3}))?\s*\+?$/.exec(normalized);
    if (!match) return undefined;
    const minimum = Number(match[1]), maximum = match[2] ? Number(match[2]) : 120;
    if (minimum < 1 || maximum > 120 || maximum < minimum) return undefined;
    return { minimum, maximum, maximumSpecified: match[2] !== undefined };
}

function trainingSection(sections: GuideSection[], name: string, range: NonNullable<ReturnType<typeof levelRange>>): GuideSection | undefined {
    const normalized = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim().split(/\s+/).map(word => word.length > 4 ? word.replace(/s$/, '') : word).join(' ');
    const phrases = name.split('/').map(normalized).filter(Boolean);
    const mentionsMethod = (text: string) => phrases.some(phrase => ` ${normalized(text)} `.includes(` ${phrase} `));
    const candidates = sections.flatMap(section => {
        const bounds = /levels?\s+(\d+)(?:\s*[–—-]\s*(\d+))?/i.exec(section.title);
        const start = bounds ? Number(bounds[1]) : undefined;
        const end = bounds?.[2] ? Number(bounds[2]) : undefined;
        const named = mentionsMethod(section.title);
        if (!named && !(start === range.minimum && mentionsMethod(section.text))) return [];
        let specificity = 1; // An unnumbered method heading is only a general fallback.
        if (start !== undefined) {
            if (start === range.minimum) {
                // The synthetic 120 for a table's "60+" must not count as an exact end.
                specificity = end === undefined ? 3 : range.maximumSpecified && end === range.maximum ? 5 : 4;
            } else if (end !== undefined && start < range.minimum && end >= range.minimum) {
                specificity = 2;
            } else return []; // An earlier open-ended heading cannot establish later-row requirements.
        }
        return [{ section, score: specificity * 2 + Number(named), width: end === undefined ? Infinity : end - start! }];
    });
    candidates.sort((a, b) => b.score - a.score || a.width - b.width);
    return candidates[0]?.section;
}

export interface TrainingMethod {
    id: string; name: string; minimumLevel: number; recommendedUntil: number;
    membership: 'free' | 'members' | 'unspecified';
    rates: { label: string; text: string; xpPerHour?: number }[];
    costs: { label: string; text: string }[];
    requirementsText: string;
    evidence: string;
    mentionedPages: string[];
    source: Guide['source'];
}

export function parseTrainingMethods(guide: Guide, skill: string, membership: TrainingMethod['membership']): TrainingMethod[] {
    const sections = guideSections(guide);
    const result: TrainingMethod[] = [];
    for (const rows of guideTables(guide)) {
        let headers: string[] | undefined;
        let seenData = false;
        for (const row of rows) {
            if (!row.length) continue;
            if (row.every(cell => !cell || cell.header)) {
                const texts = row.map(cell => cell?.text ?? '');
                if (!headers && texts.some(text => /level/i.test(text)) && texts.some(text => /method|gem|product|armour type|battlestaff/i.test(text))) {
                    headers = texts;
                } else if (headers && row.length === headers.length && !seenData) {
                    headers = headers.map((header, i) => header === texts[i] ? header : `${header} / ${texts[i]}`);
                }
                continue;
            }
            if (!headers) continue;
            seenData = true;
            const levelColumn = headers.findIndex(header => /level/i.test(header));
            // A colspan image/name header repeats. The last column contains the visible name.
            const methodColumn = headers.reduce((found, header, i) => /method|^gem$|^product$|armour type|battlestaff/i.test(header) ? i : found, -1);
            const range = levelRange(row[levelColumn]?.text ?? '', skill);
            const name = row[methodColumn]?.text;
            if (!range || !name || name.length > 220) continue;
            const rates = headers.flatMap((header, i) => {
                if (!/(?:xp|exp|experience).*(?:\/\s*h|per hour|an hour|hourly)/i.test(header)) return [];
                const text = row[i]?.text ?? '';
                const numeric = /^([\d,]+(?:\.\d+)?)\s*(?:per hour)?$/i.exec(text);
                return [{ label: header, text, ...(numeric ? { xpPerHour: Number(numeric[1].replace(/,/g, '')) } : {}) }];
            });
            const costs = headers.flatMap((header, i) => /cost|profit|loss|gp\//i.test(header)
                ? [{ label: header, text: row[i]?.text ?? '' }] : []);
            if (!rates.length && !headers.some(header => /^afk$/i.test(header))) continue;
            const section = trainingSection(sections, name, range);
            const requirementsColumn = headers.findIndex(header => /requirements?/i.test(header));
            const membershipColumn = headers.findIndex(header => /^(?:members(?:hip)?|free.to.play)$/i.test(header.trim()));
            const membershipValue = membershipColumn < 0 ? '' : (row[membershipColumn]?.text ?? '').trim();
            const freeColumn = membershipColumn >= 0 && /^free.to.play$/i.test(headers[membershipColumn].trim());
            const yes = /^(?:yes|true)$/i.test(membershipValue);
            const no = /^(?:no|false)$/i.test(membershipValue);
            const rowMembership = /^(?:free(?:.to.play)?|f2p)$/i.test(membershipValue) || (freeColumn ? yes : no) ? 'free'
                : /^(?:members(?:.only)?|pay.to.play|p2p)$/i.test(membershipValue) || (freeColumn ? no : yes) ? 'members' : membership;
            const evidence = [section?.text, ...headers.map((header, i) => `${header}: ${row[i]?.text ?? ''}`)].filter(Boolean).join('\n').slice(0, 1800);
            if (result.some(method => method.name === name && method.minimumLevel === range.minimum)) continue;
            result.push({ id: '', name, minimumLevel: range.minimum, recommendedUntil: range.maximum, membership: rowMembership,
                rates, costs, requirementsText: requirementsColumn < 0 ? '' : row[requirementsColumn]?.text ?? '',
                evidence, mentionedPages: [...new Set(row.flatMap(cell => cell?.links ?? []))],
                source: { ...guide.source, url: `${guide.source.url}${section?.anchor ? `#${section.anchor}` : ''}` },
            });
        }
    }
    return result;
}

export function inventionRequirements(guide: Guide): Record<string, number> | undefined {
    const intro = guideSections(guide)[0]?.text ?? '';
    const match = /require level (\d+)\s+(.+?)\s+to access Invention/i.exec(intro.replace(/\s+/g, ' '));
    if (!match || Number(match[1]) > 120) return undefined;
    const skills = RS3_SKILLS.filter(skill => skill !== 'Overall' && new RegExp(`\\b${skill}\\b`, 'i').test(match[2]));
    return skills.length ? Object.fromEntries(skills.map(skill => [skill, Number(match[1])])) : undefined;
}
