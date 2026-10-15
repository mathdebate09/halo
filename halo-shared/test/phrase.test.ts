import { describe, expect, it } from 'vitest';

import { briefCopy, briefPattern, fillPattern } from '../src/brief-copy';
import { phraseKey, phraseProblem, slotFor } from '../src/phrase';
import type { Signal } from '../src/signals';

const protein: Signal = {
  id: '2026-10-14:protein_pace',
  type: 'protein_pace',
  severity: 55,
  reason: '',
  action: { kind: 'log', note: 'Greek yogurt with berries' },
  expiresAt: 0,
  tab: 'protein',
  facts: { gap: 25, at: '15:00', dinnerLogged: 0 },
};

describe('patterns', () => {
  it('turns live numbers and times into placeholders', () => {
    expect(briefPattern(protein).line).toBe(
      'About {gap} g short for {at}. Greek yogurt with berries now, and dinner covers the rest.',
    );
  });
  it('fills back to the template copy', () => {
    expect(fillPattern(briefPattern(protein), protein.facts)).toEqual(briefCopy(protein));
    expect(briefCopy(protein).line).toBe(
      'About 25 g short for 15:00. Greek yogurt with berries now, and dinner covers the rest.',
    );
  });
  it('formats large numbers the way the panel does', () => {
    const water = { ...protein, type: 'water_pace' as const, facts: { gap: 1250, at: '6 pm' } };
    expect(briefCopy(water).line).toBe('About 1,250 ml behind for 6 pm. A glass now helps.');
  });
  it('keeps zero flags as branches, not placeholders', () => {
    expect(briefPattern({ ...protein, facts: { ...protein.facts, dinnerLogged: 1 } }).line).toBe(
      'About {gap} g short for {at}. Greek yogurt with berries closes most of it.',
    );
  });
});

describe('phrase guard', () => {
  const pattern = briefPattern(protein);
  const ok = {
    tagline: 'Protein is short',
    line: 'You’re about {gap} g under for {at}. Greek yogurt now, dinner does the rest.',
    actionLabel: 'Log a protein snack',
  };
  it('accepts a faithful rewording', () => {
    expect(phraseProblem(pattern, ok)).toBeNull();
  });
  it('rejects invented numbers, unknown or dropped placeholders', () => {
    expect(phraseProblem(pattern, { ...ok, line: 'About 25 g under for {at}.' })).toBe('missing gap');
    expect(phraseProblem(pattern, { ...ok, line: '{gap} g under by {at}, 20 g in a pot.' })).toBe('digits');
    expect(phraseProblem(pattern, { ...ok, tagline: '{left} to go' })).toBe('placeholder left');
  });
  it('rejects anything that reads machine-written or mentions AI', () => {
    for (const line of [
      'Let’s close {gap} g by {at}.',
      'Your AI noticed {gap} g missing by {at}.',
      'Great job, just {gap} g left by {at}!',
      'Remember to add {gap} g by {at}.',
      'About {gap} g short for {at} — a yogurt helps.',
      'About {gap} g short for {at} 💪',
      'Your data shows {gap} g short at {at}.',
    ]) {
      expect(phraseProblem(pattern, { ...ok, line }), line).not.toBeNull();
    }
  });
  it('keeps questions and actions only where the template had them', () => {
    expect(phraseProblem(pattern, { ...ok, line: 'Short {gap} g by {at}?' })).toBe('question');
    expect(phraseProblem(pattern, { ...ok, actionLabel: null })).toBe('action');
  });
  it('enforces the length limits', () => {
    expect(phraseProblem(pattern, { ...ok, tagline: 'x'.repeat(40) })).toBe('shape');
  });
});

describe('phrase key', () => {
  const item = { kind: 'protein_pace' as const, tier: 'mid' as const, slot: 'afternoon' as const, goal: 'lose' as const };
  it('stays the same when only the numbers move', () => {
    const a = phraseKey({ ...item, pattern: briefPattern(protein) });
    const b = phraseKey({ ...item, pattern: briefPattern({ ...protein, facts: { ...protein.facts, gap: 40 } }) });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-z0-9]{6,32}$/);
  });
  it('changes with the situation or the voice', () => {
    const a = phraseKey({ ...item, pattern: briefPattern(protein) });
    expect(phraseKey({ ...item, tier: 'low', pattern: briefPattern(protein) })).not.toBe(a);
    const dinner = briefPattern({ ...protein, facts: { ...protein.facts, dinnerLogged: 1 } });
    expect(phraseKey({ ...item, pattern: dinner })).not.toBe(a);
  });
  it('slots the day', () => {
    expect([2, 8, 13, 19, 23].map(slotFor)).toEqual(['night', 'morning', 'afternoon', 'evening', 'night']);
  });
});

describe('templates are valid rewordings of themselves (apart from being unchanged)', () => {
  const facts: Record<string, Signal['facts']> = {
    meal_window: { meal: 'lunch', status: 'open', at: '13:00', missed: 'breakfast' },
    calorie_pace: { gap: 400, at: '15:00', next: 'dinner' },
    calorie_over: { left: 0, next: 'dinner' },
    water_pace: { gap: 500, at: '15:00' },
    weigh_in: {},
    sleep_debt: { at: '22:30', slept: 5.6, need: 7.5 },
    bedtime: { at: '22:30', slept: 5.6, need: 7.5, pulled: 1 },
    on_track: {},
  };
  for (const [type, f] of Object.entries(facts)) {
    it(type, () => {
      const p = briefPattern({ ...protein, type: type as Signal['type'], facts: f });
      expect(phraseProblem(p, { ...p, tagline: `${p.tagline} x` })).toBeNull();
    });
  }
  it('missed meal and protein variants', () => {
    const variants: Signal['facts'][] = [
      { meal: 'breakfast', status: 'missed', next: 'lunch', nextAt: '13:00' },
      { meal: 'lunch', status: 'open', at: '13:00', proteinGap: 25 },
      { meal: 'dinner', status: 'open', at: '19:30', light: 1, left: 300 },
    ];
    for (const f of variants) {
      const p = briefPattern({ ...protein, type: 'meal_window', facts: f });
      expect(phraseProblem(p, { ...p, tagline: `${p.tagline} x` })).toBeNull();
    }
    const p = briefPattern(protein);
    expect(phraseProblem(p, p)).toBe('unchanged');
  });
});
