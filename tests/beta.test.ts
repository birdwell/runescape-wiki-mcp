import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BetaLedger, BETA_MODEL, configureBeta, ProtectedBeta } from '../src/beta.js';
import { JevSession } from '../src/jev.js';

let directory: string;
let path: string;
let ledger: BetaLedger;
const token = randomBytes(32).toString('base64url');
const owner = { id: 'owner', sha256: createHash('sha256').update(token).digest('hex') };
const originalBeta = process.env.RS3_BETA_ENABLED;
beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'rs3-beta-'));
    path = join(directory, 'usage.sqlite');
    ledger = new BetaLedger(path);
    process.env.RS3_BETA_ENABLED = 'true';
});
afterEach(() => {
    ledger.close();
    rmSync(directory, { recursive: true });
    if (originalBeta === undefined) delete process.env.RS3_BETA_ENABLED;
    else process.env.RS3_BETA_ENABLED = originalBeta;
    jest.restoreAllMocks();
});

describe('protected beta budgets', () => {
    test('authenticates only exact bearer credentials', () => {
        const beta = new ProtectedBeta(ledger, [owner]);
        expect(beta.authenticate(`Bearer ${token}`)).toEqual(owner);
        for (const header of [undefined, token, 'Bearer invalid', `Bearer ${randomBytes(32).toString('base64url')}`, `Bearer ${token}, ${token}`]) {
            expect(beta.authenticate(header)).toBeUndefined();
        }
    });
    test('persists reservations across connections and restarts', () => {
        ledger.reserve(owner, BETA_MODEL);
        const other = new BetaLedger(path);
        try {
            for (let i = 0; i < 82; i++) other.reserve(owner, BETA_MODEL);
            expect(() => ledger.reserve(owner, BETA_MODEL)).toThrow('spending limit');
            expect(other.usage(owner).reservedUsd.userDaily).toBe(0.249);
        } finally { other.close(); }
        ledger.close();
        ledger = new BetaLedger(path);
        expect(ledger.usage(owner).userJevCallsToday).toBe(83);
        expect(() => ledger.reserve(owner, BETA_MODEL)).toThrow('spending limit');
    });
    test('enforces global daily and lifetime caps across users and UTC days', () => {
        ledger.close();
        let now = Date.parse('2026-10-25T23:59:00Z');
        ledger = new BetaLedger(path, () => now);
        const users = Array.from({ length: 5 }, (_, i) => ({ ...owner, id: `user${i}` }));
        for (let day = 0; day < 5; day++) {
            for (let call = 0; call < 333; call++) ledger.reserve(users[call % 5], BETA_MODEL);
            expect(() => ledger.reserve(users[0], BETA_MODEL)).toThrow('spending limit');
            now += 86_400_000;
        }
        ledger.reserve(owner, BETA_MODEL);
        expect(ledger.usage(owner).reservedUsd.globalLifetime).toBe(4.998);
        expect(() => ledger.reserve(owner, BETA_MODEL)).toThrow('spending limit');
    });
    test('allows one plan per user and two globally, releasing on failure', async () => {
        let finish!: () => void;
        const running = ledger.plan(owner, () => new Promise<void>(resolve => { finish = resolve; }));
        await expect(ledger.plan(owner, async () => undefined)).rejects.toThrow('active plan');
        await ledger.plan({ ...owner, id: 'second' }, async () => {
            await expect(ledger.plan({ ...owner, id: 'third' }, async () => undefined)).rejects.toThrow('active plan');
        });
        finish();
        await running;
        await expect(ledger.plan(owner, async () => { throw new Error('upstream failed'); })).rejects.toThrow('upstream failed');
        await expect(ledger.plan(owner, async () => 'released')).resolves.toBe('released');
    });
    test('enforces daily plan quota before executing work', async () => {
        for (let i = 0; i < 20; i++) await ledger.plan(owner, async () => undefined);
        const work = jest.fn(async () => undefined);
        await expect(ledger.plan(owner, work)).rejects.toThrow('daily plan limit');
        expect(work).not.toHaveBeenCalled();
    });
    test('enforces the global daily plan quota across principals', async () => {
        for (let i = 0; i < 60; i++) await ledger.plan({ ...owner, id: `user${i % 4}` }, async () => undefined);
        await expect(ledger.plan(owner, async () => undefined)).rejects.toThrow('daily plan limit');
    });
    test('crashed plan leases survive restart and expire after ten minutes', async () => {
        const { DatabaseSync } = await import('node:sqlite');
        const db = new DatabaseSync(path);
        db.prepare('INSERT INTO active VALUES(?,?,?)').run('crashed', owner.id, Date.now() + 600_000);
        db.close();
        await expect(ledger.plan(owner, async () => undefined)).rejects.toThrow('active plan');
        ledger.close();
        ledger = new BetaLedger(path, () => Date.now() + 600_001);
        await expect(ledger.plan(owner, async () => 'expired')).resolves.toBe('expired');
    });
    test('refuses a missing or emptied initialized ledger', () => {
        ledger.close();
        unlinkSync(path);
        expect(() => new BetaLedger(path)).toThrow('ledger missing');
        writeFileSync(path, '');
        expect(() => new BetaLedger(path)).toThrow('lost its usage table');
        // Reopen for afterEach using an intact new directory.
        rmSync(join(directory, 'beta-ledger-initialized'));
        ledger = new BetaLedger(path);
    });
    test('rejects incomplete and mutable-model beta configurations', () => {
        expect(configureBeta({})).toBeUndefined();
        expect(() => configureBeta({ RS3_BETA_ENABLED: 'true' })).toThrow();
        expect(() => configureBeta({ RS3_BETA_ENABLED: 'true', RS3_BETA_TOKENS_JSON: JSON.stringify([owner]),
            RS3_BETA_LEDGER_PATH: path, RUNESCAPE_RECOMMENDATIONS_ENABLED: 'true', TYPESAFE_API_KEY: 'test',
            TYPESAFE_MODEL: 'jev-latest' })).toThrow('pinned model');
        expect(() => ledger.reserve(owner, 'jev-latest')).toThrow('pinned');
    });
    test.each([['unexpected-model', 10], [BETA_MODEL, 65_537]])('persists a spending pause for provider response %s/%s', (model, tokens) => {
        expect(() => ledger.verifyResponse(String(model), Number(tokens))).toThrow('spending paused');
        ledger.close();
        ledger = new BetaLedger(path);
        expect(() => ledger.reserve(owner, BETA_MODEL)).toThrow('spending paused');
    });
    test('database failure blocks the provider request', async () => {
        const { DatabaseSync } = await import('node:sqlite');
        const db = new DatabaseSync(path);
        db.exec('DROP TABLE usage');
        db.close();
        const upstream = jest.spyOn(globalThis, 'fetch');
        const beta = new ProtectedBeta(ledger, [owner]);
        const session = new JevSession({ apiKey: 'test', model: BETA_MODEL });
        await expect(beta.run(owner, () => session.decide({}, {}, new AbortController().signal))).rejects.toThrow();
        expect(upstream).not.toHaveBeenCalled();
    });
    test('every provider attempt requires auth and budget; failed attempts stay charged', async () => {
        const upstream = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('simulated failure'));
        const session = new JevSession({ apiKey: 'test', model: BETA_MODEL });
        const decide = () => session.decide({}, { test: { type: 'choice', instructions: 'test', criteria: { yes: 'yes' } } }, new AbortController().signal);
        await expect(decide()).rejects.toThrow('authenticated HTTP');
        expect(upstream).not.toHaveBeenCalled();
        const beta = new ProtectedBeta(ledger, [owner]);
        await expect(beta.run({ ...owner, dailyMicros: 0 }, decide)).rejects.toThrow('spending limit');
        expect(upstream).not.toHaveBeenCalled();
        await expect(beta.run(owner, decide)).rejects.toThrow('failed or timed out');
        expect(upstream).toHaveBeenCalledTimes(1);
        expect(ledger.usage(owner).reservedUsd.userDaily).toBe(0.003);
    });
});
