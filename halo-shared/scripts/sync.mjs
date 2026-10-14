#!/usr/bin/env node
// Copies halo-shared/src into the app and the backend as generated, committed files.
//
//   npm run sync          write the copies
//   npm run sync:check    exit 1 if any copy is missing, stale or extra
//
// A copy (not a workspace package) keeps Metro free of monorepo config and lets halo-backend
// deploy to Heroku on its own. The backend compiles with NodeNext resolution, so its copies get
// `.js` on relative imports; Metro resolves extensionless imports, so the app's copies don't.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const TARGETS = [
  { dir: resolve(ROOT, '../halo-app/src/shared'), jsExtensions: false },
  { dir: resolve(ROOT, '../halo-backend/src/shared'), jsExtensions: true },
];

const check = process.argv.includes('--check');
const files = readdirSync(SRC).filter((f) => f.endsWith('.ts'));

function render(file, jsExtensions) {
  let code = readFileSync(join(SRC, file), 'utf8');
  if (jsExtensions) {
    code = code.replace(/(from\s+['"])(\.{1,2}\/[^'"]+?)(['"])/g, (m, a, path, b) =>
      path.endsWith('.js') ? m : `${a}${path}.js${b}`,
    );
  }
  return `// GENERATED from halo-shared/src/${file} by halo-shared/scripts/sync.mjs. Do not edit.\n\n${code}`;
}

let problems = 0;
for (const { dir, jsExtensions } of TARGETS) {
  if (!check) mkdirSync(dir, { recursive: true });
  const existing = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.ts')) : [];

  for (const file of files) {
    const expected = render(file, jsExtensions);
    const target = join(dir, file);
    const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
    if (current === expected) continue;
    if (check) {
      console.error(`${current == null ? 'missing' : 'stale'}: ${target}`);
      problems++;
    } else {
      writeFileSync(target, expected);
      console.log(`wrote ${target}`);
    }
  }

  for (const file of existing.filter((f) => !files.includes(f))) {
    if (check) {
      console.error(`extra: ${join(dir, file)}`);
      problems++;
    } else {
      rmSync(join(dir, file));
      console.log(`removed ${join(dir, file)}`);
    }
  }
}

if (check && problems) {
  console.error(`\n${problems} shared file(s) out of date. Run: npm --prefix halo-shared run sync`);
  process.exit(1);
}
if (check) console.log('shared copies are up to date');
