import type { Tool } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { RS3_SKILLS } from '../constants.js';
import { JSON_SCHEMA_2020_12, READ_ONLY_TOOL } from '../mcpSchemas.js';
import { recommendActivity } from '../recommendations.js';
import { createErrorResponse, createSuccessResponse } from '../utils.js';
import type { ToolArguments, ToolResponse } from '../types.js';

const names = z.array(z.string().trim().min(1).max(100)).max(100);
export const recommendationInput = z.strictObject({
    goal: z.string().trim().min(1).max(300),
    goalType: z.enum(['activity', 'quests', 'skill_training', 'unlock_progression']).optional(),
    targetSkill: z.enum(RS3_SKILLS.filter(skill => skill !== 'Overall')).optional(),
    targetLevel: z.number().int().min(1).max(120).optional(),
    unlock: z.string().trim().min(1).max(100).optional(),
    context: z.strictObject({
        username: z.string().trim().min(1).max(12).regex(/^[a-zA-Z0-9 _-]+$/).optional(),
        gameMode: z.enum(['normal', 'ironman', 'hardcore']).optional(),
        skills: z.partialRecord(z.enum(RS3_SKILLS.filter(skill => skill !== 'Overall')),
            z.number().int().min(1).max(120)).optional(),
        skillExperience: z.partialRecord(z.enum(RS3_SKILLS.filter(skill => skill !== 'Overall')),
            z.number().int().min(0).max(200_000_000)).optional(),
        budgetGp: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
        sessionMinutes: z.number().int().min(1).max(1440).optional(),
        playStyle: z.enum(['afk', 'active', 'either']).optional(),
        members: z.boolean().optional(),
        completedQuests: names.optional(),
        gear: names.optional(),
        notes: z.string().trim().max(1000).optional(),
    }).default({}),
}).refine(input => JSON.stringify(input).length <= 20_000, {
    message: 'Goal and account context together must fit within 20,000 serialized JSON characters. Narrow quest and gear lists to relevant entries.',
}).describe('Goal and optional account context. Combined serialized JSON must not exceed 20,000 characters; oversized input is rejected before any paid calls.');
export type RecommendationInput = z.infer<typeof recommendationInput>;

export const recommendationTools: Tool[] = [{
    name: 'recommend_next_activity',
    title: 'Recommend Next RS3 Activity',
    description: 'Recommend an RS3 next activity, skill training plan or unlock progression path for a goal and optional account context. ' +
        'Fetches public hiscores and wiki evidence. Quest goals fetch the complete public RuneMetrics journal ' +
        'and compare every unfinished quest with wiki rewards/requirements in bounded batches, then fetch finalist guide summaries. ' +
        'Skill training reads level/method tables and source estimates; unlock progression builds prerequisite quest and skill paths from wiki evidence. ' +
        'Optional goalType, targetSkill, targetLevel and unlock make the intended planner explicit. ' +
        'Uses up to 24 paid Jev calls for quests, three for other activities. ' +
        'Full quest comparison has a five-minute deadline after routing; clients should allow the longer timeout. ' +
        'Requires operator opt-in and a TypeSafe API key. Supplied goal/account context is sent to TypeSafe. ' +
        'Unknown quests, gear, money and requirements remain explicit; suggestions may be conditional. ' +
        'Returns sources, alternatives, missing context and token usage. No account changes or persistence.',
    inputSchema: z.toJSONSchema(recommendationInput, { target: 'draft-2020-12', io: 'input' }) as Tool['inputSchema'],
    outputSchema: {
        $schema: JSON_SCHEMA_2020_12,
        type: 'object',
        properties: {
            status: { type: 'string', enum: ['recommended', 'needs_context', 'no_match', 'goal_met'] },
            goal: { type: 'string' },
            recommendation: { type: ['object', 'null'], additionalProperties: true },
            alternatives: { type: 'array', items: { type: 'object', additionalProperties: true } },
            missingContext: { type: 'array', items: { type: 'string' } },
            warnings: { type: 'array', items: { type: 'string' } },
            account: { type: 'object', additionalProperties: true },
            sources: { type: 'array', items: { type: 'object', additionalProperties: true } },
            usage: { type: 'object', additionalProperties: true },
            questCoverage: { type: 'object', additionalProperties: true },
            questDecision: { type: 'object', additionalProperties: true },
            blockedAlternatives: { type: 'array', items: { type: 'object', additionalProperties: true } },
            trainingPlan: { type: 'object', additionalProperties: true },
            trainingCoverage: { type: 'object', additionalProperties: true },
            unlockPlan: { type: 'object', additionalProperties: true },
            unlockCoverage: { type: 'object', additionalProperties: true },
        },
        required: ['status', 'goal', 'recommendation', 'alternatives', 'missingContext', 'warnings',
            'account', 'sources', 'usage'],
        additionalProperties: false,
    },
    ...READ_ONLY_TOOL,
}];

export async function handleRecommendationTool(_name: string, args: ToolArguments): Promise<ToolResponse> {
    const input = recommendationInput.safeParse(args);
    if (!input.success) {
        return createErrorResponse(new Error(input.error.issues
            .map(issue => `${issue.path.join('.') || 'input'}: ${issue.message}`).join('; ')));
    }
    try {
        return createSuccessResponse('RS3 next activity', await recommendActivity(input.data));
    } catch (error) {
        return createErrorResponse(error);
    }
}
