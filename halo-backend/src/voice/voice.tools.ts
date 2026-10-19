import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import type { ToolCall, ToolSpec } from '../ai/ai.service.js';
import { AdvisorTools, TOOL_SPECS } from '../advisor/advisor.tools.js';
import {
  type AdvisorContext,
  MAX_MEAL_NOTE,
  MEAL_TYPES,
  VOICE_OPEN_TARGETS,
  type VoiceAction,
  voiceActionLabel,
  voiceActionSchema,
} from '../shared/index.js';

// A voice reply acts instead of preparing a card: each log becomes an action the phone applies to
// its own store at once (with Undo). Reading the snapshot is the Advisor's tools, unchanged.

/** The Advisor's tools that only read the snapshot. */
const READ_SPECS = TOOL_SPECS.filter((t) => t.name.startsWith('get_') || t.name === 'explain_score');
const READ_NAMES = new Set(READ_SPECS.map((t) => t.name));

const ACT_SPECS: ToolSpec[] = [
  {
    name: 'log_meal',
    description: 'Log a meal the person says they ate, from their words. Never for a suggestion or a plan.',
    parameters: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Foods and portions as said, e.g. "2 rotis and dal"' },
        title: { type: 'string', description: 'A short name for it, e.g. "Two rotis and dal"' },
        mealType: { type: 'string', enum: MEAL_TYPES },
      },
      required: ['description', 'title'],
      additionalProperties: false,
    },
  },
  {
    name: 'log_water',
    description: 'Log water the person drank. One glass is 250 ml.',
    parameters: {
      type: 'object',
      properties: { ml: { type: 'integer', minimum: 50, maximum: 2000 } },
      required: ['ml'],
      additionalProperties: false,
    },
  },
  {
    name: 'log_weight',
    description: 'Save a weigh-in the person just read, in kg (convert pounds).',
    parameters: {
      type: 'object',
      properties: { kg: { type: 'number', minimum: 25, maximum: 300 } },
      required: ['kg'],
      additionalProperties: false,
    },
  },
  {
    name: 'undo_last',
    description: 'Take back the last thing logged by voice.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'open',
    description:
      'Open a screen in Halo: logger (log a meal), camera (meal photo), advisor (a longer talk), weigh, sleep_hours (fix last night), ask_wake (usual wake time), usage_access (allow screen time), connect (Health Connect), blood_work (lab results).',
    parameters: {
      type: 'object',
      properties: { target: { type: 'string', enum: VOICE_OPEN_TARGETS } },
      required: ['target'],
      additionalProperties: false,
    },
  },
];

/** Every tool for a turn; without a snapshot only the acting ones. */
export const voiceToolSpecs = (ctx: AdvisorContext | null): ToolSpec[] => (ctx ? [...READ_SPECS, ...ACT_SPECS] : ACT_SPECS);

const args = {
  log_meal: z.object({
    description: z.string().trim().min(1).max(MAX_MEAL_NOTE),
    title: z.string().trim().min(1).max(60).optional(),
    mealType: z.enum(MEAL_TYPES).optional(),
  }),
  log_water: z.object({ ml: z.number() }),
  log_weight: z.object({ kg: z.number() }),
  open: z.object({ target: z.string() }),
};

export type VoiceToolOutcome = { result: unknown; action?: VoiceAction };

@Injectable()
export class VoiceTools {
  constructor(private readonly advisor: AdvisorTools) {}

  async run(call: ToolCall, ctx: AdvisorContext | null): Promise<VoiceToolOutcome> {
    if (READ_NAMES.has(call.name)) {
      if (!ctx) return { result: { error: 'No data for today yet.' } };
      return { result: (await this.advisor.run(call, ctx, true)).result };
    }
    let raw: unknown;
    try {
      raw = call.arguments.trim() ? JSON.parse(call.arguments) : {};
    } catch {
      return { result: { error: 'Arguments were not valid JSON.' } };
    }
    let candidate: unknown = null;
    let done = '';
    switch (call.name) {
      case 'log_meal': {
        const p = args.log_meal.safeParse(raw);
        if (!p.success) return { result: { error: 'A short description of the food is needed.' } };
        const title = p.data.title ?? p.data.description;
        candidate = {
          kind: 'meal',
          description: p.data.description,
          mealType: p.data.mealType ?? null,
          label: voiceActionLabel({ kind: 'meal', title }),
        };
        done = `Logged: ${title}.`;
        break;
      }
      case 'log_water': {
        const p = args.log_water.safeParse(raw);
        const ml = p.success ? Math.round(p.data.ml) : 0;
        candidate = { kind: 'water', ml, label: voiceActionLabel({ kind: 'water', ml }) };
        done = `Added ${ml} ml of water.`;
        break;
      }
      case 'log_weight': {
        const p = args.log_weight.safeParse(raw);
        const kg = p.success ? Math.round(p.data.kg * 10) / 10 : 0;
        const pounds = ctx?.profile.units === 'imperial';
        candidate = { kind: 'weight', kg, label: voiceActionLabel({ kind: 'weight', kg, pounds }) };
        done = `Saved a weigh-in of ${kg} kg.`;
        break;
      }
      case 'undo_last':
        candidate = { kind: 'undo', label: voiceActionLabel({ kind: 'undo' }) };
        done = 'The last voice log was taken back.';
        break;
      case 'open': {
        const p = args.open.safeParse(raw);
        // Never offer to set up what's already there.
        if (p.success && p.data.target === 'connect' && ctx?.connected.healthConnect)
          return { result: { error: 'Health Connect is already connected.' } };
        if (p.success && p.data.target === 'usage_access' && ctx?.connected.screenTime)
          return { result: { error: 'Screen time is already allowed.' } };
        candidate = p.success ? { kind: 'open', target: p.data.target } : null;
        done = p.success ? `Opening ${p.data.target}.` : '';
        break;
      }
      default:
        return { result: { error: `No tool named ${call.name}.` } };
    }
    const action = voiceActionSchema.safeParse(candidate);
    if (!action.success) return { result: { error: 'Outside the believable range; nothing was done.' } };
    return { result: { done }, action: action.data };
  }
}
