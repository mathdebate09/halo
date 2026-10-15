// Health reports: the page contract between halo-app and halo-backend, and the values model.
//
//   POST /reports/pages  { key, page, of, text | tiles }  → 202 JobView (kind 'report-page')
//   GET  /jobs/:id                                       → result: ReportPage
//
// The phone reads each page on the device: its text layer when it has a usable one, otherwise two
// JPEG tiles. Pages go one job each; the file itself never leaves the phone. Report text is
// untrusted data, and names, IDs and addresses are scrubbed on both sides. A report can hold any
// analyte, so nothing here is per-parameter except the table of ones we recognise and normalise.

import { z } from 'zod';

import type { Sex } from './plan';
import { round } from './units';

// ── Limits ──────────────────────────────────────────────────────────────────────

export const REPORT_LIMITS = {
  /** Picked file (PDF or one photo). */
  maxFileBytes: 20 * 1024 * 1024,
  /** Pages sent as images; text pages are cheap and don't count. */
  maxImagePages: 12,
  maxPages: 40,
  /** DeepSeek rescales each image to ~1.69 MP; two ~1.5 MP tiles of a 2000 px page stay under it. */
  renderLongSide: 2000,
  tiles: 2,
  tileOverlap: 0.06,
  jpegQuality: 80,
  maxTileBytes: 1.5 * 1024 * 1024,
  maxTextChars: 20_000,
  /** Page jobs a device may have running at once, and per 24 h. */
  pagesInFlight: 4,
  pagesPerDay: 40,
} as const;

// ── Page request ────────────────────────────────────────────────────────────────

const base64 = z
  .string()
  .min(100)
  .max(Math.ceil((REPORT_LIMITS.maxTileBytes * 4) / 3) + 4)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'must be base64 without a data: prefix');

export const reportPageBodySchema = z
  .object({
    /** `<reportId>:p<page>`: retries of a page return the same job. */
    key: z.string().regex(/^[0-9a-f-]{36}:p\d{1,3}$/, 'must be <uuid>:p<page>'),
    page: z.number().int().min(1).max(REPORT_LIMITS.maxPages),
    of: z.number().int().min(1).max(REPORT_LIMITS.maxPages),
    /** The page's text layer, scrubbed on the phone. */
    text: z.string().trim().min(1).max(REPORT_LIMITS.maxTextChars).optional(),
    /** Or the page as JPEG tiles, top to bottom, overlapping slightly. */
    tiles: z.array(base64).min(1).max(REPORT_LIMITS.tiles).optional(),
  })
  .refine((b) => (b.text == null) !== (b.tiles == null), 'send text or tiles, not both')
  .refine((b) => b.page <= b.of, 'page is past the end');
export type ReportPageBody = z.infer<typeof reportPageBodySchema>;

// ── Recognised analytes ─────────────────────────────────────────────────────────

/** Which side of the range is better; `band` = inside is best. Used by the Vitals model. */
export type Direction = 'lower' | 'higher' | 'band';
type Range = { lo: number | null; hi: number | null };
/** Converts a value in another unit to the canonical one and back. */
type Conversion = { to: (v: number) => number; from: (c: number) => number };

const factor = (f: number): Conversion => ({ to: (v) => v * f, from: (c) => c / f });

export type Analyte = {
  label: string;
  /** Canonical unit: values and ranges are stored in it. */
  unit: string;
  /** Normalised names (see `nameKey`) that mean this analyte. */
  aliases: readonly string[];
  /** Other units it's printed in (normalised, see `unitKey`). */
  units: Readonly<Record<string, Conversion>>;
  typical: Range | { male: Range; female: Range };
  direction: Direction;
};

const MG_DL_CHOLESTEROL = { 'mmol/l': factor(38.67) };

export const ANALYTES = {
  total_cholesterol: {
    label: 'Total cholesterol',
    unit: 'mg/dL',
    aliases: ['total cholesterol', 'cholesterol total', 'cholesterol', 'serum cholesterol'],
    units: MG_DL_CHOLESTEROL,
    typical: { lo: null, hi: 200 },
    direction: 'lower',
  },
  ldl: {
    label: 'LDL cholesterol',
    unit: 'mg/dL',
    aliases: ['ldl', 'ldl cholesterol', 'ldl c', 'cholesterol ldl', 'ldl direct', 'ldl calculated', 'low density lipoprotein', 'low density lipoprotein cholesterol'],
    units: MG_DL_CHOLESTEROL,
    typical: { lo: null, hi: 100 },
    direction: 'lower',
  },
  hdl: {
    label: 'HDL cholesterol',
    unit: 'mg/dL',
    aliases: ['hdl', 'hdl cholesterol', 'hdl c', 'cholesterol hdl', 'hdl direct', 'high density lipoprotein', 'high density lipoprotein cholesterol'],
    units: MG_DL_CHOLESTEROL,
    typical: { male: { lo: 40, hi: null }, female: { lo: 50, hi: null } },
    direction: 'higher',
  },
  triglycerides: {
    label: 'Triglycerides',
    unit: 'mg/dL',
    aliases: ['triglycerides', 'triglyceride', 'tg', 'serum triglycerides'],
    units: { 'mmol/l': factor(88.57) },
    typical: { lo: null, hi: 150 },
    direction: 'lower',
  },
  glucose_fasting: {
    label: 'Fasting glucose',
    unit: 'mg/dL',
    aliases: ['fasting glucose', 'glucose fasting', 'fasting plasma glucose', 'plasma glucose fasting', 'fasting blood glucose', 'fasting blood sugar', 'blood sugar fasting', 'fbs', 'fbg', 'fpg'],
    units: { 'mmol/l': factor(18.016) },
    typical: { lo: 70, hi: 99 },
    direction: 'band',
  },
  glucose_random: {
    label: 'Glucose',
    unit: 'mg/dL',
    aliases: ['glucose', 'random glucose', 'glucose random', 'random plasma glucose', 'random blood glucose', 'random blood sugar', 'blood sugar random', 'rbs', 'blood glucose', 'plasma glucose'],
    units: { 'mmol/l': factor(18.016) },
    typical: { lo: 70, hi: 140 },
    direction: 'band',
  },
  hba1c: {
    label: 'HbA1c',
    unit: '%',
    aliases: ['hba1c', 'a1c', 'hb a1c', 'glycated haemoglobin', 'glycated hemoglobin', 'glycosylated haemoglobin', 'glycosylated hemoglobin', 'haemoglobin a1c', 'hemoglobin a1c'],
    // IFCC mmol/mol ↔ NGSP %.
    units: { 'mmol/mol': { to: (v) => v * 0.09148 + 2.152, from: (c) => (c - 2.152) / 0.09148 } },
    typical: { lo: 4, hi: 5.6 },
    direction: 'lower',
  },
  haemoglobin: {
    label: 'Haemoglobin',
    unit: 'g/dL',
    aliases: ['haemoglobin', 'hemoglobin', 'hb', 'hgb', 'haemoglobin hb', 'hemoglobin hb'],
    units: { 'g/l': factor(0.1), 'mmol/l': factor(1.611) },
    typical: { male: { lo: 13, hi: 17 }, female: { lo: 12, hi: 15.5 } },
    direction: 'band',
  },
  ferritin: {
    label: 'Ferritin',
    unit: 'ng/mL',
    aliases: ['ferritin', 'serum ferritin'],
    units: { 'ug/l': factor(1), 'pmol/l': factor(0.445) },
    typical: { male: { lo: 30, hi: 400 }, female: { lo: 15, hi: 150 } },
    direction: 'band',
  },
  vitamin_d: {
    label: 'Vitamin D',
    unit: 'ng/mL',
    aliases: ['vitamin d', 'vit d', 'vitamin d3', 'vitamin d total', 'total vitamin d', '25 oh vitamin d', '25 oh vit d', '25 hydroxy vitamin d', '25 hydroxyvitamin d', 'vitamin d 25 hydroxy', 'vitamin d 25 oh', '25 oh d', '25oh vitamin d'],
    units: { 'nmol/l': factor(1 / 2.496) },
    typical: { lo: 30, hi: 100 },
    direction: 'band',
  },
  b12: {
    label: 'Vitamin B12',
    unit: 'pg/mL',
    aliases: ['vitamin b12', 'vit b12', 'b12', 'cobalamin', 'cyanocobalamin', 'vitamin b 12'],
    units: { 'pmol/l': factor(1.355), 'ng/l': factor(1) },
    typical: { lo: 200, hi: 900 },
    direction: 'band',
  },
  tsh: {
    label: 'TSH',
    unit: 'mIU/L',
    aliases: ['tsh', 'thyroid stimulating hormone', 'tsh ultrasensitive', 'ultrasensitive tsh', 'us tsh', 'tsh 3rd generation', 'tsh third generation'],
    units: { 'uiu/ml': factor(1), 'miu/ml': factor(1000), 'mu/l': factor(1), 'uu/ml': factor(1) },
    typical: { lo: 0.4, hi: 4.5 },
    direction: 'band',
  },
  creatinine: {
    label: 'Creatinine',
    unit: 'mg/dL',
    aliases: ['creatinine', 'serum creatinine', 'creatinine serum'],
    units: { 'umol/l': factor(1 / 88.4) },
    typical: { male: { lo: 0.7, hi: 1.3 }, female: { lo: 0.6, hi: 1.1 } },
    direction: 'band',
  },
  alt: {
    label: 'ALT',
    unit: 'U/L',
    aliases: ['alt', 'sgpt', 'alt sgpt', 'sgpt alt', 'alanine aminotransferase', 'alanine transaminase'],
    units: { 'iu/l': factor(1) },
    typical: { lo: 7, hi: 56 },
    direction: 'lower',
  },
  uric_acid: {
    label: 'Uric acid',
    unit: 'mg/dL',
    aliases: ['uric acid', 'serum uric acid', 'urate'],
    units: { 'umol/l': factor(1 / 59.48) },
    typical: { male: { lo: 3.4, hi: 7 }, female: { lo: 2.4, hi: 6 } },
    direction: 'band',
  },
  systolic: {
    label: 'Systolic blood pressure',
    unit: 'mmHg',
    aliases: ['systolic', 'systolic blood pressure', 'systolic bp', 'sbp'],
    units: {},
    typical: { lo: 90, hi: 120 },
    direction: 'band',
  },
  diastolic: {
    label: 'Diastolic blood pressure',
    unit: 'mmHg',
    aliases: ['diastolic', 'diastolic blood pressure', 'diastolic bp', 'dbp'],
    units: {},
    typical: { lo: 60, hi: 80 },
    direction: 'band',
  },
} as const satisfies Record<string, Analyte>;

export type AnalyteKey = keyof typeof ANALYTES;
export const ANALYTE_KEYS = Object.keys(ANALYTES) as AnalyteKey[];
export const isAnalyteKey = (k: unknown): k is AnalyteKey =>
  typeof k === 'string' && Object.hasOwn(ANALYTES, k);
/** `vitals_readings.metric` prefix for analytes we don't recognise. */
export const LAB_PREFIX = 'lab:';

/** Lower case, µ → u, no spaces: "µIU/mL" → "uiu/ml". */
export function unitKey(unit: string | null | undefined): string {
  return (unit ?? '').toLowerCase().replace(/[µμ]/g, 'u').replace(/\s+/g, '');
}

/** Lower case, letters and digits only, single spaces: "25-OH Vitamin D" → "25 oh vitamin d". */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const ALIASES = new Map<string, AnalyteKey>();
for (const key of ANALYTE_KEYS) for (const a of ANALYTES[key].aliases) ALIASES.set(a, key);

/** The forms of a printed name worth looking up: whole, without "(…)", the "(…)" alone, no "serum". */
function nameForms(name: string): string[] {
  const inside = [...name.matchAll(/\(([^)]*)\)/g)].map((m) => m[1] ?? '');
  const outside = name.replace(/\([^)]*\)/g, ' ');
  const forms = [name, outside, ...inside].map(nameKey).filter(Boolean);
  for (const f of [...forms]) {
    const bare = f.replace(/^(serum|plasma|blood|s) /, '');
    if (bare !== f) forms.push(bare);
  }
  return forms;
}

/** Converts `value` in `unit` to the analyte's canonical unit, or null when the unit doesn't fit. */
export function toCanonical(key: AnalyteKey, value: number, unit: string | null | undefined): number | null {
  const a: Analyte = ANALYTES[key];
  const u = unitKey(unit);
  if (!u || u === unitKey(a.unit)) return value;
  const conv = a.units[u];
  return conv ? conv.to(value) : null;
}

/** A canonical value shown in `unit` (one the analyte converts from), or null. */
export function fromCanonical(key: AnalyteKey, value: number, unit: string | null | undefined): number | null {
  const a: Analyte = ANALYTES[key];
  const u = unitKey(unit);
  if (!u || u === unitKey(a.unit)) return value;
  const conv = a.units[u];
  return conv ? conv.from(value) : null;
}

/**
 * Which analyte a printed result is, if one we know. The aliases decide first; the model's guess
 * only counts when the names didn't match anything and its unit converts.
 */
export function recogniseAnalyte(
  names: readonly (string | null | undefined)[],
  unit: string | null | undefined,
  hint?: string | null,
): AnalyteKey | null {
  for (const n of names) {
    if (!n) continue;
    for (const form of nameForms(n)) {
      const key = ALIASES.get(form);
      if (key && toCanonical(key, 1, unit) != null) return key;
    }
  }
  if (isAnalyteKey(hint) && toCanonical(hint, 1, unit) != null) return hint;
  return null;
}

/** The typical range for an analyte; without a sex, the span covering both. */
export function typicalRange(key: AnalyteKey, sex?: Sex | null): Range {
  const t: Analyte['typical'] = ANALYTES[key].typical;
  if (!('male' in t)) return t;
  if (sex) return t[sex];
  const lo = t.male.lo != null && t.female.lo != null ? Math.min(t.male.lo, t.female.lo) : null;
  const hi = t.male.hi != null && t.female.hi != null ? Math.max(t.male.hi, t.female.hi) : null;
  return { lo, hi };
}

// ── Parsing what's printed ──────────────────────────────────────────────────────

export type Qualifier = '<' | '>';
export type ParsedValue = { value: number; qualifier: Qualifier | null };

const NUMBER = String.raw`\d+(?:[.,]\d+)*`;

/** "1,250" → 1250; "5,6" → 5.6 (a decimal comma); "4.42" → 4.42. */
function toNumber(text: string): number | null {
  let t = text;
  if (t.includes(',') && t.includes('.')) t = t.replace(/,/g, '');
  else if (/^\d{1,3}(,\d{3})+$/.test(t)) t = t.replace(/,/g, '');
  else t = t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * A printed result as a number: "12.6", "<0.5", "≥ 90", "5.6 H", "1,250". Text results
 * ("Negative", "Reactive") and ranges ("2-3") aren't numbers and return null.
 */
export function parseValue(text: string | null | undefined): ParsedValue | null {
  if (!text) return null;
  const t = text
    .trim()
    .replace(/[*]+$/, '')
    .replace(/(\d)\s*\(?(?:H|L|HIGH|LOW|High|Low)\)?$/, '$1')
    .trim();
  const m = new RegExp(String.raw`^(<=?|>=?|≤|≥|less than|more than|below|above|up to)?\s*(${NUMBER})$`, 'i').exec(t);
  if (!m) return null;
  const value = toNumber(m[2]!);
  if (value == null) return null;
  const q = m[1]?.toLowerCase();
  const qualifier: Qualifier | null = !q
    ? null
    : q.startsWith('<') || q === '≤' || q === 'less than' || q === 'below' || q === 'up to'
      ? '<'
      : '>';
  return { value, qualifier };
}

/** Blood pressure printed as one result: "120/80". */
export function parsePressure(text: string | null | undefined): { systolic: number; diastolic: number } | null {
  const m = /^\s*(\d{2,3})\s*\/\s*(\d{2,3})\s*(mm ?hg)?\s*$/i.exec(text ?? '');
  if (!m) return null;
  return { systolic: Number(m[1]), diastolic: Number(m[2]) };
}

const SEX_LABEL: Record<Sex, RegExp> = {
  male: /^\s*(m|male|males|men)\b\s*[:\-]?/i,
  female: /^\s*(f|female|females|women)\b\s*[:\-]?/i,
};

/**
 * A printed reference range: "13.0 - 17.0", "< 5.0", "> 90", "Up to 40", "Desirable: <200;
 * Borderline: 200-239" (the first tier), "M: 13-17 F: 12-15.5" (the user's sex, when known).
 */
export function parseRange(text: string | null | undefined, sex?: Sex | null): Range | null {
  if (!text) return null;
  const segments = text
    .split(/[;\n]|,(?=\s*[A-Za-z])|\s(?=(?:M|F|Male|Female|Men|Women)\s*[:\-])/)
    .map((s) => s.trim())
    .filter((s) => /\d/.test(s));
  if (segments.length === 0) return null;
  const own = sex ? segments.find((s) => SEX_LABEL[sex].test(s)) : undefined;
  const segment = (own ?? segments[0]!).replace(SEX_LABEL.male, '').replace(SEX_LABEL.female, '');

  const between = new RegExp(String.raw`(${NUMBER})\s*(?:-|–|—|to)\s*(${NUMBER})`, 'i').exec(segment);
  if (between) {
    const lo = toNumber(between[1]!);
    const hi = toNumber(between[2]!);
    if (lo != null && hi != null && lo <= hi) return { lo, hi };
  }
  const upper = new RegExp(String.raw`(<=?|≤|up ?to|less than|below|under)\s*(${NUMBER})`, 'i').exec(segment);
  if (upper) return { lo: null, hi: toNumber(upper[2]!) };
  const lower = new RegExp(String.raw`(>=?|≥|more than|above|over|at least)\s*(${NUMBER})`, 'i').exec(segment);
  if (lower) return { lo: toNumber(lower[2]!), hi: null };
  return null;
}

// ── Scrubbing ───────────────────────────────────────────────────────────────────

/** Lines that name or identify the person (or their doctor) are dropped whole. */
const PII_LINE =
  /\b(patient|name|location|address|lab ?(id|no)|uhid|mrn|reg(istration)? ?no|sample ?id|barcode|mobile|phone|tel|e-?mail|ref(\.|erred)? ?by|referring|consultant|pathologist|doctor|age ?\/ ?sex|dob|date of birth)\b|\bdr\b\.?/i;
const PII_TOKENS: RegExp[] = [
  /[^\s@]+@[^\s@]+\.[^\s@]+/g, // email
  /\+\d{1,3}[\s-]?\d{4,5}[\s-]?\d{5}\b/g, // +91 98200 12345
  /\b\d{5} \d{5}\b/g, // 98200 12345
  /\b\d{8,}\b/g, // long ID numbers (no result is printed with 8+ bare digits)
  /\b(?=[A-Z0-9-]*[A-Z])(?=[A-Z0-9-]*-)[A-Z0-9-]*\d{4,}[A-Z0-9-]*\b/gi, // MC-261016-10487
];

function scrubTokens(text: string): string {
  return PII_TOKENS.reduce((t, re) => t.replace(re, ''), text);
}

/** A page's text with identifying lines and tokens removed, before it leaves the phone. */
export function scrubReportText(text: string): string {
  return text
    .split('\n')
    .filter((line) => !PII_LINE.test(line))
    .map(scrubTokens)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** One extracted field: identifying tokens removed; a field that is itself a label → null. */
export function scrubField(text: string | null | undefined, max = 80): string | null {
  if (text == null) return null;
  if (PII_LINE.test(text)) return null;
  const t = scrubTokens(text).replace(/\s+/g, ' ').trim().slice(0, max);
  return t || null;
}

/** Whether a page's text layer is worth sending instead of images. */
export function usableTextLayer(text: string): boolean {
  const chars = text.replace(/\s/g, '');
  if (chars.length < 120 || !/\d/.test(chars)) return false;
  const junk = (text.match(/�|[\u0000-\u0008\u000E-\u001F]/g)?.length ?? 0) + 5 * (text.match(/\(cid:\d+\)/g)?.length ?? 0);
  return junk / chars.length < 0.02;
}

/** Whether a text page has anything like a result (a name followed by a number on one line). */
export function hasResults(text: string): boolean {
  return text.split('\n').some((line) => /[A-Za-z]{2,}.*?\s\d/.test(line) && !/^\s*page\s+\d+(\s+of\s+\d+)?\s*$/i.test(line));
}

// ── Page result (the job's answer) ──────────────────────────────────────────────

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => !Number.isNaN(Date.parse(`${d}T12:00:00Z`)));
const text = (max: number) => z.string().trim().max(max);

/** What the model returns for one page. Lenient: a bad field becomes null, not a failed page. */
export const reportPageAiSchema = z.object({
  isReport: z.boolean(),
  language: text(12).nullish().catch(null),
  reportDate: isoDate.nullish().catch(null),
  entries: z
    .array(
      z.object({
        name: text(120),
        rawName: text(120).nullish().catch(null),
        key: z.string().nullish().catch(null),
        valueText: z.coerce.string().trim().max(40),
        unit: text(40).nullish().catch(null),
        refText: text(160).nullish().catch(null),
        flag: z.enum(['H', 'L']).nullish().catch(null),
        date: isoDate.nullish().catch(null),
        confidence: z.coerce.number().min(0).max(1).catch(0.5),
      }),
    )
    .max(200),
});
export type ReportPageAi = z.infer<typeof reportPageAiSchema>;

export const reportEntrySchema = z.object({
  /** English name as the model gave it; `rawName` as printed. */
  name: z.string().min(1).max(80),
  rawName: z.string().max(80).nullable(),
  key: z.string().nullable(),
  value: z.number(),
  qualifier: z.enum(['<', '>']).nullable(),
  valueText: z.string().max(40),
  unit: z.string().max(24).nullable(),
  refText: z.string().max(80).nullable(),
  flag: z.enum(['H', 'L']).nullable(),
  date: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});
export type ReportEntry = z.infer<typeof reportEntrySchema>;

export const reportPageSchema = z.object({
  isReport: z.boolean(),
  language: z.string().nullable(),
  reportDate: z.string().nullable(),
  entries: z.array(reportEntrySchema),
});
export type ReportPage = z.infer<typeof reportPageSchema>;

/**
 * The model's page made safe to keep: identifying text scrubbed, results without a number
 * dropped, blood pressure split, known keys checked. Run on the server and again on the phone.
 */
export function tidyPage(ai: ReportPageAi): ReportPage {
  const entries: ReportEntry[] = [];
  for (const e of ai.entries) {
    const name = scrubField(e.name);
    if (!name) continue;
    const common = {
      rawName: scrubField(e.rawName),
      unit: scrubField(e.unit, 24),
      refText: scrubField(e.refText),
      flag: e.flag ?? null,
      date: e.date ?? null,
      confidence: round(e.confidence, 2),
    };
    const pressure = /blood pressure|\bbp\b/i.test(`${e.name} ${e.rawName ?? ''}`) ? parsePressure(e.valueText) : null;
    if (pressure) {
      for (const key of ['systolic', 'diastolic'] as const) {
        const v = pressure[key];
        entries.push({ ...common, name: ANALYTES[key].label, key, value: v, qualifier: null, valueText: String(v), unit: 'mmHg', refText: null });
      }
      continue;
    }
    const parsed = parseValue(e.valueText);
    if (!parsed) continue;
    entries.push({
      ...common,
      name,
      key: isAnalyteKey(e.key) ? e.key : null,
      value: parsed.value,
      qualifier: parsed.qualifier,
      valueText: e.valueText.slice(0, 40),
    });
  }
  return {
    isReport: ai.isReport && entries.length > 0,
    language: ai.language ?? null,
    reportDate: ai.reportDate ?? null,
    entries,
  };
}

// ── Merging a report's pages ────────────────────────────────────────────────────

/** One value of a report, normalised: what the confirm step shows and a reading stores. */
export type ReportValue = {
  /** `metric|date|value`: the same result read twice (tile overlap, two pages) shares it. */
  id: string;
  /** A recognised key, or `lab:<slug>`. */
  metric: string;
  label: string;
  /** As printed, when it differs from the label (another language, an abbreviation). */
  rawName: string | null;
  /** In the canonical unit for recognised analytes, else as printed. */
  value: number;
  unit: string | null;
  qualifier: Qualifier | null;
  /** The report's own range, in the same unit as `value`. */
  refLo: number | null;
  refHi: number | null;
  refText: string | null;
  /** The value and unit exactly as printed. */
  raw: string;
  flag: 'H' | 'L' | null;
  /** YYYY-MM-DD, or null when the report has no date anywhere (the confirm step asks). */
  date: string | null;
  confidence: number;
  /** Another value for the same test and date was read; the user picks. */
  conflict: boolean;
  /** Counted when confirmed; conflicts default to the surest reading. */
  include: boolean;
};

export type MergedReport = {
  /** The most common collection date. */
  reportDate: string | null;
  /** Every date with values, newest first (a cumulative report has several). */
  dates: string[];
  values: ReportValue[];
};

/** Below this the confirm step marks a value to check. */
export const CHECK_CONFIDENCE = 0.6;

const slug = (name: string) => nameKey(name).replace(/ /g, '_').slice(0, 40) || 'result';

export function labLabel(metric: string, label: string): string {
  return isAnalyteKey(metric) ? ANALYTES[metric].label : label;
}

function normalise(e: ReportEntry, date: string | null, sex: Sex | null | undefined): ReportValue {
  const key = recogniseAnalyte([e.rawName, e.name], e.unit, e.key);
  const range = parseRange(e.refText, sex);
  const raw = [e.valueText, e.unit].filter(Boolean).join(' ');
  const convert = (v: number | null) => (v == null || !key ? v : toCanonical(key, v, e.unit));
  const value = convert(e.value) ?? e.value;
  const metric = key ?? `${LAB_PREFIX}${slug(e.name)}`;
  const label = key ? ANALYTES[key].label : e.name;
  const shown = (v: number | null) => (v == null ? null : round(v, 4));
  return {
    id: `${metric}|${date ?? ''}|${shown(value)}`,
    metric,
    label,
    rawName: e.rawName && nameKey(e.rawName) !== nameKey(label) ? e.rawName : null,
    value: shown(value)!,
    unit: key ? ANALYTES[key].unit : e.unit,
    qualifier: e.qualifier,
    refLo: shown(convert(range?.lo ?? null)),
    refHi: shown(convert(range?.hi ?? null)),
    refText: e.refText,
    raw,
    flag: e.flag,
    date,
    confidence: e.confidence,
    conflict: false,
    include: true,
  };
}

function mostCommon(values: readonly string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  for (const [v, n] of counts) if (best == null || n > counts.get(best)! || (n === counts.get(best) && v > best)) best = v;
  return best;
}

/**
 * Every page's values as one report: undated values take the report's date, the same result read
 * twice is kept once (the surer reading), and two different values for one test on one date are
 * both kept as a conflict for the user to pick. Order stays as printed.
 */
export function mergeReport(pages: readonly ReportPage[], sex?: Sex | null): MergedReport {
  const all = pages.flatMap((p) => p.entries.map((e) => ({ e, pageDate: p.reportDate })));
  const reportDate = mostCommon([
    ...pages.map((p) => p.reportDate).filter((d): d is string => d != null),
    ...all.map((x) => x.e.date).filter((d): d is string => d != null),
  ]);
  const byId = new Map<string, ReportValue>();
  for (const { e, pageDate } of all) {
    const v = normalise(e, e.date ?? pageDate ?? reportDate, sex);
    const seen = byId.get(v.id);
    if (!seen || v.confidence > seen.confidence) byId.set(v.id, v);
  }
  const values = [...byId.values()];
  // Same test, same date, different values: keep both, count the surer one by default.
  const groups = new Map<string, ReportValue[]>();
  for (const v of values) {
    const k = `${v.metric}|${v.date ?? ''}`;
    groups.set(k, [...(groups.get(k) ?? []), v]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const best = group.reduce((a, b) => (b.confidence > a.confidence ? b : a));
    for (const v of group) {
      v.conflict = true;
      v.include = v === best;
    }
  }
  const dates = [...new Set(values.map((v) => v.date).filter((d): d is string => d != null))].sort().reverse();
  return { reportDate, dates, values };
}

// ── Words ───────────────────────────────────────────────────────────────────────

export type RangeSource = 'lab' | 'typical';
export type ShownRange = Range & { source: RangeSource };
export type RangeState = 'inside' | 'below' | 'above';

/** The report's own range when it printed one, else the typical range of a recognised analyte. */
export function rangeFor(
  v: Pick<ReportValue, 'metric' | 'refLo' | 'refHi'>,
  sex?: Sex | null,
): ShownRange | null {
  if (v.refLo != null || v.refHi != null) return { lo: v.refLo, hi: v.refHi, source: 'lab' };
  if (!isAnalyteKey(v.metric)) return null;
  const t = typicalRange(v.metric, sex);
  return t.lo == null && t.hi == null ? null : { ...t, source: 'typical' };
}

/** Up to 2 decimals, no trailing zeros: 13.0 → "13", 0.456 → "0.46". */
export function formatLabNumber(n: number): string {
  const abs = Math.abs(n);
  return String(round(n, abs >= 100 ? 0 : abs >= 10 ? 1 : 2));
}

const withUnit = (n: string, unit: string | null) => (unit ? `${n} ${unit}` : n);

/**
 * Where a value sits against the range the slider shows, in words that name it: "Above the lab's
 * range of 13–17 g/dL", "Under the typical limit of 100 mg/dL", "Below 0.5, the lowest this test
 * reads". Never diagnostic. Null without a range (and no qualifier to speak of).
 */
export function rangeWords(
  value: number,
  qualifier: Qualifier | null,
  range: ShownRange | null,
  unit: string | null,
): { state: RangeState | null; words: string } | null {
  const whose = range?.source === 'lab' ? "the lab's" : 'the typical';
  const n = (x: number) => formatLabNumber(x);
  const lo = range?.lo ?? null;
  const hi = range?.hi ?? null;

  let state: RangeState | null = null;
  if (range) {
    if (lo != null && (qualifier === '<' ? value <= lo : value < lo)) state = 'below';
    else if (hi != null && (qualifier === '>' ? value >= hi : value > hi)) state = 'above';
    else if (qualifier === '<' && lo != null && value > lo) state = null; // "<5" against 1–10: can't tell
    else if (qualifier === '>' && hi != null && value < hi) state = null;
    else state = 'inside';
  }

  // A result past what the test can read, with nothing to compare it with.
  if (qualifier && state == null) {
    const limit = withUnit(n(value), unit);
    return {
      state: null,
      words: qualifier === '<' ? `Below ${limit}, the lowest this test reads` : `Above ${limit}, the highest this test reads`,
    };
  }
  if (!range || state == null) return null;

  if (lo != null && hi != null) {
    const span = withUnit(`${n(lo)}–${n(hi)}`, unit);
    const where = state === 'inside' ? 'Within' : state === 'below' ? 'Below' : 'Above';
    return { state, words: `${where} ${whose} range of ${span}` };
  }
  if (hi != null) {
    const limit = withUnit(n(hi), unit);
    return { state, words: state === 'above' ? `Above ${whose} limit of ${limit}` : `Under ${whose} limit of ${limit}` };
  }
  const min = withUnit(n(lo!), unit);
  return { state, words: state === 'below' ? `Below ${whose} minimum of ${min}` : `Above ${whose} minimum of ${min}` };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "in March", "on 3 Oct" (same month), "in March 2025" (another year), relative to `now`. */
export function whenWords(date: string, now: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [ny, nm] = now.split('-').map(Number) as [number, number];
  if (y === ny && m === nm) return `on ${d} ${MONTHS[m - 1]!.slice(0, 3)}`;
  return y === ny ? `in ${MONTHS[m - 1]}` : `in ${MONTHS[m - 1]} ${y}`;
}

/**
 * How a value moved since the previous report: "down from 162 in March", "the same as in March".
 * Values are in the same unit; within 1 % counts as the same.
 */
export function trendWords(
  current: { value: number; date: string },
  previous: { value: number; date: string } | null,
): string | null {
  if (!previous) return null;
  const when = whenWords(previous.date, current.date);
  const same = Math.abs(current.value - previous.value) <= Math.abs(previous.value) * 0.01;
  if (same) return `the same as ${when}`;
  return `${current.value > previous.value ? 'up' : 'down'} from ${formatLabNumber(previous.value)} ${when}`;
}

/** The row's one line: range words, then the trend ("Above the lab's limit of 100 mg/dL, down from 162 in March"). */
export function labLine(range: string | null, trend: string | null): string | null {
  if (range && trend) return `${range}, ${trend}`;
  if (range) return range;
  return trend ? trend[0]!.toUpperCase() + trend.slice(1) : null;
}
