// The snapshot sent with each Advisor turn (halo-shared `advisorContextSchema`): what the screens
// show, in their words. Built on the phone from local data only, at send time; the server keeps
// none of it.

import { and, eq, gte, inArray, isNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { dailyScores, hcDaily, mealItems, meals, water } from '@/db/schema';
import {
  addDays,
  type AdvisorContext,
  advisorContextSchema,
  AREA_STEPS,
  CALORIE_FLOOR,
  dayHour,
  dayKey,
  type LabResult,
  rowStateLabel,
  vitalsDetail,
} from '@/shared';
import { compareText, displayValue, METRIC_LABELS, sourceText } from '@/vitals/metrics';
import { areaSummary } from '@/vitals/summary';

import type { AdvisorSources } from './sources';

const DAYS = 14;

const cut = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const pad = (n: number) => String(n).padStart(2, '0');

function labRow(r: LabResult) {
  const value = `${r.qualifier ? `${r.qualifier} ` : ''}${r.value}${r.unit ? ` ${r.unit}` : ''}`;
  return {
    key: cut(r.metric, 48),
    label: cut(r.label, 48),
    value: cut(value, 32),
    stateWord: r.stateWord ? cut(r.stateWord, 24) : null,
    expected: r.expected ? cut(r.expected, 32) : null,
    trend: r.trend ? cut(r.trend, 32) : null,
    day: r.day,
    far: r.far,
  };
}

/** Per day: what was eaten (logged meals), drunk (in-app water) and the day's overall score. */
function dayTotals(from: string) {
  const eaten = db
    .select({ day: meals.day, kcal: meals.kcal, proteinG: meals.proteinG })
    .from(meals)
    .where(and(gte(meals.day, from), eq(meals.status, 'logged'), isNull(meals.deletedAt)))
    .all();
  const drunk = db
    .select({ day: water.day, ml: water.ml })
    .from(water)
    .where(and(gte(water.day, from), isNull(water.deletedAt)))
    .all();
  const scored = db
    .select({ day: dailyScores.id, overall: dailyScores.overall })
    .from(dailyScores)
    .where(and(gte(dailyScores.id, from), isNull(dailyScores.deletedAt)))
    .all();
  const totals = new Map<
    string,
    { kcal: number; proteinG: number; waterMl: number; overall: number | null }
  >();
  const at = (day: string) => {
    let t = totals.get(day);
    if (!t) totals.set(day, (t = { kcal: 0, proteinG: 0, waterMl: 0, overall: null }));
    return t;
  };
  for (const m of eaten) {
    at(m.day).kcal += m.kcal ?? 0;
    at(m.day).proteinG += m.proteinG ?? 0;
  }
  for (const w of drunk) at(w.day).waterMl += w.ml;
  for (const s of scored) at(s.day).overall = s.overall;
  return totals;
}

/** Other apps' hydration and nutrition (Health Connect): context only, never counted in the day. */
function otherApps(from: string) {
  const rows = db
    .select({
      day: hcDaily.day,
      hydrationMl: hcDaily.hydrationMl,
      nutritionKcal: hcDaily.nutritionKcal,
    })
    .from(hcDaily)
    .where(gte(hcDaily.day, from))
    .all();
  return new Map(rows.map((r) => [r.day, r]));
}

function todaysMeals(day: string, clock: (at: number) => string) {
  const rows = db
    .select()
    .from(meals)
    .where(and(eq(meals.day, day), eq(meals.status, 'logged'), isNull(meals.deletedAt)))
    .all()
    .sort((a, b) => a.eatenAt - b.eatenAt)
    .slice(-12);
  const items = rows.length
    ? db
        .select()
        .from(mealItems)
        .where(
          and(
            inArray(
              mealItems.mealId,
              rows.map((m) => m.id),
            ),
            isNull(mealItems.deletedAt),
          ),
        )
        .all()
    : [];
  return rows.map((m) => ({
    title: cut(m.title ?? m.note ?? 'Meal', 80),
    mealType: m.mealType,
    at: clock(m.eatenAt),
    kcal: clamp(m.kcal ?? 0, 0, 10_000),
    proteinG: clamp(m.proteinG ?? 0, 0, 1000),
    carbsG: clamp(m.carbsG ?? 0, 0, 2000),
    fatG: clamp(m.fatG ?? 0, 0, 1000),
    items: items
      .filter((i) => i.mealId === m.id)
      .slice(0, 16)
      .map((i) => ({ name: cut(i.name, 80), portion: cut(i.portion ?? '', 40) })),
  }));
}

/** The snapshot, or null when there is nothing to build it from yet (no plan). */
export function buildAdvisorContext(src: AdvisorSources, now = new Date()): AdvisorContext | null {
  const { scores, plan, profile } = src;
  if (!plan || !profile?.goal) return null;
  const { facts, vitalsReport, vitalsInput, day } = scores;
  const clock = (at: number) => {
    const d = new Date(at);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const detail = vitalsDetail(vitalsInput, vitalsReport);
  const sleepRow = detail.rows.find((r) => r.key === 'sleep');
  const from = addDays(day, -(DAYS - 1));
  const totals = dayTotals(from);
  const fromApps = otherApps(from);
  const hc = new Map(vitalsInput.days.map((d) => [d.day, d]));
  const days = Array.from({ length: DAYS }, (_, i) => addDays(from, i)).map((d) => {
    const v = hc.get(d);
    const t = totals.get(d);
    const sleepMin = v?.sleepMin ?? (v?.screenNight ? v.screenNight.hours * 60 : null);
    return {
      day: d,
      sleepH: sleepMin == null ? null : Math.round(sleepMin / 6) / 10,
      steps: v?.steps ?? null,
      activeKcal: v?.activeKcal ?? null,
      exerciseMin: v?.exerciseMin ?? null,
      kcal: t ? Math.round(t.kcal) : null,
      proteinG: t ? Math.round(t.proteinG) : null,
      waterMl: t ? t.waterMl : null,
      weightKg: v?.weightKg ?? null,
      restingHr: v?.restingHr ?? null,
      hrv: v?.hrvMs ?? null,
      hcHydrationMl: fromApps.get(d)?.hydrationMl ?? null,
      hcNutritionKcal: fromApps.get(d)?.nutritionKcal ?? null,
      overall: t?.overall ?? null,
    };
  });

  const sessionsFrom = new Date(`${from}T00:00:00`).getTime();
  const context = {
    profile: {
      age: plan.age,
      sex: profile.sex ?? null,
      heightCm: profile.heightCm ?? null,
      units: src.pounds ? 'imperial' : 'metric',
      clock24: src.clock24,
    },
    plan: {
      goal: profile.goal,
      kcal: plan.targetKcal,
      kcalFloor: profile.sex ? CALORIE_FLOOR[profile.sex] : 1200,
      proteinG: plan.proteinG,
      carbsG: plan.carbsG,
      fatG: plan.fatG,
      waterMl: plan.waterMl,
      steps: facts.targets.steps,
      sleepNeedH: facts.sleepNeedHours,
      goalWeightKg: plan.goalWeightKg,
    },
    today: {
      day,
      hour: clamp(dayHour(now), 0, 30),
      clock: clock(now.getTime()),
      scores: {
        overall: Math.round(scores.overall),
        diet: Math.round(scores.diet.value),
        activity: Math.round(scores.activity.value),
        vitals: Math.round(scores.vitals.value),
      },
      intake: {
        kcal: Math.round(facts.intake.kcal),
        proteinG: Math.round(facts.intake.proteinG),
        carbsG: Math.round(facts.intake.carbsG),
        fatG: Math.round(facts.intake.fatG),
      },
      expected: {
        kcal: Math.round(scores.intake.expectedKcal),
        proteinG: Math.round(scores.intake.expectedProteinG),
      },
      waterMl: facts.waterMl,
      steps: facts.steps ?? 0,
      sleep: {
        hours: facts.sleepHours,
        source: sleepRow ? cut(sourceText(sleepRow), 24) : 'Not recorded',
      },
      brief: src.brief
        ? { title: cut(src.brief.tagline, 80), line: cut(src.brief.line, 200) }
        : null,
    },
    vitals: {
      areas: vitalsReport.areas.map((area) => ({
        key: area.key,
        state: area.state,
        words: cut(
          areaSummary(
            area,
            detail.rows.filter((r) => r.area === area.key),
            vitalsInput,
            src.pounds,
          ),
          240,
        ),
        step: area.state === 'thriving' ? null : cut(area.step ?? AREA_STEPS[area.key], 160),
        source: area.source,
      })),
      rows: detail.rows.slice(0, 40).map((row) => {
        const { figure, unit } = displayValue(row, src.pounds);
        return {
          key: row.key,
          area: row.area,
          label: cut(METRIC_LABELS[row.key], 40),
          value: cut(unit ? `${figure} ${unit}` : figure, 24),
          stateWord: cut(rowStateLabel(row), 40),
          expected: (() => {
            const text = compareText(row, src.pounds);
            return text ? cut(text, 40) : null;
          })(),
          source: cut(sourceText(row), 24),
        };
      }),
    },
    blood:
      src.lab.results.length > 0
        ? {
            addedDay: src.lab.addedDay ?? src.lab.results[0]!.day,
            factors: src.lab.factors.map((f) => ({
              key: f.key,
              label: cut(f.label, 32),
              lead: labRow(f.lead),
              step: f.advice ? cut(f.advice, 160) : null,
            })),
            results: src.lab.results.slice(0, 120).map(labRow),
          }
        : null,
    days,
    meals: todaysMeals(day, clock),
    sessions: src.sessions
      .filter((s) => s.start >= sessionsFrom)
      .slice(-30)
      .map((s) => ({
        day: dayKey(new Date(s.start)),
        type: cut(s.title, 32),
        minutes: Math.round((s.end - s.start) / 60_000),
        distanceKm: s.distanceM == null ? null : Math.round(s.distanceM / 100) / 10,
        kcal: null,
      })),
  };
  const parsed = advisorContextSchema.safeParse(context);
  if (!parsed.success) {
    if (__DEV__) console.warn('Advisor snapshot', parsed.error.issues.slice(0, 3));
    return null;
  }
  return parsed.data;
}
