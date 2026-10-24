import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventForDay, importDownloads } from './npm-downloads.mjs';

test('daily events have stable IDs and timestamps across retries and differing counts', () => {
    const first = eventForDay({ day: '2026-10-20', downloads: 25 });
    const retry = eventForDay({ day: '2026-10-20', downloads: 25 });
    const next = eventForDay({ day: '2026-10-21', downloads: 30 });
    assert.deepEqual(first, retry);
    assert.notEqual(first.uuid, next.uuid);
    assert.match(first.uuid, /^[0-9a-f-]{14}5[0-9a-f-]{21}$/);
    assert.equal(first.timestamp.toISOString(), '2026-10-20T12:00:00.000Z');
    assert.equal(first.properties.downloads, 25);
    assert.equal(first.properties.$process_person_profile, false);
    assert.equal(eventForDay({ day: '2026-10-20', downloads: 26 }).uuid, first.uuid);
});

test('invalid totals and malformed records cannot reach ingestion', () => {
    for (const downloads of [-1, 1.5, '2', undefined]) {
        assert.throws(() => eventForDay({ day: '2026-10-20', downloads }));
    }
    assert.throws(() => eventForDay({ day: 'not-a-day', downloads: 1 }));
});

test('dry run reads npm without sending any telemetry', async () => {
    const originalFetch = globalThis.fetch;
    const originalLog = console.log;
    const requests = [];
    const logs = [];
    globalThis.fetch = async url => {
        requests.push(url);
        return Response.json({ package: 'runescape-wiki-mcp', downloads: [{ day: '2026-10-20', downloads: 12 }] });
    };
    console.log = value => logs.push(value);
    try {
        await importDownloads(['last-month', '--dry-run']);
        assert.equal(requests.length, 1);
        assert.match(requests[0], /^https:\/\/api.npmjs.org\/downloads\/range\/last-month\//);
        assert.equal(JSON.parse(logs[0]).downloads[0].downloads, 12);
    } finally {
        globalThis.fetch = originalFetch;
        console.log = originalLog;
    }
});
