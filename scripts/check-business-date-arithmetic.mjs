#!/usr/bin/env node
// Server business dates come from apps/server/src/common/kst.ts. Hand-written
// millisecond-day arithmetic (86_400_000, 24 * 60 * 60 * 1000, ...) is how a
// KST cutoff or day shift drifts from that module, so it fails outside kst.ts.
// Existing lines that are not business dates (lease TTLs, rolling windows over
// instants, spreadsheet serials) are recorded below with a per-file line
// ceiling. A ceiling only ratchets down.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCAN_ROOT = 'apps/server/src';
export const KST_MODULE = 'apps/server/src/common/kst.ts';
const DAY_MS = 86_400_000;
const EXCLUDED_DIRECTORIES = new Set(['__tests__', 'test-helpers', 'node_modules', 'dist']);

export const RECORDED_DAY_ARITHMETIC = Object.freeze({
  'apps/server/src/advertising/adapter/out/repository/ad-campaign-source.repository.ts':
    { lines: 1, reason: 'campaign sweep attempt lease expiry (now + 24h)' },
  'apps/server/src/advertising/adapter/out/repository/ad-keyword-source.repository.ts':
    { lines: 1, reason: 'keyword attempt lease expiry (now + 24h)' },
  'apps/server/src/channels/adapter/out/repository/channel-catalog-collection.repository.adapter.ts':
    { lines: 1, reason: 'catalog attempt lease expiry (now + 24h)' },
  'apps/server/src/content/application/service/thumbnail-generation.service.ts':
    { lines: 1, reason: '7-day auto-batch cooldown from now' },
  'apps/server/src/orders/services/order-collection.service.ts':
    { lines: 2, reason: 'spreadsheet serial dates (days since 1899-12-30)' },
  'apps/server/src/orders/services/reviews.service.ts':
    { lines: 1, reason: 'rolling recent-review window from now' },
  'apps/server/src/sourcing/adapter/out/shortstrend/youtube-data-shorts.client.ts':
    { lines: 1, reason: 'provider publishedAfter window from now' },
  'apps/server/src/sourcing/application/service/sourcing-shadow-signal.evaluation.ts':
    { lines: 1, reason: 'rolling signal window over observation instants' },
  'apps/server/src/sourcing/application/service/trend-query.service.ts':
    { lines: 1, reason: 'publication cutoff and elapsed spans over captured instants' },
  'apps/server/src/auth/application/auth.service.ts':
    { lines: 1, reason: '30-day session lifetime' },
  'apps/server/src/orders/adapter/out/repository/sellpia-shipment-tracking-source.repository.ts':
    { lines: 1, reason: 'maximum 30-day request span between two instants' },
  'apps/server/src/sourcing/adapter/out/repository/sourcing-decision-batch.repository.adapter.ts':
    { lines: 1, reason: '7-day event window between two instants' },
  'apps/server/src/sourcing/adapter/out/shortstrend/shortstrend-trend.adapter.ts':
    { lines: 1, reason: '48-hour recent window from now' },
});

const NUMBER = String.raw`\d[\d_]*(?:\.\d+)?(?:e\d+)?`;
const NUMERIC_PRODUCT = new RegExp(
  String.raw`(?<![\w.$])${NUMBER}(?:\s*\*\s*${NUMBER})*(?![\w.$])`,
  'g',
);

/** Lines whose numeric literal, or product of numeric literals, is a whole number of days in milliseconds. */
export function dayArithmeticLines(source) {
  const found = [];
  source.split(/\r?\n/).forEach((text, index) => {
    const trimmed = text.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    for (const match of text.matchAll(NUMERIC_PRODUCT)) {
      const product = match[0]
        .split('*')
        .reduce((total, factor) => total * Number(factor.trim().replaceAll('_', '')), 1);
      if (Number.isFinite(product) && product > 0 && product % DAY_MS === 0) {
        found.push({ line: index + 1, text: trimmed });
        return;
      }
    }
  });
  return found;
}

export function isScannedFile(file) {
  const parts = file.split('/');
  return file.startsWith(`${SCAN_ROOT}/`)
    && file !== KST_MODULE
    && file.endsWith('.ts')
    && !file.endsWith('.spec.ts')
    && !file.endsWith('.test.ts')
    && !parts.some((part) => EXCLUDED_DIRECTORIES.has(part));
}

export function analyzeBusinessDateArithmetic({ files, recorded = RECORDED_DAY_ARITHMETIC }) {
  const violations = [];
  const ratchet = [];
  for (const file of Object.keys(files).sort()) {
    if (!isScannedFile(file)) continue;
    const found = dayArithmeticLines(files[file]);
    const ceiling = recorded[file]?.lines ?? 0;
    if (found.length > ceiling) violations.push({ file, ceiling, found });
    else if (found.length < ceiling) ratchet.push({ file, ceiling, count: found.length });
  }
  for (const file of Object.keys(recorded).sort()) {
    if (!(file in files)) ratchet.push({ file, ceiling: recorded[file].lines, count: 0 });
  }
  return { violations, ratchet };
}

function listFiles(root, relativeDir) {
  const absolute = path.join(root, relativeDir);
  let entries;
  try {
    entries = readdirSync(absolute, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const relative = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) {
      return EXCLUDED_DIRECTORIES.has(entry.name) ? [] : listFiles(root, relative);
    }
    return entry.isFile() && isScannedFile(relative) ? [relative] : [];
  });
}

function main(argv) {
  const rootFlag = argv.indexOf('--root');
  const root = rootFlag >= 0
    ? path.resolve(argv[rootFlag + 1])
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const files = Object.fromEntries(
    listFiles(root, SCAN_ROOT).map((file) => [file, readFileSync(path.join(root, file), 'utf8')]),
  );
  const { violations, ratchet } = analyzeBusinessDateArithmetic({ files });
  for (const { file, ceiling, count } of ratchet) {
    console.log(`ratchet hint: ${file} has ${count} recorded day-arithmetic line(s), ceiling ${ceiling}; lower it`);
  }
  if (violations.length === 0) {
    console.log(`check:business-date-arithmetic PASS (${Object.keys(files).length} files)`);
    return 0;
  }
  console.error('check:business-date-arithmetic FAIL');
  console.error('Build business dates with apps/server/src/common/kst.ts (evidenceCutoffDate, addDays, businessDateKey, inclusiveDayCount), not millisecond-day arithmetic:');
  for (const { file, ceiling, found } of violations) {
    for (const { line, text } of found) console.error(`  ${file}:${line}  ${text}`);
    if (ceiling > 0) console.error(`  (${file} records ${ceiling} line(s) that are not business dates)`);
  }
  return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = main(process.argv.slice(2));
}
