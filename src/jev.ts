import { z } from 'zod';
import { reserveBetaCall, verifyBetaResponse } from './betaContext.js';

// Direct HTTP keeps this decision-only loop independent of a chat-model runtime.
// Contract: https://docs.typesafe.ai/api/system-one
const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const MAX_JEV_ROUNDS = 3;
export const MAX_JEV_REQUEST_CHARS = 40_000;
const probability = z.number().finite().min(0).max(1);
const answerSchema = z.object({
    type: z.literal('choice'),
    choice: z.string(),
    confidence: probability,
    probabilities: z.record(z.string(), probability),
});
const responseSchema = z.object({
    model: z.string().min(1).max(100),
    answers: z.record(z.string(), answerSchema),
    usage: z.object({
        input_tokens: z.number().int().nonnegative(),
        output_tokens: z.number().int().nonnegative(),
    }),
});
export type ChoiceAnswer = z.infer<typeof answerSchema>;
export interface ChoiceQuestion {
    type: 'choice';
    instructions: string;
    criteria: Record<string, string>;
}

export function recommendationConfiguration(): { apiKey: string; model: string } {
    const env = typeof process === 'undefined' ? {} : process.env;
    if (env.RUNESCAPE_RECOMMENDATIONS_ENABLED !== 'true' || !env.TYPESAFE_API_KEY?.trim()) {
        throw new Error(
            'Recommendations are disabled. The server operator must set ' +
            'RUNESCAPE_RECOMMENDATIONS_ENABLED=true and TYPESAFE_API_KEY. ' +
            'Existing wiki and price tools work without Jev.'
        );
    }
    return { apiKey: env.TYPESAFE_API_KEY.trim(), model: env.TYPESAFE_MODEL || 'jev-latest' };
}

export class JevSession {
    readonly usage = { rounds: 0, inputTokens: 0, outputTokens: 0, models: [] as string[] };

    constructor(private readonly config: { apiKey: string; model: string; maxRounds?: number }) {}

    requestLength(state: unknown, questions: Record<string, ChoiceQuestion>): number {
        return JSON.stringify({ model: this.config.model, state, questions }).length;
    }

    async decide(
        state: unknown,
        questions: Record<string, ChoiceQuestion>,
        signal: AbortSignal
    ): Promise<Record<string, ChoiceAnswer>> {
        if (this.usage.rounds >= (this.config.maxRounds ?? MAX_JEV_ROUNDS)) {
            throw new Error('Jev round limit reached.');
        }
        const body = JSON.stringify({ model: this.config.model, state, questions });
        if (body.length > MAX_JEV_REQUEST_CHARS) {
            throw new Error('Recommendation context exceeds the Jev request limit.');
        }
        // Fail closed before sending any paid request, including quest sub-sessions.
        reserveBetaCall(this.config.model);
        this.usage.rounds += 1;
        let response: Response;
        try {
            response = await fetch(ENDPOINT, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body,
                signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
                redirect: 'error',
            });
        } catch {
            throw new Error('Jev request failed or timed out. No recommendation was generated.');
        }
        if (!response.ok) {
            // Never reflect provider bodies, credentials, or account context into errors/logs.
            await response.body?.cancel();
            throw new Error(`Jev returned HTTP ${response.status}. No automatic retries were made.`);
        }
        let raw: unknown;
        try {
            raw = await response.json();
        } catch {
            throw new Error('Jev returned invalid JSON.');
        }
        const parsed = responseSchema.safeParse(raw);
        if (!parsed.success) {
            throw new Error('Jev returned an invalid decision response.');
        }
        const result = parsed.data;
        verifyBetaResponse(result.model, result.usage.input_tokens);
        for (const [id, question] of Object.entries(questions)) {
            const answer = result.answers[id];
            const options = Object.keys(question.criteria);
            if (!answer || !options.includes(answer.choice) ||
                options.some(option => answer.probabilities[option] === undefined) ||
                Object.keys(answer.probabilities).some(option => !options.includes(option)) ||
                Math.abs(Object.values(answer.probabilities).reduce((a, b) => a + b, 0) - 1) > 0.02) {
                throw new Error('Jev returned a missing or out-of-range decision.');
            }
        }
        this.usage.inputTokens += result.usage.input_tokens;
        this.usage.outputTokens += result.usage.output_tokens;
        if (!this.usage.models.includes(result.model)) this.usage.models.push(result.model);
        return result.answers;
    }
}
