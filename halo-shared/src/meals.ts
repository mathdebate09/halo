// The meal-analysis contract between halo-app and halo-backend.
//
//   POST /meals/analyse-photo  { key, image, note?, hour, mealType }  → 202 { id, status }   (job)
//   POST /meals/parse-text     { note, hour, mealType }               → 200 MealAnalysis     (short)
//   GET  /jobs/:id                                                    → JobView
//
// Photos are ~1024 px JPEGs (base64, no data: prefix), analysed in memory and never stored. The
// note is free text from the user and is treated as data, never as instructions.

import { z } from 'zod';

import type { MealType } from './scoring';

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const satisfies readonly MealType[];

/** Largest accepted photo (decoded); the app sends ~1024 px JPEGs well under this. */
export const MAX_MEAL_PHOTO_BYTES = 3 * 1024 * 1024;
export const MAX_MEAL_NOTE = 280;

const context = {
  /** Local wall-clock hour the meal was eaten (13.5 = 13:30). */
  hour: z.number().min(0).max(24),
  mealType: z.enum(MEAL_TYPES),
};

export const analysePhotoBodySchema = z.object({
  /** Client idempotency key (the meal id): retries return the same job. */
  key: z.uuid(),
  image: z
    .string()
    .min(100)
    .max(Math.ceil((MAX_MEAL_PHOTO_BYTES * 4) / 3) + 4)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'must be base64 without a data: prefix'),
  note: z.string().trim().max(MAX_MEAL_NOTE).optional(),
  ...context,
});
export type AnalysePhotoBody = z.infer<typeof analysePhotoBodySchema>;

export const parseTextBodySchema = z.object({
  note: z.string().trim().min(1).max(MAX_MEAL_NOTE),
  ...context,
});
export type ParseTextBody = z.infer<typeof parseTextBodySchema>;

const grams = z.coerce.number().min(0).max(1000);

export const mealItemEstimateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  /** Human portion, e.g. "1 cup", "2 slices". */
  portion: z.string().trim().max(60).nullish().transform((v) => v || null),
  grams: z.coerce.number().min(0).max(5000).nullish().transform((v) => v ?? null),
  kcal: z.coerce.number().min(0).max(5000),
  proteinG: grams,
  carbsG: grams,
  fatG: grams,
  /** 0-1: how sure the estimate is for this item. */
  confidence: z.coerce.number().min(0).max(1),
});
export type MealItemEstimate = z.infer<typeof mealItemEstimateSchema>;

export const mealAnalysisSchema = z.object({
  /** False when the photo or text isn't food; items are then empty. */
  isFood: z.boolean(),
  /** Short name for the whole meal, e.g. "Chicken rice bowl". */
  title: z.string().trim().max(80),
  items: z.array(mealItemEstimateSchema).max(20),
  confidence: z.coerce.number().min(0).max(1),
});
export type MealAnalysis = z.infer<typeof mealAnalysisSchema>;

export const JOB_STATUSES = ['queued', 'running', 'done', 'failed'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export type JobView = {
  id: string;
  kind: string;
  status: JobStatus;
  result?: unknown;
  /** Machine-readable reason when failed: 'ai_unavailable' | 'interrupted' | 'error'. */
  error?: string;
};
