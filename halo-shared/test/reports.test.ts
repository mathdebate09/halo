import { describe, expect, it } from 'vitest';

import {
  ANALYTE_KEYS,
  ANALYTES,
  fromCanonical,
  hasResults,
  labLine,
  mergeReport,
  nameKey,
  parsePressure,
  parseRange,
  parseValue,
  printedView,
  rangeFor,
  rangeWords,
  recogniseAnalyte,
  type ReportEntry,
  reportPageAiSchema,
  reportPageBodySchema,
  type ReportPage,
  scrubField,
  scrubReportText,
  tidyPage,
  toCanonical,
  trendWords,
  typicalRange,
  usableTextLayer,
  whenWords,
} from '../src/reports';

const ID = '7f2c1d9e-4b3a-4c8e-9d1f-2a6b5c4d3e2f';

const entry = (over: Partial<ReportEntry> & Pick<ReportEntry, 'name' | 'value'>): ReportEntry => ({
  rawName: null,
  key: null,
  qualifier: null,
  valueText: String(over.value),
  unit: null,
  refText: null,
  flag: null,
  date: null,
  confidence: 0.95,
  ...over,
});
const page = (entries: ReportEntry[], reportDate: string | null = '2026-10-16'): ReportPage => ({
  isReport: true,
  language: 'en',
  reportDate,
  entries,
});

describe('units', () => {
  it('converts every printed unit to the canonical one and back', () => {
    for (const key of ANALYTE_KEYS) {
      for (const unit of Object.keys(ANALYTES[key].units)) {
        const canonical = toCanonical(key, 7.3, unit)!;
        expect(fromCanonical(key, canonical, unit)).toBeCloseTo(7.3, 6);
      }
      expect(toCanonical(key, 5, ANALYTES[key].unit)).toBe(5);
    }
  });

  it('uses the usual factors', () => {
    expect(toCanonical('glucose_fasting', 5, 'mmol/L')).toBeCloseTo(90.1, 1);
    expect(toCanonical('ldl', 2.6, 'mmol/L')).toBeCloseTo(100.5, 1);
    expect(toCanonical('triglycerides', 1.7, 'mmol/L')).toBeCloseTo(150.6, 1);
    expect(toCanonical('hba1c', 48, 'mmol/mol')).toBeCloseTo(6.54, 2);
    expect(toCanonical('vitamin_d', 75, 'nmol/L')).toBeCloseTo(30, 0);
    expect(toCanonical('b12', 300, 'pmol/L')).toBeCloseTo(406.5, 1);
    expect(toCanonical('haemoglobin', 150, 'g/L')).toBeCloseTo(15, 6);
    expect(toCanonical('creatinine', 80, 'µmol/L')).toBeCloseTo(0.905, 3);
    expect(toCanonical('tsh', 2.05, 'µIU/mL')).toBe(2.05);
    expect(toCanonical('tsh', 2.05, 'uIU/mL')).toBe(2.05);
  });

  it("rejects a unit the analyte isn't printed in", () => {
    expect(toCanonical('ldl', 3, 'g/L')).toBeNull();
    expect(toCanonical('tsh', 3, 'ng/dL')).toBeNull();
  });

  it('gives the span of both sexes when the sex is unknown', () => {
    expect(typicalRange('haemoglobin', 'female')).toEqual({ lo: 12, hi: 15.5 });
    expect(typicalRange('haemoglobin')).toEqual({ lo: 12, hi: 17 });
    expect(typicalRange('hdl')).toEqual({ lo: 40, hi: null });
  });
});

describe('recogniseAnalyte', () => {
  it('matches printed names however they are written', () => {
    expect(nameKey('25-OH Vitamin D')).toBe('25 oh vitamin d');
    expect(recogniseAnalyte(['25-OH Vitamin D'], 'ng/mL')).toBe('vitamin_d');
    expect(recogniseAnalyte(['ALT (SGPT)'], 'U/L')).toBe('alt');
    expect(recogniseAnalyte(['SGPT'], 'IU/L')).toBe('alt');
    expect(recogniseAnalyte(['  HDL   Cholesterol '], 'mg/dL')).toBe('hdl');
    expect(recogniseAnalyte(['Serum Ferritin'], 'ng/mL')).toBe('ferritin');
    expect(recogniseAnalyte(['Glycated Hæmoglobin'.replace('æ', 'ae')], '%')).toBe('hba1c');
    expect(recogniseAnalyte(['Fasting Plasma Glucose'], 'mg/dL')).toBe('glucose_fasting');
    expect(recogniseAnalyte(['Random Plasma Glucose'], 'mg/dL')).toBe('glucose_random');
  });

  it('keeps look-alikes apart', () => {
    expect(recogniseAnalyte(['HbA1c'], '%')).toBe('hba1c');
    expect(recogniseAnalyte(['Hemoglobin'], 'g/dL')).toBe('haemoglobin');
    expect(recogniseAnalyte(['Non-HDL Cholesterol'], 'mg/dL')).toBeNull();
    expect(recogniseAnalyte(['MCHC'], 'g/dL')).toBeNull();
    expect(recogniseAnalyte(['AST (SGOT)'], 'U/L')).toBeNull();
  });

  it("takes the model's key only when the names didn't match and the unit fits", () => {
    // A non-English name the model mapped (rawName as printed, name in English).
    expect(recogniseAnalyte(['Colesterol LDL', 'LDL cholesterol'], 'mg/dL')).toBe('ldl');
    expect(recogniseAnalyte(['Hämoglobin A'], 'mmol/mol', 'hba1c')).toBe('hba1c');
    expect(recogniseAnalyte(['Something'], 'cells/uL', 'hba1c')).toBeNull();
    expect(recogniseAnalyte(['Something'], 'mg/dL', 'not_a_key')).toBeNull();
  });

  it('ignores an alias whose unit does not fit', () => {
    expect(recogniseAnalyte(['Glucose'], 'mg/24h')).toBeNull();
  });
});

describe('parseValue', () => {
  it('reads numbers, qualifiers, flags and separators', () => {
    expect(parseValue('12.6')).toEqual({ value: 12.6, qualifier: null });
    expect(parseValue('<0.5')).toEqual({ value: 0.5, qualifier: '<' });
    expect(parseValue('< 0.5')).toEqual({ value: 0.5, qualifier: '<' });
    expect(parseValue('≥ 90')).toEqual({ value: 90, qualifier: '>' });
    expect(parseValue('>=2000')).toEqual({ value: 2000, qualifier: '>' });
    expect(parseValue('5.6 H')).toEqual({ value: 5.6, qualifier: null });
    expect(parseValue('5.6H')).toEqual({ value: 5.6, qualifier: null });
    expect(parseValue('3.7 (L)')).toEqual({ value: 3.7, qualifier: null });
    expect(parseValue('118*')).toEqual({ value: 118, qualifier: null });
    expect(parseValue('1,250')).toEqual({ value: 1250, qualifier: null });
    expect(parseValue('5,6')).toEqual({ value: 5.6, qualifier: null });
  });

  it('returns null for text results and ranges', () => {
    for (const t of ['Negative', 'Reactive', 'Nil', '2-3', '', null, 'See note']) expect(parseValue(t)).toBeNull();
  });

  it('splits blood pressure', () => {
    expect(parsePressure('120/80 mmHg')).toEqual({ systolic: 120, diastolic: 80 });
    expect(parsePressure('120')).toBeNull();
  });
});

describe('parseRange', () => {
  it('reads the common forms', () => {
    expect(parseRange('13.0 - 17.0')).toEqual({ lo: 13, hi: 17 });
    expect(parseRange('1-6')).toEqual({ lo: 1, hi: 6 });
    expect(parseRange('0.4 to 4.5')).toEqual({ lo: 0.4, hi: 4.5 });
    expect(parseRange('4.0 - 11.0 x10^3/uL')).toEqual({ lo: 4, hi: 11 });
    expect(parseRange('< 5.0')).toEqual({ lo: null, hi: 5 });
    expect(parseRange('Up to 40')).toEqual({ lo: null, hi: 40 });
    expect(parseRange('> 90')).toEqual({ lo: 90, hi: null });
    expect(parseRange('>= 40')).toEqual({ lo: 40, hi: null });
  });

  it('takes the first tier of a tiered range', () => {
    expect(parseRange('Desirable: <200; Borderline: 200-239; High: >=240')).toEqual({ lo: null, hi: 200 });
    expect(parseRange('Optimal <100, Near optimal 100-129')).toEqual({ lo: null, hi: 100 });
  });

  it("picks the user's sex when the range has both", () => {
    expect(parseRange('M: 13-17 F: 12-15.5', 'female')).toEqual({ lo: 12, hi: 15.5 });
    expect(parseRange('Male: 13-17; Female: 12-15.5', 'male')).toEqual({ lo: 13, hi: 17 });
    expect(parseRange('M: 13-17 F: 12-15.5')).toEqual({ lo: 13, hi: 17 });
  });

  it('returns null without numbers', () => {
    expect(parseRange('Negative')).toBeNull();
    expect(parseRange(null)).toBeNull();
  });
});

describe('scrubbing', () => {
  const header = [
    '  METROCARE DIAGNOSTICS',
    '  Clinical Pathology & Biochemistry                     MC-261016-10487',
    '  Patient            Jay Singh               Age / Sex       21 Years / Male',
    '  Location           Thane, Maharashtra      Height / Weight 183 cm / 74 kg',
    '  Lab ID             MC-261016-10487         Reported        16 Oct 2026, 14:20',
    '  Specimen           EDTA Whole Blood        Collected       16 Oct 2026, 10:42',
    '  Hemoglobin                12.6     g/dL     13.0 - 17.0    L',
    '  Platelet Count            264000   /cumm    150000 - 450000',
    '  Contact: lab@metrocare.example, +91 98200 12345, UHID 123456789',
    '  Dr. A. Mehta                          Report status: Final',
  ].join('\n');

  it('drops identifying lines and tokens but keeps results and the collection date', () => {
    const out = scrubReportText(header);
    expect(out).not.toMatch(/Jay|Singh|Thane|MC-261016|Mehta|metrocare\.example|98200|123456789/);
    expect(out).toContain('Collected       16 Oct 2026, 10:42');
    expect(out).toContain('12.6     g/dL     13.0 - 17.0');
    expect(out).toContain('264000   /cumm    150000 - 450000');
  });

  it('scrubs single fields', () => {
    expect(scrubField('Patient: Jay Singh')).toBeNull();
    expect(scrubField('Hemoglobin  ')).toBe('Hemoglobin');
    expect(scrubField('Ref MC-261016-10487')).toBe('Ref');
    expect(scrubField('x10^3/uL', 24)).toBe('x10^3/uL');
    expect(scrubField('mL/min/1.73m2', 24)).toBe('mL/min/1.73m2');
  });

  it('tells a usable text layer from junk', () => {
    const table = Array.from({ length: 8 }, (_, i) => `Test ${i}     ${10 + i}.5   mg/dL   5 - 20`).join('\n');
    expect(usableTextLayer(table)).toBe(true);
    expect(usableTextLayer('Page 1')).toBe(false);
    expect(usableTextLayer(table.replace(/e/g, '(cid:12)'))).toBe(false);
    expect(usableTextLayer('x'.repeat(200))).toBe(false); // no digits
  });

  it('finds whether a text page has results', () => {
    expect(hasResults('  Hemoglobin   12.6  g/dL')).toBe(true);
    expect(hasResults('Laboratory comment\nAll values within limits.\nPage 3')).toBe(false);
  });
});

describe('page schemas', () => {
  it('accepts text or tiles, not both', () => {
    const ok = { key: `${ID}:p1`, page: 1, of: 2, text: 'Hemoglobin 12.6' };
    expect(reportPageBodySchema.safeParse(ok).success).toBe(true);
    expect(reportPageBodySchema.safeParse({ ...ok, tiles: ['A'.repeat(200)] }).success).toBe(false);
    expect(reportPageBodySchema.safeParse({ key: ok.key, page: 1, of: 2 }).success).toBe(false);
    expect(reportPageBodySchema.safeParse({ ...ok, key: 'abc' }).success).toBe(false);
    expect(reportPageBodySchema.safeParse({ ...ok, page: 3 }).success).toBe(false);
    expect(reportPageBodySchema.safeParse({ ...ok, text: 'x'.repeat(20_001) }).success).toBe(false);
    const { text: _t, ...noText } = ok;
    expect(reportPageBodySchema.safeParse({ ...noText, tiles: ['A'.repeat(200), 'B'.repeat(200), 'C'.repeat(200)] }).success).toBe(false);
  });

  it("turns a bad field into null instead of failing the page", () => {
    const parsed = reportPageAiSchema.parse({
      isReport: true,
      language: 'en',
      reportDate: '16 Oct 2026',
      entries: [{ name: 'LDL', valueText: 94, unit: 'mg/dL', flag: 'HIGH', date: 'yesterday', confidence: 'x' }],
    });
    expect(parsed.reportDate).toBeNull();
    expect(parsed.entries[0]).toMatchObject({ valueText: '94', flag: null, date: null, confidence: 0.5 });
  });
});

describe('tidyPage', () => {
  it('drops results without a number, scrubs text and splits blood pressure', () => {
    const page = tidyPage(
      reportPageAiSchema.parse({
        isReport: true,
        language: 'en',
        reportDate: '2026-10-16',
        entries: [
          { name: 'Hemoglobin', rawName: 'Hemoglobin', key: 'haemoglobin', valueText: '12.6', unit: 'g/dL', refText: '13.0 - 17.0', flag: 'L', confidence: 0.95 },
          { name: 'HIV', valueText: 'Non-reactive', confidence: 0.9 },
          { name: 'Patient name', valueText: '21', confidence: 0.9 },
          { name: 'Blood pressure', valueText: '128/84', unit: 'mmHg', confidence: 0.9 },
          { name: 'CRP', key: 'made_up', valueText: '<0.5', unit: 'mg/L', refText: 'Lab MC-261016-10487 < 5.0', confidence: 0.9 },
        ],
      }),
    );
    expect(page.entries.map((e) => e.name)).toEqual(['Hemoglobin', 'Systolic blood pressure', 'Diastolic blood pressure', 'CRP']);
    expect(page.entries[1]).toMatchObject({ key: 'systolic', value: 128 });
    expect(page.entries[2]).toMatchObject({ key: 'diastolic', value: 84 });
    expect(page.entries[3]).toMatchObject({ key: null, value: 0.5, qualifier: '<', refText: 'Lab < 5.0' });
  });

  it('is not a report when nothing numeric is left', () => {
    const page = tidyPage({ isReport: true, language: 'en', reportDate: null, entries: [{ name: 'Comment', rawName: null, key: null, valueText: 'Normal', unit: null, refText: null, flag: null, date: null, confidence: 1 }] });
    expect(page.isReport).toBe(false);
  });
});

describe('mergeReport', () => {
  it('normalises recognised analytes and keeps the rest generic', () => {
    const { values, reportDate, dates } = mergeReport([
      page([
        entry({ name: 'LDL Cholesterol', value: 2.6, unit: 'mmol/L', refText: '< 3.0', valueText: '2.6' }),
        entry({ name: 'eGFR', value: 118, unit: 'mL/min/1.73m2', refText: '> 90' }),
      ]),
    ]);
    expect(reportDate).toBe('2026-10-16');
    expect(dates).toEqual(['2026-10-16']);
    const [ldl, egfr] = values;
    expect(ldl).toMatchObject({ metric: 'ldl', label: 'LDL cholesterol', unit: 'mg/dL', raw: '2.6 mmol/L', refLo: null });
    expect(ldl!.value).toBeCloseTo(100.5, 1);
    expect(ldl!.refHi).toBeCloseTo(116, 0);
    expect(egfr).toMatchObject({ metric: 'lab:egfr', label: 'eGFR', unit: 'mL/min/1.73m2', value: 118, refLo: 90, refHi: null });
  });

  it('gives an unrecognised test the same key however the model words it', () => {
    const metric = (name: string) => mergeReport([page([entry({ name, value: 24, unit: 'U/L' })])]).values[0]!.metric;
    expect(metric('AST (SGOT)')).toBe('lab:ast');
    expect(metric('AST')).toBe('lab:ast');
    expect(metric('C-Reactive Protein (CRP)')).toBe(metric('C-reactive protein'));
    expect(metric('RBC Count')).toBe(metric('RBC count'));
    expect(metric('(CRP)')).toBe('lab:crp');
  });

  it('keeps a result read twice (tile overlap) once, the surer reading', () => {
    const { values } = mergeReport([
      page([entry({ name: 'Ferritin', value: 96, unit: 'ng/mL', confidence: 0.7 }), entry({ name: 'Ferritin', value: 96, unit: 'ng/mL', confidence: 0.9 })]),
    ]);
    expect(values).toHaveLength(1);
    expect(values[0]).toMatchObject({ confidence: 0.9, conflict: false, include: true });
  });

  it('keeps two different values for one test and date as a conflict', () => {
    const { values } = mergeReport([
      page([entry({ name: 'TSH', value: 2.05, unit: 'uIU/mL', confidence: 0.9 })]),
      page([entry({ name: 'TSH', value: 2.5, unit: 'uIU/mL', confidence: 0.6 })], null),
    ]);
    expect(values.map((v) => [v.value, v.conflict, v.include])).toEqual([
      [2.05, true, true],
      [2.5, true, false],
    ]);
  });

  it('gives undated values the report date and keeps every dated column', () => {
    const { values, dates, reportDate } = mergeReport([
      page([
        entry({ name: 'HbA1c', value: 6.1, unit: '%', date: '2026-10-16' }),
        entry({ name: 'HbA1c', value: 6.4, unit: '%', date: '2026-04-02' }),
        entry({ name: 'Creatinine', value: 0.9, unit: 'mg/dL' }),
      ], null),
      page([entry({ name: 'Uric Acid', value: 5.1, unit: 'mg/dL', date: '2026-10-16' })], '2026-10-16'),
    ]);
    expect(reportDate).toBe('2026-10-16');
    expect(dates).toEqual(['2026-10-16', '2026-04-02']);
    expect(values.find((v) => v.metric === 'creatinine')!.date).toBe('2026-10-16');
    expect(values.filter((v) => v.metric === 'hba1c').every((v) => !v.conflict)).toBe(true);
  });

  it('leaves the date empty when the report has none', () => {
    const { values, reportDate } = mergeReport([page([entry({ name: 'B12', value: 486, unit: 'pg/mL' })], null)]);
    expect(reportDate).toBeNull();
    expect(values[0]!.date).toBeNull();
  });

  it('notes the printed name only when it differs from the label', () => {
    const { values } = mergeReport([
      page([
        entry({ name: 'Haemoglobin', rawName: 'Hämoglobin', value: 14, unit: 'g/dL' }),
        entry({ name: 'Ferritin', rawName: 'Ferritin', value: 96, unit: 'ng/mL' }),
        entry({ name: 'Haemoglobin', rawName: 'Hemoglobin', value: 15, unit: 'g/dL', date: '2026-01-01' }),
        entry({ name: 'ALT', rawName: 'SGPT', value: 26, unit: 'U/L' }),
        entry({ name: 'Blood Urea Nitrogen', rawName: 'Blood Urea Nitrogen (BUN)', value: 14, unit: 'mg/dL' }),
        entry({ name: 'RBC count', rawName: 'RBC Count', value: 5, unit: 'x10^6/uL' }),
      ]),
    ]);
    expect(values.map((v) => v.rawName)).toEqual(['Hämoglobin', null, null, null, null, null]);
  });

  it("reads the user's sex from a two-sex range", () => {
    const { values } = mergeReport([page([entry({ name: 'Hemoglobin', value: 12.6, unit: 'g/dL', refText: 'M: 13-17 F: 12-15.5' })])], 'female');
    expect(values[0]).toMatchObject({ refLo: 12, refHi: 15.5 });
  });
});

describe('words', () => {
  const lab = (lo: number | null, hi: number | null) => ({ lo, hi, source: 'lab' as const });

  it('names the range it compares with', () => {
    expect(rangeWords(12.6, null, lab(13, 17), 'g/dL')).toEqual({ state: 'below', words: "Below the lab's range of 13–17 g/dL" });
    expect(rangeWords(15.1, null, lab(13, 17), 'g/dL')!.words).toBe("Within the lab's range of 13–17 g/dL");
    expect(rangeWords(38.4, null, lab(null, 5), 'mg/L')).toEqual({ state: 'above', words: "Above the lab's limit of 5 mg/L" });
    expect(rangeWords(94, null, lab(null, 100), 'mg/dL')!.words).toBe("Under the lab's limit of 100 mg/dL");
    expect(rangeWords(52, null, lab(40, null), 'mg/dL')!.words).toBe("Above the lab's minimum of 40 mg/dL");
    expect(rangeWords(35, null, lab(40, null), 'mg/dL')).toEqual({ state: 'below', words: "Below the lab's minimum of 40 mg/dL" });
    expect(rangeWords(110, null, { lo: 70, hi: 99, source: 'typical' }, 'mg/dL')!.words).toBe('Above the typical range of 70–99 mg/dL');
  });

  it('words results past what the test reads', () => {
    expect(rangeWords(0.5, '<', null, 'mg/L')).toEqual({ state: null, words: 'Below 0.5 mg/L, the lowest this test reads' });
    expect(rangeWords(0.5, '<', lab(null, 5), 'mg/L')!.state).toBe('inside');
    expect(rangeWords(1, '<', lab(1, 10), null)!.state).toBe('below');
    expect(rangeWords(5, '<', lab(1, 10), null)).toEqual({ state: null, words: 'Below 5, the lowest this test reads' });
    expect(rangeWords(2000, '>', lab(100, 1000), null)!.state).toBe('above');
  });

  it('says nothing without a range', () => {
    expect(rangeWords(5, null, null, 'U/L')).toBeNull();
  });

  it('prefers the lab range, then the typical one', () => {
    expect(rangeFor({ metric: 'ldl', refLo: null, refHi: 130 })).toEqual({ lo: null, hi: 130, source: 'lab' });
    expect(rangeFor({ metric: 'ldl', refLo: null, refHi: null })).toEqual({ lo: null, hi: 100, source: 'typical' });
    expect(rangeFor({ metric: 'hdl', refLo: null, refHi: null }, 'female')).toEqual({ lo: 50, hi: null, source: 'typical' });
    expect(rangeFor({ metric: 'lab:egfr', refLo: null, refHi: null })).toBeNull();
  });

  it('shows a value as printed, with its range and words in the printed unit', () => {
    const { values } = mergeReport([page([entry({ name: 'LDL', value: 2.6, unit: 'mmol/L', refText: '< 3.0' })])]);
    const view = printedView(values[0]!);
    expect(view.unit).toBe('mmol/L');
    expect(view.value).toBeCloseTo(2.6, 4);
    expect(view.range!.hi).toBeCloseTo(3, 4);
    expect(view.words).toEqual({ state: 'inside', words: "Under the lab's limit of 3\u00A0mmol/L" });
    // No printed range: the typical one, converted too.
    const typical = printedView({ ...values[0]!, refHi: null });
    expect(typical.range!.hi).toBeCloseTo(2.59, 2);
    expect(typical.words!.state).toBe('above');
  });

  it('says when, relative to the newer reading', () => {
    expect(whenWords('2026-03-14', '2026-10-16')).toBe('in March');
    expect(whenWords('2026-10-03', '2026-10-16')).toBe('on 3 Oct');
    expect(whenWords('2025-03-14', '2026-10-16')).toBe('in March 2025');
  });

  it('words the trend and joins it to the range', () => {
    const now = { value: 128, date: '2026-10-16' };
    expect(trendWords(now, { value: 162, date: '2026-03-14' })).toBe('down from 162 in March');
    expect(trendWords(now, { value: 110, date: '2026-03-14' })).toBe('up from 110 in March');
    expect(trendWords(now, { value: 127.5, date: '2026-03-14' })).toBe('the same as in March');
    expect(trendWords(now, null)).toBeNull();
    expect(labLine("Above the lab's limit of 100 mg/dL", 'down from 162 in March')).toBe("Above the lab's limit of 100 mg/dL, down from 162 in March");
    expect(labLine(null, 'down from 162 in March')).toBe('Down from 162 in March');
    expect(labLine(null, null)).toBeNull();
  });

  it('never words a value diagnostically', () => {
    const lines = [
      rangeWords(250, null, lab(null, 200), 'mg/dL')!.words,
      rangeWords(3, null, lab(13, 17), 'g/dL')!.words,
      rangeWords(0.1, '<', null, null)!.words,
    ];
    for (const l of lines) expect(l).not.toMatch(/\b(high|low|abnormal|normal)\b|risk|disease|deficien|diabet|anaemi|anemi/i);
  });
});
