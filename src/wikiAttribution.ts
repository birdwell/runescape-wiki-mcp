import { WIKI_LICENSE_URL, WIKI_LICENSING_URL } from './constants.js';

/** Keep source credits attached even when recommendations shorten or restructure wiki text. */
export function attributedWikiSource(title: string, url: string, changes: string, revisionId?: number) {
    return {
        title, url, contributors: 'RuneScape Wiki contributors',
        historyUrl: `${url}?action=history`,
        ...(revisionId ? { revisionId, revisionUrl: `${url}?oldid=${revisionId}` } : {}),
        license: 'CC BY-NC-SA 3.0', licenseUrl: WIKI_LICENSE_URL,
        licensingExceptionsUrl: WIKI_LICENSING_URL,
        changes,
    };
}
