#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_BASELINE = 'scripts/.shared-interface-names-baseline.txt';

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(fullPath));
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.spec.ts') &&
      !entry.name.endsWith('.test.ts')
    ) {
      out.push(fullPath);
    }
  }
  return out;
}

function parseBaseline(raw) {
  return new Set(
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#')),
  );
}

function exportedZodContracts(source) {
  const names = [];
  const re = /export\s+const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*z(?:\.|\w)/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    names.push(match[1]);
  }
  return names;
}

function isVisibleContractName(name) {
  return /^[A-Z][A-Za-z0-9]*Schema$/.test(name) || /^z[A-Z]/.test(name);
}

export function analyzeSharedInterfaceNames({ files, baseline }) {
  const baselineSet = parseBaseline(baseline);
  const currentViolations = new Set();

  for (const [file, source] of Object.entries(files)) {
    for (const name of exportedZodContracts(source)) {
      if (!isVisibleContractName(name)) {
        currentViolations.add(`${file}:${name}`);
      }
    }
  }

  const newViolations = [...currentViolations]
    .filter((entry) => !baselineSet.has(entry))
    .sort();
  const staleBaselineEntries = [...baselineSet]
    .filter((entry) => !currentViolations.has(entry))
    .sort();

  return {
    currentViolations: [...currentViolations].sort(),
    newViolations,
    staleBaselineEntries,
  };
}

function readFiles(root) {
  return Object.fromEntries(
    walk(path.join(root, 'packages/shared/src')).map((file) => [
      path.relative(root, file),
      readFileSync(file, 'utf8'),
    ]),
  );
}

function main() {
  const root = repoRoot();
  const baselinePath = path.join(root, DEFAULT_BASELINE);
  const baseline = existsSync(baselinePath) ? readFileSync(baselinePath, 'utf8') : '';
  const result = analyzeSharedInterfaceNames({
    files: readFiles(root),
    baseline,
  });

  if (result.newViolations.length === 0 && result.staleBaselineEntries.length === 0) {
    console.log('check:shared-interface-names PASS');
    return;
  }

  console.error('check:shared-interface-names FAIL');
  if (result.newViolations.length > 0) {
    console.error('New public Zod contracts must use PascalCaseSchema names:');
    for (const violation of result.newViolations) console.error(`  ${violation}`);
  }
  if (result.staleBaselineEntries.length > 0) {
    console.error('Stale baseline entries can be removed:');
    for (const stale of result.staleBaselineEntries) console.error(`  ${stale}`);
  }
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
