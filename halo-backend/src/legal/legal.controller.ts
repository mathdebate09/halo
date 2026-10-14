import { Controller, Get, Header } from '@nestjs/common';

import { Public } from '../common/public.decorator.js';

// Static terms and privacy pages linked from onboarding (SPEC scr 14 ▸). Plain, honest copy.

const page = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Halo</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:640px;margin:0 auto;padding:32px 20px;background:#101716;color:#ebefe9}
h1{font:400 34px/1.2 Georgia,serif;margin:0 0 16px}h2{font-size:18px;margin:28px 0 6px}p,li{color:#c9d0cb}</style>
</head><body><h1>${title}</h1>${body}</body></html>`;

const TERMS = page(
  'Terms',
  `<p>Halo is a personal wellness tool. It gives general guidance on food, activity and habits and is <strong>not medical advice</strong>. Talk to a doctor before changing your diet or exercise if you have a health condition, and seek urgent care for symptoms like chest pain.</p>
<h2>Your use</h2><p>Use Halo for yourself. Estimates (calories, timelines, scores) are approximations and may be wrong.</p>
<h2>Availability</h2><p>Halo is provided as is, without guarantees of availability or accuracy.</p>`,
);

const PRIVACY = page(
  'Privacy Policy',
  `<p>Halo has no accounts. Your phone creates an anonymous identifier, and everything you log is tied to it.</p>
<h2>What is stored</h2><ul><li>Your logs (meals, water, weight, vitals readings) and plan, on your phone and synced to Halo's server.</li><li>Values extracted from reports you upload. Photos and PDFs are processed in memory and discarded; only the extracted values are kept.</li></ul>
<h2>Health Connect</h2><p>If you connect it, Halo reads the data types you allow, on your phone, to fill in your profile and scores.</p>
<h2>AI</h2><p>Meal photos, text and report pages are sent to an AI model for analysis. Names and identifiers are not stored.</p>
<h2>Deleting</h2><p>Uninstalling removes local data; Android backup may restore it to the same Google account.</p>`,
);

@Controller('legal')
export class LegalController {
  @Public()
  @Get('terms')
  @Header('content-type', 'text/html; charset=utf-8')
  terms() {
    return TERMS;
  }

  @Public()
  @Get('privacy')
  @Header('content-type', 'text/html; charset=utf-8')
  privacy() {
    return PRIVACY;
  }
}
