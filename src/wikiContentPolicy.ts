// Content reviews are code-reviewed, per revision and exact plain-text payload.
// Empty deliberately: API availability and a site's general footer are not a
// review of exceptions or imported material in a particular article.
export interface WikiContentReview {
    title: string;
    revisionId: number;
    extractSha256: string;
    licenseName: string;
    licenseUrl: string;
    copyrightNotices: string[];
    reviewedBy: string;
    reviewedAt: string;
    reviewNote: string;
}

export const wikiContentReviews: WikiContentReview[] = [];

export function findWikiContentReview(title: string, revisionId: number | undefined): WikiContentReview | undefined {
    return wikiContentReviews.find(review => {
        if (review.title !== title || review.revisionId !== revisionId ||
            !Number.isSafeInteger(review.revisionId) || review.revisionId <= 0 ||
            !/^[a-f0-9]{64}$/.test(review.extractSha256) ||
            !review.licenseName.trim() || !review.reviewedBy.trim() ||
            !review.reviewNote.trim() || !Number.isFinite(Date.parse(review.reviewedAt)) ||
            !Array.isArray(review.copyrightNotices) ||
            !review.copyrightNotices.every(notice => typeof notice === 'string')) return false;
        try {
            const url = new URL(review.licenseUrl);
            return url.protocol === 'https:' && !url.username && !url.password;
        } catch { return false; }
    });
}
