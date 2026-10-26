import type { Tool } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { RS3_SKILLS } from '../constants.js';
import { JSON_SCHEMA_2020_12, READ_ONLY_TOOL } from '../mcpSchemas.js';
import { recommendActivity } from '../recommendations.js';
import { createErrorResponse, createSuccessResponse } from '../utils.js';
import type { ToolArguments, ToolResponse } from '../types.js';

const names = z.array(z.string().trim().min(1).max(100)).max(100);
export const recommendationInput = z.strictObject({
    goal: z.string().trim().min(1).max(300).describe('Desired RS3 outcome in plain language, e.g. best Mining quest or train Mining to level 70; not instructions to execute arbitrary tools.'),
    goalType: z.enum(['activity', 'quests', 'skill_training', 'unlock_progression']).optional()
        .describe('Planner family; omission allows inference from the goal.'),
    targetSkill: z.enum(RS3_SKILLS.filter(skill => skill !== 'Overall')).optional()
        .describe('Skill focus for quest rewards or training; use an enumerated RS3 skill name.'),
    targetLevel: z.number().int().min(1).max(120).optional()
        .describe('Desired skill_training destination level, not the current level or an XP amount.'),
    unlock: z.string().trim().min(1).max(100).optional()
        .describe('Named unlock to plan, e.g. Invention.'),
    context: z.strictObject({
        username: z.string().trim().min(1).max(12).regex(/^[a-zA-Z0-9 _-]+$/).optional()
            .describe('RS3 display name for public hiscores and, for quest planning, the fresh RuneMetrics journal. Private journals cannot establish quest completion.'),
        gameMode: z.enum(['normal', 'ironman', 'hardcore']).optional()
            .describe('Account mode; public hiscores lookup uses normal when omitted, while the account mode remains listed as missing context.'),
        skills: z.partialRecord(z.enum(RS3_SKILLS.filter(skill => skill !== 'Overall')),
            z.number().int().min(1).max(120)).optional()
            .describe('Current skill levels keyed by exact RS3 skill names; not target levels.'),
        skillExperience: z.partialRecord(z.enum(RS3_SKILLS.filter(skill => skill !== 'Overall')),
            z.number().int().min(0).max(200_000_000)).optional()
            .describe('Current total XP per skill, not XP to earn. Consistent exact XP supports training estimates; omitted XP can be filled from compatible public hiscores.'),
        budgetGp: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional()
            .describe('Caller-supplied spending budget in coins; zero means no budget. The server does not read a bank balance.'),
        sessionMinutes: z.number().int().min(1).max(1440).optional()
            .describe('Available play time in minutes, not a guarantee of activity completion time.'),
        playStyle: z.enum(['afk', 'active', 'either']).optional()
            .describe('Preferred attention level for this session; either accepts AFK or active options.'),
        members: z.boolean().optional()
            .describe('Whether the player has membership. Omitted membership stays unknown, rather than assuming free-to-play or members.'),
        completedQuests: names.optional()
            .describe('Relevant completed quest titles reported by the caller; a partial list is allowed.'),
        gear: names.optional()
            .describe('Relevant equipment the player owns; this is caller context, not a fetched inventory or bank.'),
        notes: z.string().trim().max(1000).optional()
            .describe('Additional preferences or constraints treated as account data, not executable instructions.'),
    }).default({}).describe('Optional known account facts; missing facts are not fabricated.'),
}).refine(input => JSON.stringify(input).length <= 20_000, {
    message: 'Goal and account context together must fit within 20,000 serialized JSON characters. Narrow quest and gear lists to relevant entries.',
}).describe('Goal and optional account context. Combined serialized JSON must not exceed 20,000 characters; oversized input is rejected before any paid calls.');
export type RecommendationInput = z.infer<typeof recommendationInput>;

export const recommendationTools: Tool[] = [{
    name: 'recommend_next_activity',
    title: 'Recommend Next RS3 Activity',
    description: "Recommend RS3 activities, training plans or unlock paths. Use get_player_quests for journals, get_player_stats for levels, or search_wiki for references.\n\n- Planner: unlock overrides goalType, otherwise goalType overrides inference. targetSkill overrides inferred focus.\n- Training example: context.skills.Mining=52 defaults to 55; a goal-specified level overrides 55; targetLevel=70 overrides both. Quest-mode Mining instead compares quest rewards.\n- Context: caller levels override hiscores. Quests require a public username; its journal replaces completion claims. Other activities use shortlists; unknown eligibility remains conditional.\n- Setup: operator RUNESCAPE_RECOMMENDATIONS_ENABLED=true and TYPESAFE_API_KEY. Goal/account context is sent to TypeSafe.\n- Cost: up to 24 paid Jev calls for quests, three otherwise, including routing. No automatic retries, account changes or decision storage.\n- Timing: 55 seconds for routing/non-quest work, plus five minutes after quest routing. Invalid input/configuration or Jev failures return isError/text.\n- Outcomes: recommended=candidate, needs_context=missing facts, no_match=no supported option, goal_met=already satisfied. Check warnings and sources.",
    inputSchema: z.toJSONSchema(recommendationInput, { target: 'draft-2020-12', io: 'input' }) as Tool['inputSchema'],
    outputSchema: {
        $schema: JSON_SCHEMA_2020_12,
        type: 'object',
        properties: {
            status: { description: "Outcome: recommended proposes a candidate; needs_context requests facts; no_match has no supported option; goal_met means the target is already satisfied.", type: 'string', enum: ['recommended', 'needs_context', 'no_match', 'goal_met'] },
            goal: { description: "Caller goal after input normalization.", type: 'string' },
            recommendation: { description: "Top candidate or null; the planner-specific recommendation is supported by sources and may remain conditional.", type: ['object', 'null'], additionalProperties: true },
            alternatives: { description: "Other supported candidates; not an exhaustive catalogue.", type: 'array', items: { type: 'object', additionalProperties: true } },
            missingContext: { description: "Account facts or target details still needed for a confident plan.", type: 'array', items: { type: 'string' } },
            warnings: { description: "Data gaps, coverage limits and conditions the caller should communicate.", type: 'array', items: { type: 'string' } },
            account: { description: "Resolved account context with caller/public sources and unknown facts preserved.", type: 'object', additionalProperties: true },
            sources: { description: "Evidence references, retrieval/revision details and attribution where applicable.", type: 'array', items: { type: 'object', additionalProperties: true } },
            usage: { description: "Paid Jev rounds, input/output token counts, model names and round budget.", type: 'object', additionalProperties: true },
            questCoverage: { description: "Quest journal/catalogue comparison coverage, when the quest planner ran.", type: 'object', additionalProperties: true },
            questDecision: { description: "Quest selection evidence and eligibility reasoning.", type: 'object', additionalProperties: true },
            blockedAlternatives: { description: "Rejected or blocked candidates with their known conditions.", type: 'array', items: { type: 'object', additionalProperties: true } },
            trainingPlan: { description: "Training target, XP gap, methods and prerequisites when the training planner ran.", type: 'object', additionalProperties: true },
            trainingCoverage: { description: "Training evidence coverage and its limitations.", type: 'object', additionalProperties: true },
            unlockPlan: { description: "Named unlock and its prerequisite quest/skill progression, when applicable.", type: 'object', additionalProperties: true },
            unlockCoverage: { description: "Unlock evidence coverage and unresolved requirements.", type: 'object', additionalProperties: true },
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
