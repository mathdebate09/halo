import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { AiUnavailableError, type ToolCall, type ToolSpec } from '../ai/ai.service.js';
import { MealsService } from '../meals/meals.service.js';
import {
  type AdvisorCard,
  advisorCardSchema,
  type AdvisorContext,
  MAX_MEAL_NOTE,
  MEAL_TYPES,
  mealTypeAt,
  OPEN_TARGETS,
} from '../shared/index.js';

// Every tool reads the snapshot the phone sent with this turn; nothing is written on the server.
// The propose_/suggest_/open tools only prepare a card: the person's tap acts on it.

const TREND_METRICS = [
  'sleepH',
  'steps',
  'activeKcal',
  'exerciseMin',
  'kcal',
  'proteinG',
  'waterMl',
  'weightKg',
  'restingHr',
  'hrv',
  'hcHydrationMl',
  'hcNutritionKcal',
  'overall',
] as const;

const SCORE_PARTS = ['overall', 'diet', 'activity', 'vitals'] as const;

const noArgs = { type: 'object', properties: {}, additionalProperties: false };

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: 'get_today',
    description: "Today's intake vs the plan and the pace by now, water, steps, last night's sleep and its source.",
    parameters: noArgs,
  },
  {
    name: 'get_vitals',
    description: 'Vitals areas in words (state, facts, step) and every reading as shown, with its expected values and source.',
    parameters: noArgs,
  },
  {
    name: 'get_blood_work',
    description:
      'The familiar blood factors from lab reports (value, state, expected values, trend, step). all=true lists every test result instead.',
    parameters: {
      type: 'object',
      properties: { all: { type: 'boolean' } },
      additionalProperties: false,
    },
  },
  {
    name: 'get_trend',
    description:
      'Daily values of one metric, oldest first. hcHydrationMl and hcNutritionKcal come from other apps and never count toward the day.',
    parameters: {
      type: 'object',
      properties: {
        metric: { type: 'string', enum: TREND_METRICS },
        days: { type: 'integer', minimum: 1, maximum: 14 },
      },
      required: ['metric', 'days'],
      additionalProperties: false,
    },
  },
  { name: 'get_meals', description: "Today's logged meals with their items and macros.", parameters: noArgs },
  {
    name: 'get_sessions',
    description: 'Workouts from Health Connect in the last N days.',
    parameters: {
      type: 'object',
      properties: { days: { type: 'integer', minimum: 1, maximum: 14 } },
      required: ['days'],
      additionalProperties: false,
    },
  },
  {
    name: 'explain_score',
    description: 'What a score the person sees is made of, in facts.',
    parameters: {
      type: 'object',
      properties: { part: { type: 'string', enum: SCORE_PARTS } },
      required: ['part'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_meal',
    description:
      'Prepare a one-tap log of a meal the person says they ate, from their words. Never for a suggestion or a meal they have not eaten.',
    parameters: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Foods and portions, e.g. "2 rotis, dal, curd"' },
        mealType: { type: 'string', enum: MEAL_TYPES },
      },
      required: ['description'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_water',
    description: 'Prepare a one-tap water log.',
    parameters: {
      type: 'object',
      properties: { ml: { type: 'integer', minimum: 50, maximum: 2000 } },
      required: ['ml'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_weight',
    description: 'Prepare a one-tap weigh-in the person just told you, in kg.',
    parameters: {
      type: 'object',
      properties: { kg: { type: 'number', minimum: 25, maximum: 300 } },
      required: ['kg'],
      additionalProperties: false,
    },
  },
  {
    name: 'suggest_exercise',
    description: 'Prepare a short workout with a one-tap reminder.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        minutes: { type: 'integer', minimum: 5, maximum: 120 },
        moves: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 },
        at: { type: 'string', description: 'Reminder time today, HH:MM (24 h)' },
      },
      required: ['title', 'minutes', 'moves'],
      additionalProperties: false,
    },
  },
  {
    name: 'open',
    description:
      'Prepare a one-tap shortcut: log (a meal), weigh, sleep_hours (fix last night), ask_wake (set the usual wake time), usage_access (allow screen time), connect (Health Connect), blood_work (all lab results).',
    parameters: {
      type: 'object',
      properties: { target: { type: 'string', enum: OPEN_TARGETS } },
      required: ['target'],
      additionalProperties: false,
    },
  },
];

/** What the person sees while a tool runs. */
export function toolStatus(call: ToolCall): string | null {
  switch (call.name) {
    case 'get_today':
    case 'explain_score':
      return 'Checking today';
    case 'get_vitals':
      return 'Checking your vitals';
    case 'get_blood_work':
      return 'Checking your blood work';
    case 'get_trend':
      return 'Checking the last few days';
    case 'get_meals':
      return "Checking today's meals";
    case 'get_sessions':
      return 'Checking your workouts';
    case 'propose_meal':
      return 'Working out the meal';
    default:
      return null;
  }
}

const args = {
  get_blood_work: z.object({ all: z.boolean().optional() }),
  get_trend: z.object({ metric: z.enum(TREND_METRICS), days: z.number().int().min(1).max(14) }),
  get_sessions: z.object({ days: z.number().int().min(1).max(14) }),
  explain_score: z.object({ part: z.enum(SCORE_PARTS) }),
  propose_meal: z.object({ description: z.string().trim().min(1).max(MAX_MEAL_NOTE), mealType: z.enum(MEAL_TYPES).optional() }),
  propose_water: z.object({ ml: z.number() }),
  propose_weight: z.object({ kg: z.number() }),
  suggest_exercise: z.object({
    title: z.string(),
    minutes: z.number(),
    moves: z.array(z.string()),
    at: z.string().nullish(),
  }),
  open: z.object({ target: z.string() }),
};

export type ToolOutcome = { result: unknown; card?: AdvisorCard };

const PREPARED = 'Prepared as a one-tap card under the reply.';

@Injectable()
export class AdvisorTools {
  constructor(private readonly meals: MealsService) {}

  /** Runs one call against the snapshot. A card is offered only while none has been prepared. */
  async run(call: ToolCall, ctx: AdvisorContext, cardTaken: boolean): Promise<ToolOutcome> {
    let raw: unknown;
    try {
      raw = call.arguments.trim() ? JSON.parse(call.arguments) : {};
    } catch {
      return { result: { error: 'Arguments were not valid JSON.' } };
    }
    const parse = <K extends keyof typeof args>(name: K) => args[name].safeParse(raw) as z.ZodSafeParseResult<z.infer<(typeof args)[K]>>;

    switch (call.name) {
      case 'get_today':
        return { result: { ...ctx.today, plan: ctx.plan, connected: ctx.connected } };
      case 'get_vitals':
        return { result: { vitalsScore: ctx.today.scores.vitals, areas: ctx.vitals.areas, readings: ctx.vitals.rows } };
      case 'get_blood_work': {
        const p = parse('get_blood_work');
        if (!ctx.blood) return { result: { none: 'No lab report added yet.' } };
        if (p.success && p.data.all) return { result: { addedDay: ctx.blood.addedDay, results: ctx.blood.results } };
        return {
          result: {
            addedDay: ctx.blood.addedDay,
            factors: ctx.blood.factors.map((f) => ({ factor: f.label, ...f.lead, step: f.step })),
          },
        };
      }
      case 'get_trend': {
        const p = parse('get_trend');
        if (!p.success) return { result: { error: 'Unknown metric or days.' } };
        return {
          result: ctx.days.slice(-p.data.days).map((d) => ({ day: d.day, value: d[p.data.metric] })),
        };
      }
      case 'get_meals':
        return { result: ctx.meals };
      case 'get_sessions': {
        const p = parse('get_sessions');
        if (!p.success) return { result: { error: 'days must be 1-14.' } };
        const from = ctx.days.at(-p.data.days)?.day ?? ctx.today.day;
        return { result: ctx.sessions.filter((s) => s.day >= from) };
      }
      case 'explain_score': {
        const p = parse('explain_score');
        if (!p.success) return { result: { error: 'Unknown part.' } };
        return { result: this.explain(ctx, p.data.part) };
      }
      case 'propose_meal':
      case 'propose_water':
      case 'propose_weight':
      case 'suggest_exercise':
      case 'open':
        if (cardTaken) return { result: { error: 'A card is already prepared for this reply.' } };
        return this.card(call.name, raw, ctx);
      default:
        return { result: { error: `No tool named ${call.name}.` } };
    }
  }

  private explain(ctx: AdvisorContext, part: (typeof SCORE_PARTS)[number]) {
    const { today, plan } = ctx;
    const diet = {
      score: today.scores.diet,
      eaten: today.intake,
      onPaceByNow: today.expected,
      planPerDay: { kcal: plan.kcal, proteinG: plan.proteinG, carbsG: plan.carbsG, fatG: plan.fatG },
    };
    const activity = { score: today.scores.activity, steps: today.steps, planSteps: plan.steps, exerciseMin: ctx.days.at(-1)?.exerciseMin ?? null };
    const vitals = { score: today.scores.vitals, areas: ctx.vitals.areas.map(({ key, state, words }) => ({ key, state, words })) };
    if (part === 'diet') return diet;
    if (part === 'activity') return activity;
    if (part === 'vitals') return vitals;
    return { score: today.scores.overall, diet, activity, vitals, water: { ml: today.waterMl, planMl: plan.waterMl } };
  }

  /** Builds a card from the arguments and holds it to the shared ranges. */
  private async card(name: string, raw: unknown, ctx: AdvisorContext): Promise<ToolOutcome> {
    let candidate: unknown;
    let summary: string;
    switch (name) {
      case 'propose_meal': {
        const p = args.propose_meal.safeParse(raw);
        if (!p.success) return { result: { error: 'A short description of the food is needed.' } };
        const hour = Math.min(ctx.today.hour, 24);
        const mealType = p.data.mealType ?? mealTypeAt(hour);
        let analysis;
        try {
          analysis = await this.meals.parseText({ note: p.data.description, hour, mealType });
        } catch (error) {
          if (error instanceof AiUnavailableError) return { result: { error: 'The meal could not be worked out right now.' } };
          throw error;
        }
        if (!analysis.isFood) return { result: { error: 'That does not read as food.' } };
        const items = analysis.items.map(({ name, portion, grams, kcal, proteinG, carbsG, fatG }) => ({
          name: name.slice(0, 60),
          portion: (portion ?? '').slice(0, 40),
          grams,
          kcal,
          proteinG,
          carbsG,
          fatG,
        }));
        candidate = { kind: 'meal', title: (analysis.title || p.data.description).slice(0, 60), mealType, items };
        const kcal = Math.round(items.reduce((t, i) => t + i.kcal, 0));
        const protein = Math.round(items.reduce((t, i) => t + i.proteinG, 0));
        summary = `${mealType}: ${items.map((i) => i.name).join(', ')}; ${kcal} kcal, ${protein} g protein.`;
        break;
      }
      case 'propose_water': {
        const p = args.propose_water.safeParse(raw);
        candidate = p.success ? { kind: 'water', ml: Math.round(p.data.ml) } : null;
        summary = p.success ? `${Math.round(p.data.ml)} ml of water.` : '';
        break;
      }
      case 'propose_weight': {
        const p = args.propose_weight.safeParse(raw);
        candidate = p.success ? { kind: 'weight', kg: Math.round(p.data.kg * 10) / 10 } : null;
        summary = p.success ? `A weigh-in of ${Math.round(p.data.kg * 10) / 10} kg.` : '';
        break;
      }
      case 'suggest_exercise': {
        const p = args.suggest_exercise.safeParse(raw);
        const at = p.success && p.data.at && /^\d{2}:\d{2}$/.test(p.data.at) ? p.data.at : null;
        candidate = p.success ? { kind: 'exercise', title: p.data.title, minutes: p.data.minutes, moves: p.data.moves, at } : null;
        summary = p.success ? `${p.data.title}, ${p.data.minutes} min, with a reminder.` : '';
        break;
      }
      default: {
        const p = args.open.safeParse(raw);
        // Never offer to set up what's already there.
        if (p.success && p.data.target === 'connect' && ctx.connected.healthConnect)
          return { result: { error: 'Health Connect is already connected.' } };
        if (p.success && p.data.target === 'usage_access' && ctx.connected.screenTime)
          return { result: { error: 'Screen time is already allowed.' } };
        candidate = p.success ? { kind: 'open', target: p.data.target } : null;
        summary = p.success ? `A shortcut to ${p.data.target}.` : '';
      }
    }
    const card = advisorCardSchema.safeParse(candidate);
    if (!card.success) return { result: { error: 'Outside the believable range; nothing was prepared.' } };
    return { result: { prepared: summary, note: PREPARED }, card: card.data };
  }
}

