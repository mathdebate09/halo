// The Today hero's words. The PA's brief speaks when something needs the user; when the day is
// on track (or still an early read) the tier's own line does, picked by day, tier and time of day
// so the words stay put between renders.

import type { Brief, Tier } from '@/shared';

type Slot = 'morning' | 'afternoon' | 'evening' | 'night';
type Copy = { tagline: string; body: string };

const TEMPLATES: Record<Tier, Record<Slot, Copy[]>> = {
  high: {
    morning: [
      {
        tagline: 'Go get ’em',
        body: 'You’re starting strong. A good breakfast and some early steps keep it that way.',
      },
      {
        tagline: 'Bright start',
        body: 'Everything’s lined up today. A protein-rich breakfast sets the pace.',
      },
    ],
    afternoon: [
      {
        tagline: 'Keep it rolling',
        body: 'You’re right on pace. A balanced lunch and a short walk will hold it there.',
      },
      {
        tagline: 'Right on track',
        body: 'Meals and movement are lining up nicely. Keep the same easy rhythm.',
      },
    ],
    evening: [
      {
        tagline: 'Nicely done',
        body: 'Today went to plan. A light dinner and an early night set up tomorrow.',
      },
      {
        tagline: 'Strong finish',
        body: 'You stayed on pace all day. Wind down and let it carry into tomorrow.',
      },
    ],
    night: [
      {
        tagline: 'Rest well',
        body: 'A good day behind you. Sleep is what carries it into tomorrow.',
      },
      {
        tagline: 'Lights down',
        body: 'You did the work today. Wind down and let your body catch up.',
      },
    ],
  },
  mid: {
    morning: [
      {
        tagline: 'Easy does it',
        body: 'There’s room to build today. Start with a steady breakfast and see where it goes.',
      },
      {
        tagline: 'Find your rhythm',
        body: 'A glass of water and a balanced breakfast are a good first step.',
      },
    ],
    afternoon: [
      {
        tagline: 'Small steps count',
        body: 'You’re a little off pace. A balanced lunch and a short walk will close the gap.',
      },
      {
        tagline: 'Steady on',
        body: 'Some water and a few minutes on your feet will nudge the day back on track.',
      },
    ],
    evening: [
      {
        tagline: 'Still time',
        body: 'A balanced dinner can round the day out well. Tomorrow starts fresh.',
      },
      {
        tagline: 'Wind down well',
        body: 'Something nourishing and an early night will do the most now.',
      },
    ],
    night: [
      {
        tagline: 'Time to rest',
        body: 'Whatever today was, sleep is the best next step. Tomorrow starts fresh.',
      },
      {
        tagline: 'Ease off',
        body: 'Put the screen down soon. A good night’s sleep does more than anything else now.',
      },
    ],
  },
  low: {
    morning: [
      {
        tagline: 'Gentle start',
        body: 'Take it slow today. Breakfast and a little water are a good place to begin.',
      },
      {
        tagline: 'One thing at a time',
        body: 'No need to do it all. A steady breakfast is enough to get going.',
      },
    ],
    afternoon: [
      {
        tagline: 'Reset and refuel',
        body: 'The day isn’t over. A proper meal and a short walk can turn it around.',
      },
      {
        tagline: 'Plenty of day left',
        body: 'A good lunch and some water will lift the rest of it.',
      },
    ],
    evening: [
      {
        tagline: 'Rest up',
        body: 'Tomorrow is a fresh start. Something nourishing and a good night’s sleep help most.',
      },
      {
        tagline: 'Be kind to yourself',
        body: 'Some days are like this. Eat well tonight and rest; tomorrow is new.',
      },
    ],
    night: [
      {
        tagline: 'Rest up',
        body: 'Today is done. A good night’s sleep is the kindest thing you can do now.',
      },
      {
        tagline: 'Let it go',
        body: 'Tomorrow is a clean slate. Rest is all that’s needed tonight.',
      },
    ],
  },
};

const PROVISIONAL_BODY =
  'Go about your day. Your score sharpens as meals, water and steps come in.';
const PROVISIONAL_NIGHT = 'Rest up. Tomorrow’s score builds as meals, water and steps come in.';

// Late night (from 22:00 until 05:00) is still the previous day under the 4 am rollover: no
// breakfast advice at 2 am.
const slotFor = (hour: number): Slot =>
  hour < 5 || hour >= 22 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

function hash(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function todayCopy(tier: Tier, day: string, hour: number, provisional: boolean): Copy {
  const slot = slotFor(hour);
  const options = TEMPLATES[tier][slot];
  const pick = options[hash(`${day}:${tier}:${slot}`) % options.length]!;
  if (!provisional) return pick;
  return { tagline: pick.tagline, body: slot === 'night' ? PROVISIONAL_NIGHT : PROVISIONAL_BODY };
}

/** What the hero says: the brief (led by yesterday's outcome in the morning), or the tier's line. */
export function briefCopy(brief: Brief, tier: Copy): Copy {
  const { insight, lead } = brief;
  if (insight.type === 'on_track') return lead ? { tagline: tier.tagline, body: lead } : tier;
  const body = lead ? `${lead} ${insight.copy.line}` : insight.copy.line;
  return { tagline: insight.copy.tagline, body };
}
