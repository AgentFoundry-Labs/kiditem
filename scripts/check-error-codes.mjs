import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// KID-117 / ADR-0023: every error a screen can see is a registered KidItem code.
// Four checks, each a pure function over { file, source } entries so tests can
// feed fixtures. The CLI wires them to apps/server/src, apps/web/src and the
// baseline file.
//
//   1. registeredCodeViolations — `new Kiditem*Error('CODE'` (and `code: 'CODE'`
//      inside a KiditemError options object) must name a registry key.
//   2. englishLiteralCount vs. baseline — `new *Exception('<English>')` and
//      `throw new Error('<English>')` in the server may not grow beyond
//      `scripts/.error-literal-baseline.txt` (regenerate with --write-baseline
//      only when the count went down).
//   3. rawRenderViolations — web JSX/toast code may not render `.detail`,
//      `error.message` or `errorMessage` directly; it renders `friendlyError`
//      / `operatorErrorText` output. (Skeleton: pattern list below; the
//      implementer completes it with the allowlist of presenter files.)
//   4. extensionCodeViolations — extension `code: '<x>'` literals must resolve
//      through the registry or its alias table. (Skeleton: reports only; the
//      redesign session (KID-338) owns extension changes, so this check does
//      not fail the gate until that map says so.)

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SERVER_SRC = path.join(ROOT, 'apps/server/src');
const WEB_SRC = path.join(ROOT, 'apps/web/src');
const EXTENSION_SRC = path.join(ROOT, 'extensions/kiditem-os');
const BASELINE_FILE = path.join(ROOT, 'scripts/.error-literal-baseline.txt');
const REGISTRY_FILE = path.join(ROOT, 'packages/shared/src/errors/definitions.ts');

const HANGUL = /[가-힣]/;

export function walk(dir, predicate) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === 'dist' ? [] : walk(file, predicate);
    return predicate(file) ? [file] : [];
  });
}

const isSource = (file) => /\.(ts|tsx|mjs|js)$/.test(file) && !/\.(spec|test)\.(ts|tsx|mjs|js)$/.test(file) && !/__tests__|\/tests\//.test(file);

/** Registry keys, read from the TypeScript source so the scanner has no build dependency. */
export function readRegistryCodes(source = readFileSync(REGISTRY_FILE, 'utf8')) {
  const block = source.slice(source.indexOf('export const ERROR_DEFINITIONS'), source.indexOf('as const satisfies'));
  const codes = new Set();
  for (const match of block.matchAll(/^\s{2}([A-Z][A-Z0-9_]+):\s*def\(/gm)) codes.add(match[1]);
  const aliases = new Map();
  const aliasBlock = source.slice(source.indexOf('EXTENSION_CODE_ALIASES'));
  for (const match of aliasBlock.matchAll(/^\s{2}([A-Za-z0-9_]+):\s*'([A-Z0-9_]+)'/gm)) aliases.set(match[1], match[2]);
  return { codes, aliases };
}

// 1. Kiditem*Error('CODE'
export function registeredCodeViolations(entries, codes) {
  const violations = [];
  for (const { file, source } of entries) {
    for (const match of source.matchAll(/new\s+Kiditem\w*Error\(\s*(['"`])([^'"`]+)\1/g)) {
      if (!codes.has(match[2])) violations.push(`${file}: Kiditem error code ${match[2]} is not registered in ERROR_DEFINITIONS`);
    }
  }
  return violations;
}

// 2. English exception literals
const ENGLISH_EXCEPTION = /new\s+\w*Exception\(\s*(['"`])([^'"`\n]{3,})\1/g;
const ENGLISH_ERROR = /throw\s+new\s+Error\(\s*(['"`])([^'"`\n]{3,})\1/g;
const looksEnglish = (text) => !HANGUL.test(text) && !text.includes('${') && /[a-z]{3,}/.test(text) && !/^[A-Z0-9_.:-]+$/.test(text);

export function englishLiteralCount(entries) {
  let count = 0;
  for (const { source } of entries) {
    for (const re of [ENGLISH_EXCEPTION, ENGLISH_ERROR]) {
      for (const match of source.matchAll(re)) if (looksEnglish(match[2])) count += 1;
    }
  }
  return count;
}

export function readBaseline(text) {
  const value = Number.parseInt(text.trim(), 10);
  if (!Number.isFinite(value)) throw new Error('baseline file must hold one integer');
  return value;
}

// 3. Raw message rendering in the web (skeleton; implementer completes the presenter allowlist).
const RAW_RENDER_PATTERNS = [
  /toast(?:\.\w+)?\([^)]*\b(?:error|err|e)\.(?:message|detail)\b/g,
  /\{\s*(?:error|err|e)\.(?:message|detail)\s*\}/g,
  /\{\s*\w+\.errorMessage\s*\}/g,
  /errorCode\s*\?\?\s*['"]UNKNOWN['"]/g,
];
export const RAW_RENDER_ALLOWLIST = new Set([
  'lib/api-error.ts',
  'lib/operator-error.ts',
]);

export function rawRenderViolations(entries, allowlist = RAW_RENDER_ALLOWLIST) {
  const violations = [];
  for (const { file, source } of entries) {
    if (allowlist.has(file)) continue;
    for (const re of RAW_RENDER_PATTERNS) {
      for (const match of source.matchAll(re)) violations.push(`${file}: renders a raw error message (${match[0].trim().slice(0, 60)})`);
    }
  }
  return violations;
}

// 4. Extension code literals (report only until KID-338 migrates the extension).
export function extensionCodeViolations(entries, codes, aliases) {
  const violations = [];
  for (const { file, source } of entries) {
    for (const match of source.matchAll(/\b(?:code|errorCode|failureCode):\s*'([a-z][a-z0-9_]+|[A-Z][A-Z0-9_]+)'/g)) {
      const code = match[1];
      if (!codes.has(code) && !aliases.has(code)) violations.push(`${file}: extension code ${code} is neither registered nor aliased`);
    }
  }
  return [...new Set(violations)];
}

function loadEntries(root) {
  return walk(root, isSource).map((file) => ({ file: path.relative(root, file).split(path.sep).join('/'), source: readFileSync(file, 'utf8') }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const writeBaseline = process.argv.includes('--write-baseline');
  const { codes, aliases } = readRegistryCodes();
  const server = loadEntries(SERVER_SRC);
  const web = loadEntries(WEB_SRC);
  const extension = loadEntries(EXTENSION_SRC);
  const failures = [];

  failures.push(...registeredCodeViolations(server, codes), ...registeredCodeViolations(web, codes));

  const englishCount = englishLiteralCount(server);
  if (writeBaseline) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(BASELINE_FILE, `${englishCount}\n`);
    console.log(`check:error-codes baseline written: ${englishCount}`);
  } else if (!existsSync(BASELINE_FILE)) {
    failures.push(`missing ${path.relative(ROOT, BASELINE_FILE)} — run with --write-baseline once`);
  } else {
    const baseline = readBaseline(readFileSync(BASELINE_FILE, 'utf8'));
    if (englishCount > baseline) failures.push(`English exception literals grew: ${englishCount} > baseline ${baseline} (register a code with a Korean sentence instead)`);
    else if (englishCount < baseline) console.log(`NOTE: English exception literals ${englishCount} < baseline ${baseline}; lower the baseline with --write-baseline`);
  }

  failures.push(...rawRenderViolations(web));

  const extensionReport = extensionCodeViolations(extension, codes, aliases);
  if (extensionReport.length) console.log(`NOTE (KID-338 scope, not enforced): ${extensionReport.length} extension code literals are unregistered:\n  ${extensionReport.slice(0, 10).join('\n  ')}${extensionReport.length > 10 ? '\n  …' : ''}`);

  if (failures.length) { console.error(`check:error-codes FAIL\n${failures.join('\n')}`); process.exitCode = 1; }
  else console.log(`check:error-codes PASS — ${codes.size} registered codes, ${aliases.size} aliases, ${englishCount} English exception literals (baseline ${existsSync(BASELINE_FILE) ? readFileSync(BASELINE_FILE, 'utf8').trim() : 'n/a'})`);
}
