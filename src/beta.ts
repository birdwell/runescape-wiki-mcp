import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { betaRequests, type BetaRequest } from './betaContext.js';

// https://docs.typesafe.ai/models: pinned model, 64k input context, $0.042/M input
// tokens and free output. Count $0.003 BEFORE every attempt, even failed requests.
// Reservations are never refunded; these are conservative allowances, not invoices.
export const BETA_MODEL = 'jev-1.14.0';
export const CALL_MICROS = 3_000;
export const BETA_LIMITS = { userDailyMicros: 250_000, globalDailyMicros: 1_000_000,
    lifetimeMicros: 5_000_000, userDailyPlans: 20, globalDailyPlans: 60 };
const tokenSchema = z.array(z.object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    dailyMicros: z.number().int().min(0).max(BETA_LIMITS.userDailyMicros).optional(),
})).min(1).max(100).refine(tokens => new Set(tokens.map(t => t.id)).size === tokens.length &&
    new Set(tokens.map(t => t.sha256)).size === tokens.length);
export type BetaPrincipal = z.infer<typeof tokenSchema>[number];

export class BetaLedger {
    private readonly db: DatabaseSync;

    constructor(path: string, private readonly now = () => Date.now()) {
        // Public HTTP imports beta configuration even when beta is disabled.
        // Load the optional runtime builtin only when an actual ledger is needed.
        let sqlite: typeof import('node:sqlite');
        try { sqlite = createRequire(import.meta.url)('node:sqlite'); }
        catch (cause) { throw new Error('Protected beta requires Node.js 22.13+ with node:sqlite support.', { cause }); }
        // A missing database after initialization must not silently reset the cap.
        const marker = join(dirname(path), 'beta-ledger-initialized');
        if (existsSync(marker) && !existsSync(path)) throw new Error('Beta ledger missing; restore it before starting.');
        this.db = new sqlite.DatabaseSync(path);
        if (existsSync(marker) && !this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='usage'").get()) {
            this.db.close();
            throw new Error('Initialized beta ledger has lost its usage table. Restore it before starting.');
        }
        this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
            CREATE TABLE IF NOT EXISTS usage (day TEXT NOT NULL, principal TEXT NOT NULL,
                micros INTEGER NOT NULL DEFAULT 0, calls INTEGER NOT NULL DEFAULT 0,
                plans INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day, principal));
            CREATE TABLE IF NOT EXISTS active (id TEXT PRIMARY KEY, principal TEXT NOT NULL, expires INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS guard (name TEXT PRIMARY KEY);`);
        writeFileSync(marker, 'Persistent beta budget. Do not delete or restore an older ledger.\n', { mode: 0o600 });
    }

    private day(): string { return new Date(this.now()).toISOString().slice(0, 10); }

    private transaction<T>(work: () => T): T {
        this.db.exec('BEGIN IMMEDIATE');
        try { const result = work(); this.db.exec('COMMIT'); return result; }
        catch (error) { this.db.exec('ROLLBACK'); throw error; }
    }

    private totals(principal: BetaPrincipal) {
        const day = this.day();
        const user = this.db.prepare('SELECT micros, calls, plans FROM usage WHERE day=? AND principal=?')
            .get(day, principal.id) as { micros: number; calls: number; plans: number } | undefined;
        const global = this.db.prepare('SELECT COALESCE(SUM(micros),0) micros, COALESCE(SUM(plans),0) plans FROM usage WHERE day=?')
            .get(day) as { micros: number; plans: number };
        const lifetime = this.db.prepare('SELECT COALESCE(SUM(micros),0) micros FROM usage').get() as { micros: number };
        return { day, user: user ?? { micros: 0, calls: 0, plans: 0 }, global, lifetime: lifetime.micros };
    }

    private checkBudget(principal: BetaPrincipal): void {
        if (this.db.prepare('SELECT name FROM guard LIMIT 1').get()) {
            throw new Error('Beta spending paused because provider billing assumptions changed. Operator review required.');
        }
        const totals = this.totals(principal);
        if (totals.user.micros + CALL_MICROS > (principal.dailyMicros ?? BETA_LIMITS.userDailyMicros) ||
            totals.global.micros + CALL_MICROS > BETA_LIMITS.globalDailyMicros ||
            totals.lifetime + CALL_MICROS > BETA_LIMITS.lifetimeMicros) {
            throw new Error('Beta spending limit reached. No further Jev calls will be made. Check /beta/usage.');
        }
    }

    reserve(principal: BetaPrincipal, model: string): void {
        if (model !== BETA_MODEL) throw new Error('Beta requires the pinned, budgeted Jev model.');
        this.transaction(() => {
            this.checkBudget(principal);
            this.db.prepare(`INSERT INTO usage(day,principal,micros,calls) VALUES(?,?,?,1)
                ON CONFLICT(day,principal) DO UPDATE SET micros=micros+excluded.micros,calls=calls+1`)
                .run(this.day(), principal.id, CALL_MICROS);
        });
    }

    verifyResponse(model: string, inputTokens: number): void {
        if (model !== BETA_MODEL || inputTokens > 65_536) {
            this.db.prepare("INSERT OR IGNORE INTO guard VALUES('provider_contract_changed')").run();
            throw new Error('Beta spending paused because provider billing assumptions changed. Operator review required.');
        }
    }

    async plan<T>(principal: BetaPrincipal, work: () => Promise<T>): Promise<T> {
        const id = randomUUID();
        this.transaction(() => {
            this.checkBudget(principal);
            const totals = this.totals(principal);
            if (totals.user.plans >= BETA_LIMITS.userDailyPlans || totals.global.plans >= BETA_LIMITS.globalDailyPlans) {
                throw new Error('Beta daily plan limit reached. Check /beta/usage.');
            }
            this.db.prepare('DELETE FROM active WHERE expires<?').run(this.now());
            const rows = this.db.prepare('SELECT principal FROM active').all();
            if (rows.length >= 2 || rows.some(row => row.principal === principal.id)) {
                throw new Error('Beta already has an active plan. Retry after it finishes.');
            }
            // Survives crashes. Longer than all upstream and planner deadlines.
            this.db.prepare('INSERT INTO active VALUES(?,?,?)').run(id, principal.id, this.now() + 600_000);
            this.db.prepare(`INSERT INTO usage(day,principal,plans) VALUES(?,?,1)
                ON CONFLICT(day,principal) DO UPDATE SET plans=plans+1`).run(this.day(), principal.id);
        });
        try { return await work(); }
        finally { this.db.prepare('DELETE FROM active WHERE id=?').run(id); }
    }

    usage(principal: BetaPrincipal) {
        const totals = this.totals(principal);
        return { principal: principal.id, utcDay: totals.day, model: BETA_MODEL,
            spendingPaused: Boolean(this.db.prepare('SELECT name FROM guard LIMIT 1').get()),
            accounting: 'Conservative reservations, including failures; not actual provider invoices.',
            reservationPerJevCallUsd: CALL_MICROS / 1e6,
            limitsUsd: { userDaily: (principal.dailyMicros ?? BETA_LIMITS.userDailyMicros) / 1e6,
                globalDaily: BETA_LIMITS.globalDailyMicros / 1e6, globalLifetime: BETA_LIMITS.lifetimeMicros / 1e6 },
            reservedUsd: { userDaily: totals.user.micros / 1e6, globalDaily: totals.global.micros / 1e6,
                globalLifetime: totals.lifetime / 1e6 },
            userJevCallsToday: totals.user.calls, userPlansToday: totals.user.plans, globalPlansToday: totals.global.plans,
            planLimits: { userDaily: BETA_LIMITS.userDailyPlans, globalDaily: BETA_LIMITS.globalDailyPlans,
                simultaneousPerUser: 1, simultaneousGlobal: 2 } };
    }

    close(): void { this.db.close(); }
}

export class ProtectedBeta {
    constructor(readonly ledger: BetaLedger, private readonly principals: BetaPrincipal[]) {}

    authenticate(header: string | undefined): BetaPrincipal | undefined {
        if (!header || !/^Bearer [A-Za-z0-9_-]{43}$/.test(header)) return undefined;
        const hash = createHash('sha256').update(header.slice(7)).digest();
        return this.principals.find(principal => timingSafeEqual(hash, Buffer.from(principal.sha256, 'hex')));
    }

    run<T>(principal: BetaPrincipal, work: () => T): T {
        const context: BetaRequest = { principal: principal.id,
            reserveCall: model => this.ledger.reserve(principal, model),
            verifyResponse: (model, inputTokens) => this.ledger.verifyResponse(model, inputTokens),
            runPlan: plan => this.ledger.plan(principal, plan) };
        return betaRequests.run(context, work);
    }
}

export function configureBeta(env: NodeJS.ProcessEnv = process.env): ProtectedBeta | undefined {
    if (env.RS3_BETA_ENABLED !== 'true') {
        if (env.RS3_BETA_TOKENS_JSON || env.RS3_BETA_LEDGER_PATH) throw new Error('Beta settings require RS3_BETA_ENABLED=true.');
        return undefined;
    }
    const principals = tokenSchema.parse(JSON.parse(env.RS3_BETA_TOKENS_JSON ?? 'null'));
    if (env.TYPESAFE_MODEL !== BETA_MODEL || env.RUNESCAPE_RECOMMENDATIONS_ENABLED !== 'true' ||
        !env.TYPESAFE_API_KEY?.trim() || !env.RS3_BETA_LEDGER_PATH || !isAbsolute(env.RS3_BETA_LEDGER_PATH)) {
        throw new Error('Beta requires provider credentials, the pinned model and an absolute persistent ledger path.');
    }
    if (env.DEBUG === 'true' || env.DEBUG === '1') throw new Error('Beta cannot run with account debug logging enabled.');
    if (env.FLY_APP_NAME && (!env.RS3_BETA_LEDGER_PATH.startsWith('/data/') ||
        !readFileSync('/proc/self/mountinfo', 'utf8').split('\n').some(line => line.split(' ')[4] === '/data'))) {
        throw new Error('Beta requires a mounted persistent /data volume on Fly.');
    }
    return new ProtectedBeta(new BetaLedger(env.RS3_BETA_LEDGER_PATH), principals);
}
