import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

import { AiService } from '../ai/ai.service.js';
import { type PhraseBody, phrasedSchema, phraseProblem, type PhraseResult } from '../shared/index.js';

// The brief arrives as a pattern: placeholders for every number, no user text. The model only
// rewords it; the shared guard then drops anything that changed the meaning or sounds generated.
const SYSTEM = `You reword short messages for the home screen of a personal health app.
Reply with json only, in exactly this shape:
{"items":[{"key":"<the item's key>","tagline":"<new words>","line":"<new words, same {placeholders}>","actionLabel":"<new words, or null>"}]}
Each input item has a key, a kind, the day's tier (high, mid or low), the time of day, the user's goal and a pattern.
Write one output item per input item, with the same key.
Voice: a sharp personal assistant texting the person they work for. Plain, specific, calm, forward-looking. Warmer and gentler when the tier is low. Never shaming, never medical.
Rules:
- Keep the pattern's meaning and every {placeholder} exactly as written. Never write a digit; numbers only come from placeholders.
- tagline: 2 to 4 words, at most 28 characters, no full stop.
- line: one or two short sentences, at most 110 characters.
- actionLabel: at most 24 characters, starting with a verb; null when the pattern's is null.
- Ask a question only if the pattern asks one.
- Never mention AI, apps, data, tracking, insights or yourself.
- No exclamation marks, emoji, dashes or semicolons.
- Avoid: let's, great job, remember to, don't forget, it looks like, journey, boost, fuel, you've got this, here's, consider.
- Write your own version: never return the pattern unchanged.`;

const answerSchema = z.object({ items: z.array(phrasedSchema.partial({ actionLabel: true })) });

@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);

  constructor(private readonly ai: AiService) {}

  async phrase(body: PhraseBody): Promise<PhraseResult> {
    const input = body.items.map(({ key, kind, tier, slot, goal, pattern }) => ({
      key,
      kind,
      tier,
      timeOfDay: slot,
      goal,
      pattern,
    }));
    const answer = await this.ai.json({
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: JSON.stringify({ items: input }) },
      ],
      schema: answerSchema,
      maxTokens: 120 * body.items.length,
      // Short call: well inside Heroku's 30 s window even with the retry.
      timeoutMs: 8_000,
      // Fresh words are the point of this call.
      temperature: 0.8,
    });

    const items: PhraseResult['items'] = [];
    for (const asked of body.items) {
      const out = answer.items.find((i) => i.key === asked.key);
      if (!out) continue;
      const copy = { tagline: out.tagline.trim(), line: out.line.trim(), actionLabel: out.actionLabel?.trim() ?? null };
      const problem = phraseProblem(asked.pattern, copy);
      if (problem) {
        // The reason only (e.g. "digits"), never the text.
        this.logger.warn(`Dropped ${asked.kind} rewording: ${problem}`);
        continue;
      }
      items.push({ key: asked.key, ...copy });
    }
    return { items };
  }
}
