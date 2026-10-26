import { Parser } from 'htmlparser2';

/** Remove comments without joining their neighbours into fresh markup delimiters. */
export function withoutWikiComments(source: string): string {
    const parts: string[] = [];
    let cursor = 0;
    while (cursor < source.length) {
        const start = source.indexOf('<!--', cursor);
        if (start < 0) { parts.push(source.slice(cursor)); break; }
        parts.push(source.slice(cursor, start), ' ');
        const end = source.indexOf('-->', start + 4);
        if (end < 0) break; // An unterminated comment cannot contribute template data.
        cursor = end + 3;
    }
    return parts.join('');
}

/** HTML-to-text conversion, not an HTML sanitizer. HTML consumers must escape this text.
 * Entities decode once, in parser text tokens; decoded text is never parsed again.
 */
export function htmlText(source: string, decodeEntities = true): string {
    // The parser emits an unfinished tag name as text at EOF. Discard that tail;
    // preserve ordinary comparisons such as "2 < 3" and directly encoded text.
    const lastOpen = source.lastIndexOf('<');
    if (lastOpen > source.lastIndexOf('>') && /^[A-Za-z/!]/.test(source.slice(lastOpen + 1))) {
        source = source.slice(0, lastOpen);
    }
    const parts: string[] = [];
    let ignoredDepth = 0;
    const parser = new Parser({
        onopentag(name, attributes) {
            if (ignoredDepth || ['script', 'style', 'ref'].includes(name)) { ignoredDepth += 1; return; }
            if (name === 'br') parts.push('\n');
            if (name === 'img' && attributes.alt) parts.push(attributes.alt);
        },
        ontext(text) { if (!ignoredDepth) parts.push(text); },
        onclosetag(name) {
            if (ignoredDepth) { ignoredDepth -= 1; return; }
            if (['p', 'div', 'li', 'tr', 'h2', 'h3', 'h4'].includes(name)) parts.push('\n');
        },
    }, { decodeEntities, recognizeSelfClosing: true });
    parser.end(source);
    return parts.join('').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n+/g, '\n').trim();
}
