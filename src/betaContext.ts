import { AsyncLocalStorage } from 'node:async_hooks';

export interface BetaRequest {
    principal: string;
    reserveCall(model: string): void;
    verifyResponse(model: string, inputTokens: number): void;
    runPlan<T>(work: () => Promise<T>): Promise<T>;
}

export const betaRequests = new AsyncLocalStorage<BetaRequest>();

function protectedRequest(): BetaRequest | undefined {
    const request = betaRequests.getStore();
    if (request) return request;
    if (typeof process === 'undefined' || process.env.RS3_BETA_ENABLED !== 'true') return undefined;
    throw new Error('Protected beta requires an authenticated HTTP request.');
}

export function reserveBetaCall(model: string): void {
    protectedRequest()?.reserveCall(model);
}

export function verifyBetaResponse(model: string, inputTokens: number): void {
    protectedRequest()?.verifyResponse(model, inputTokens);
}

export async function runBetaPlan<T>(work: () => Promise<T>): Promise<T> {
    const request = protectedRequest();
    return request ? request.runPlan(work) : work();
}
