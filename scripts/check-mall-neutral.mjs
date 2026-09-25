#!/usr/bin/env node
// Guards KID-321: the registration lifecycle (execution kinds, fence, evidence,
// representative image) is mall-neutral. A channel name belongs to a channel
// adapter (`channels/adapter/out/channel/<key>/`), to catalog collection, or to
// a per-mall sheet template — never to the Channels domain/application layers
// or to the shared lifecycle contracts.
//
// The check reads code, not prose: comments are stripped, and `wing`, `coupang`
// or `rocket` count only as an identifier part or inside a string literal
// (`showing` is not `wing`; `wingProduct`, `isCoupang`, `'coupang'` are). Spec
// files and `__tests__/` are not scanned — tests pick real channel keys as
// fixtures.
//
// A file that legitimately keeps a channel name is listed in ALLOWLIST with the
// reason. An entry that no longer has a hit is stale and fails the check, so
// the list only shrinks.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCAN_ROOTS = [
  'apps/server/src/channels/domain',
  'apps/server/src/channels/application',
  'packages/shared/src/registration-execution.ts',
  'packages/shared/src/schemas/registration-target.ts',
  'packages/shared/src/schemas/registration-target-execution.ts',
  'packages/shared/src/thumbnail-execution.ts',
];

const CATALOG = 'catalog collection/import of a channel (KID-321 AC: collection keeps channel names)';
const SHEET = 'per-channel bulk-sheet or catalog-edit Excel template (KID-321 AC: Excel templates keep channel names)';
const ROCKET = 'Rocket PO / Rocket Sellpia matching import (KID-321 AC: Rocket keeps its name)';
const ACCOUNT = 'channel account identity of a marketplace row (Wing/Rocket are distinct account rows, ADR-0012)';

/** path (repo-relative) -> reason. Keep sorted. */
export const ALLOWLIST = new Map([
  ['apps/server/src/channels/application/port/in/account/channel-account.port.ts', ACCOUNT],
  ['apps/server/src/channels/application/port/in/rocket-sellpia-matching-csv-import.port.ts', ROCKET],
  ['apps/server/src/channels/application/port/in/sales-product/sales-product-coupang-catalog.port.ts', SHEET],
  ['apps/server/src/channels/application/port/in/wing-catalog-operation.port.ts', CATALOG],
  ['apps/server/src/channels/application/port/out/documents/channel-document.models.ts', SHEET],
  ['apps/server/src/channels/application/port/out/documents/channel-documents.port.ts', SHEET],
  ['apps/server/src/channels/application/port/out/persistence/channel-account.persistence.port.ts', ACCOUNT],
  ['apps/server/src/channels/application/port/out/persistence/sales-product.repository.port.ts', SHEET],
  ['apps/server/src/channels/application/port/out/repository/channel-catalog-publication.port.ts', CATALOG],
  ['apps/server/src/channels/application/port/out/repository/rocket-sellpia-matching-csv-import.repository.port.ts', ROCKET],
  ['apps/server/src/channels/application/service/account/channel-account.service.ts', ACCOUNT],
  ['apps/server/src/channels/application/service/collection/rocket-sellpia-matching-csv-import.service.ts', ROCKET],
  ['apps/server/src/channels/application/service/collection/sabangnet-product-import.plan.ts', CATALOG],
  ['apps/server/src/channels/application/service/collection/wing-catalog-operation.service.ts', CATALOG],
  ['apps/server/src/channels/application/service/registration/channel-document-export.service.ts', SHEET],
  ['apps/server/src/channels/application/service/sales-product/sales-product-coupang-catalog.service.ts', SHEET],
  ['apps/server/src/channels/domain/account/channel-account-sales-costs.ts', ACCOUNT],
  ['apps/server/src/channels/domain/account/coupang-account-identity.ts',
    'Coupang vendor-id resolution shared with Advertising collection; under adapter/ it would be an owner implementation import (check:ledger-readers)'],
  ['apps/server/src/channels/domain/collection/catalog-source-identity.ts', CATALOG],
  ['apps/server/src/channels/domain/listing/mall-product-url.ts', CATALOG],
  ['apps/server/src/channels/domain/registration/bulk-sheet/coupang-catalog-edit.ts', SHEET],
  ['apps/server/src/channels/domain/registration/bulk-sheet/coupang-wing.sheet.ts', SHEET],
  ['apps/server/src/channels/domain/registration/bulk-sheet/mall-bulk-sheet-registry.ts', SHEET],
  ['apps/server/src/channels/domain/registration/bulk-sheet/mall-sheet-categories.ts', SHEET],
  ['apps/server/src/channels/domain/registration/mall-adapter-manifest.ts',
    'mall adapter manifest: per-channel send capability notes keyed by channel key (registry-owned identity)'],
  ['apps/server/src/channels/domain/registration/wing-listing-registration.ts',
    'parses the Wing catalog createdOn fact for catalog collection; advertising/domain imports it, so it cannot move under adapter/'],
]);

const MALL_NAME = /(?<![a-z])(?:wing|coupang|rocket)|Wing|WING|Coupang|COUPANG|Rocket|ROCKET/;

/** Source with comments removed; string and template literals are kept. */
export function stripComments(source) {
  let out = '';
  let index = 0;
  let quote = null;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (quote) {
      out += char;
      if (char === '\\') { out += next ?? ''; index += 2; continue; }
      if (char === quote) quote = null;
      index += 1;
      continue;
    }
    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      const comment = end === -1 ? source.slice(index) : source.slice(index, end + 2);
      out += comment.replace(/[^\n]/g, '');
      index = end === -1 ? source.length : end + 2;
      continue;
    }
    if (char === '\'' || char === '"' || char === '`') quote = char;
    out += char;
    index += 1;
  }
  return out;
}

/** 1-based line numbers whose code (not comments) names a channel. */
export function mallNameHits(source) {
  return stripComments(source).split('\n').flatMap((line, index) => (MALL_NAME.test(line) ? [index + 1] : []));
}

function isScannedSource(file) {
  return file.endsWith('.ts') && !file.endsWith('.spec.ts') && !file.split('/').includes('__tests__');
}

function listFiles(root, relative) {
  const absolute = path.join(root, relative);
  if (!existsSync(absolute)) return [];
  if (statSync(absolute).isFile()) return [relative];
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = path.posix.join(relative, entry.name);
    return entry.isDirectory() ? listFiles(root, child) : [child];
  });
}

export function collectMallNeutralFindings(root) {
  const findings = [];
  const hitFiles = new Set();
  for (const scanRoot of SCAN_ROOTS) {
    for (const file of listFiles(root, scanRoot).filter(isScannedSource)) {
      const hits = mallNameHits(readFileSync(path.join(root, file), 'utf8'));
      if (hits.length === 0) continue;
      hitFiles.add(file);
      if (!ALLOWLIST.has(file)) findings.push(`${file}:${hits.join(',')} names a channel outside a channel adapter`);
    }
  }
  for (const file of ALLOWLIST.keys()) {
    if (!hitFiles.has(file)) findings.push(`${file} is allowlisted but names no channel — remove the entry`);
  }
  return findings;
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const findings = collectMallNeutralFindings(root);
  if (findings.length > 0) {
    console.error('check:mall-neutral FAIL');
    for (const finding of findings) console.error(`  - ${finding}`);
    process.exit(1);
  }
  console.log(`check:mall-neutral PASS (${ALLOWLIST.size} allowlisted files)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
