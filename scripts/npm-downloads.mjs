// Import public npm download totals. No user or installation telemetry.
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { PostHog } from 'posthog-node';

const PACKAGE = 'runescape-wiki-mcp';

export function eventForDay({ day, downloads }) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isInteger(downloads) || downloads < 0) {
        throw new Error('Invalid npm download record');
    }
    // UUIDv5 with the URL namespace; retries use the same event UUID and timestamp.
    const namespace = Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex');
    const hash = createHash('sha1').update(namespace).update(`https://www.npmjs.com/package/${PACKAGE}#${day}`).digest();
    hash[6] = (hash[6] & 0x0f) | 0x50;
    hash[8] = (hash[8] & 0x3f) | 0x80;
    const hex = hash.subarray(0, 16).toString('hex');
    return {
        event: 'npm_downloads_daily',
        distinctId: 'runescape-wiki-mcp:npm',
        uuid: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
        timestamp: new Date(`${day}T12:00:00.000Z`),
        properties: {
            package: PACKAGE, day, downloads, source: 'npm_registry', environment: 'production',
            $process_person_profile: false, $geoip_disable: true,
        },
    };
}

export async function importDownloads(args = process.argv.slice(2)) {
    const dryRun = args.includes('--dry-run');
    const period = args.find(arg => arg !== '--dry-run') ?? (() => {
        // Allow the registry time to publish a full UTC day.
        const day = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
        return `${day}:${day}`;
    })();
    if (!/^(last-(day|week|month)|\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2})$/.test(period)) {
        throw new Error('Use last-month or YYYY-MM-DD:YYYY-MM-DD, optionally --dry-run');
    }
    const key = process.env.POSTHOG_PROJECT_KEY;
    if (!dryRun && !key) throw new Error('POSTHOG_PROJECT_KEY is required; use --dry-run to preview');
    const response = await fetch(`https://api.npmjs.org/downloads/range/${period}/${PACKAGE}`, {
        signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`npm downloads request failed: ${response.status}`);
    const body = await response.json();
    if (body.package !== PACKAGE || !Array.isArray(body.downloads) || body.downloads.length === 0) {
        throw new Error('Unexpected npm downloads response');
    }
    const events = body.downloads.map(eventForDay);
    if (dryRun) {
        console.log(JSON.stringify(body, null, 2));
        return;
    }
    const client = new PostHog(key, {
        host: process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com',
        disableGeoip: true, requestTimeout: 5_000, fetchRetryCount: 2,
        // One awaited batch so delivery failures fail the job rather than reporting success.
        flushAt: events.length + 1, flushInterval: 0,
    });
    let failed = false;
    client.on('error', () => { failed = true; });
    try {
        for (const event of events) client.capture(event);
        await client.flush();
        if (failed) throw new Error('PostHog rejected the download import');
        console.log(`Submitted ${events.length} daily npm download records to PostHog.`);
    } finally {
        await client.shutdown(10_000);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    importDownloads().catch(() => {
        console.error('Download import failed. Check npm availability and PostHog project configuration.');
        process.exitCode = 1;
    });
}
