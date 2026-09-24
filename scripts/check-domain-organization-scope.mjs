#!/usr/bin/env node
// Pure-domain organization-scope ratchet (KID-257).
//
// The entrypoint decides the organization once; a domain function that reads
// and writes no rows should not take `organizationId` (apps/server/CLAUDE.md,
// Module Boundaries). This scanner parses every non-test file under
// apps/server/src/**/domain/** that imports neither Prisma, an outgoing port,
// nor a repository, and reports each `organizationId` parameter, direct or
// destructured.
//
// Allowed: a parameter whose line, or the line above, carries
//   // organization-scope: data — <reason>
// for code where the organization id is data (a storage key, a printed label).
//
// Existing sites are frozen in scripts/.domain-organization-scope-baseline.txt
// (`<count> <path>`, same policy as check-server-type-baseline.mjs): a new file
// or a count above its ceiling fails; a drop passes.
//
//   node scripts/check-domain-organization-scope.mjs [--regenerate]

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compareToBaseline } from './check-server-type-baseline.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const SERVER_SRC = 'apps/server/src';
const BASELINE_FILE = 'scripts/.domain-organization-scope-baseline.txt';
const REGENERATE_COMMAND = 'node scripts/check-domain-organization-scope.mjs --regenerate';

const MARKER = /\/\/\s*organization-scope: data — \S/;
// A domain file that reaches persistence already sits on the scoped side.
const PERSISTENCE_IMPORT =
  /^\s*(?:import|export)\b[^'"]*?\bfrom\s+['"](?:@prisma\/client|[^'"]*port\/out\/[^'"]*|[^'"]*repository[^'"]*)['"]/m;

function bindsOrganizationId(name) {
  if (ts.isIdentifier(name)) return name.text === 'organizationId';
  if (ts.isObjectBindingPattern(name)) {
    return name.elements.some((element) => {
      const key = element.propertyName ?? element.name;
      if (ts.isIdentifier(key) && key.text === 'organizationId') return true;
      return !ts.isIdentifier(element.name) && bindsOrganizationId(element.name);
    });
  }
  if (ts.isArrayBindingPattern(name)) {
    return name.elements.some((element) => !ts.isOmittedExpression(element) && bindsOrganizationId(element.name));
  }
  return false;
}

/** 1-based lines of unmarked `organizationId` parameters in one source file. */
export function findOrganizationScopeParameters(filePath, source) {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const lines = source.split('\n');
  const hits = new Set();
  const visit = (node) => {
    if (ts.isParameter(node) && bindsOrganizationId(node.name)) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line;
      const marked = MARKER.test(lines[line] ?? '') || MARKER.test(lines[line - 1] ?? '');
      if (!marked) hits.add(line + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...hits].sort((a, b) => a - b);
}

export function isScannedDomainSource(filePath, source) {
  return !PERSISTENCE_IMPORT.test(source);
}

/** Per-file counts for `files` ({path: source}) compared with the baseline ceiling. */
export function analyzeDomainOrganizationScope({ files, baseline }) {
  const counts = new Map();
  const lines = new Map();
  for (const [filePath, source] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    if (!isScannedDomainSource(filePath, source)) continue;
    const hits = findOrganizationScopeParameters(filePath, source);
    if (hits.length === 0) continue;
    counts.set(filePath, hits.length);
    lines.set(filePath, hits);
  }
  return { counts, lines, ...compareToBaseline({ baseline, current: counts }) };
}

function isTestSource(relative) {
  return /(^|\/)__tests__\//.test(relative) || /\.(spec|test)\.ts$/.test(relative) || relative.endsWith('.d.ts');
}

function collectDomainFiles() {
  const files = {};
  const walk = (relativeDir, inDomain) => {
    for (const entry of readdirSync(path.join(REPO_ROOT, relativeDir), { withFileTypes: true })) {
      const relative = `${relativeDir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
        walk(relative, inDomain || entry.name === 'domain');
      } else if (inDomain && entry.name.endsWith('.ts') && !isTestSource(relative)) {
        files[relative] = readFileSync(path.join(REPO_ROOT, relative), 'utf8');
      }
    }
  };
  walk(SERVER_SRC, false);
  return files;
}

function readBaseline() {
  const file = path.join(REPO_ROOT, BASELINE_FILE);
  if (!existsSync(file)) {
    console.error(`ERROR: baseline file not found: ${BASELINE_FILE}\n  Generate with: ${REGENERATE_COMMAND}`);
    process.exit(2);
  }
  const baseline = new Map();
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const match = /^(\d+)\s+(\S+)$/.exec(line);
    if (!match) {
      console.error(`ERROR: malformed baseline line: ${raw}`);
      process.exit(2);
    }
    baseline.set(match[2], Number(match[1]));
  }
  return baseline;
}

function run() {
  const files = collectDomainFiles();
  if (Object.keys(files).length === 0) {
    console.error(`ERROR: no domain sources found under ${SERVER_SRC}; the scan would pass vacuously.`);
    process.exit(2);
  }
  if (process.argv.includes('--regenerate')) {
    const { counts } = analyzeDomainOrganizationScope({ files, baseline: new Map() });
    const body = [...counts.entries()].map(([file, count]) => `${count} ${file}`).join('\n');
    writeFileSync(
      path.join(REPO_ROOT, BASELINE_FILE),
      `# ${BASELINE_FILE}
#
# Ceiling of unmarked \`organizationId\` parameters in pure domain files, per
# file (scripts/check-domain-organization-scope.mjs). Generated by
# \`${REGENERATE_COMMAND}\`. Drops pass without regeneration; do not raise an
# entry to admit a new parameter — move the scope to the entrypoint, or mark
# organization-as-data with \`// organization-scope: data — <reason>\`.
#
# Format per non-comment line: <count> <repo-relative-path>
${body}${body ? '\n' : ''}`,
    );
    console.log(`baseline written: ${BASELINE_FILE} (${counts.size} file(s))`);
    return;
  }

  const baseline = readBaseline();
  const { counts, lines, newFiles, grownFiles } = analyzeDomainOrganizationScope({ files, baseline });
  console.log(`check:domain-organization-scope - ${Object.keys(files).length} domain file(s) scanned`);
  if (newFiles.length > 0 || grownFiles.length > 0) {
    console.log('');
    console.log('FAIL: pure domain code takes organizationId as a parameter:');
    for (const [file, hitLines] of lines) {
      const allowed = baseline.get(file);
      if (allowed === undefined || counts.get(file) > allowed) {
        console.log(`   - ${file}:${hitLines.join(',')}${allowed === undefined ? '' : ` (baseline ${allowed})`}`);
      }
    }
    console.log(`
  The entrypoint decides the organization once; a domain function that reads
  and writes no rows does not take organizationId (apps/server/CLAUDE.md,
  Module Boundaries). Pass the organization-free values it needs instead. When
  the organization id is data (a storage key, a printed label), mark the
  parameter with a reason on its line or the line above:

      // organization-scope: data — <reason>`);
    process.exit(1);
  }
  console.log('PASS: no new organizationId parameters in pure domain code.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  run();
}
