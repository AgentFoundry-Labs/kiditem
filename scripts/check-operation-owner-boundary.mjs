#!/usr/bin/env node
// Guards ADR-0025: `common/operation` is the only writer and reader of the
// operation tables. Owner code joins an operation through `plan`/`finalize` and
// the HTTP contract; it never touches `operations`, `operation_chunks` or
// `operation_locks` rows itself, neither through a Prisma delegate
// (`prisma.operation`, `tx.operationChunk`, `client.operationLock`, …) nor
// through raw SQL naming those tables.
//
// The check reads code, not prose: comments are stripped, string and template
// literals are kept (raw SQL lives there). Spec files and `__tests__/` are not
// scanned — tests may inspect staging rows to prove the contract.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './check-mall-neutral.mjs';

export const SCAN_ROOT = 'apps/server/src';
export const OWNER_ROOT = 'apps/server/src/common/operation/';

const DELEGATE = /\b(?:prisma|tx|trx|client|db)\s*\.\s*(?:operation|operationChunk|operationLock)\b/g;
const RAW_TABLE = /\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+"?(?:operations|operation_chunks|operation_locks)"?(?![\w-])/gi;

/** 1-based line numbers whose code (not comments) touches an operation table. */
export function operationTableHits(source) {
  const code = stripComments(source);
  const lines = new Set();
  for (const pattern of [DELEGATE, RAW_TABLE]) {
    for (const match of code.matchAll(pattern)) {
      lines.add(code.slice(0, match.index + match[0].length).split('\n').length);
    }
  }
  return [...lines].sort((left, right) => left - right);
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

export function collectOperationBoundaryFindings(root) {
  const findings = [];
  for (const file of listFiles(root, SCAN_ROOT).filter(isScannedSource).sort()) {
    if (file.startsWith(OWNER_ROOT)) continue;
    const hits = operationTableHits(readFileSync(path.join(root, file), 'utf8'));
    if (hits.length > 0) findings.push(`${file}:${hits.join(',')} touches operation rows outside common/operation`);
  }
  return findings;
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const findings = collectOperationBoundaryFindings(root);
  if (findings.length > 0) {
    console.error('check:operation-owner-boundary FAIL (ADR-0025: only common/operation touches operation rows)');
    for (const finding of findings) console.error(`  - ${finding}`);
    process.exit(1);
  }
  console.log('check:operation-owner-boundary PASS');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
