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
//   2. englishLiteralCount / codeMessageCount vs. baseline — in the server,
//      (a) English sentences in `new *Exception('<English>')` /
//      `throw new Error('<English>')` and (b) code-spelled messages such as
//      `new ConflictException('ATTEMPT_FENCE_LOST')` (KID-340; counted even
//      when the spelling matches a registry key or alias, because the shape
//      itself must become a KiditemError) may not grow beyond
//      `scripts/.error-literal-baseline.txt` (`english=<n>` / `code-message=<n>`
//      lines; regenerate with --write-baseline only when a count went down).
//   3. rawRenderViolations vs. render baseline — web JSX/toast code that renders
//      `.detail`, `error.message`, `errorMessage` or a raw `errorCode` directly
//      may not grow beyond `scripts/.error-render-baseline.txt`; new code renders
//      `friendlyError` / `attemptFailureText` / `operatorReason` output. Only the
//      two presenter files are allowlisted.
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
const RENDER_BASELINE_FILE = path.join(ROOT, 'scripts/.error-render-baseline.txt');
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

export const isSource = (file) => /\.(ts|tsx|mjs|js)$/.test(file) && !/\.(spec|test)\.(ts|tsx|mjs|js)$/.test(file) && !/__tests__|\/tests\/|\/test-helpers\//.test(file);

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

// 2b. Code-spelled exception messages: `new ConflictException('ATTEMPT_FENCE_LOST')`.
const CODE_SPELLED = /^[A-Z][A-Z0-9_.:-]{2,}$/;

export function codeMessageCount(entries) {
  let count = 0;
  for (const { source } of entries) {
    for (const re of [ENGLISH_EXCEPTION, ENGLISH_ERROR]) {
      for (const match of source.matchAll(re)) if (CODE_SPELLED.test(match[2])) count += 1;
    }
  }
  return count;
}

/** `english=<n>` / `code-message=<n>` lines; an old one-integer file is the English count. */
export function readLiteralBaseline(text) {
  const trimmed = text.trim();
  if (/^\d+$/.test(trimmed)) return { english: Number.parseInt(trimmed, 10), codeMessage: 0 };
  const values = {};
  for (const line of trimmed.split('\n')) {
    const match = line.trim().match(/^(english|code-message)=(\d+)$/);
    if (!match) throw new Error(`literal baseline line must be english=<n> or code-message=<n>: ${line}`);
    values[match[1]] = Number.parseInt(match[2], 10);
  }
  if (values.english === undefined) throw new Error('literal baseline needs an english=<n> line');
  return { english: values.english, codeMessage: values['code-message'] ?? 0 };
}

export function literalBaselineFailures(counts, baseline) {
  const failures = [];
  if (counts.english > baseline.english) failures.push(`English exception literals grew: ${counts.english} > baseline ${baseline.english} (register a code with a Korean sentence instead)`);
  if (counts.codeMessage > baseline.codeMessage) failures.push(`code-spelled exception messages grew: ${counts.codeMessage} > baseline ${baseline.codeMessage} (throw a KiditemError with a registered code instead)`);
  return failures;
}

export function readBaseline(text) {
  const value = Number.parseInt(text.trim(), 10);
  if (!Number.isFinite(value)) throw new Error('baseline file must hold one integer');
  return value;
}

// 3. Raw message rendering in the web. Screens render `friendlyError` / `attemptFailureText` /
// `operatorReason` output (lib/api-error.ts, lib/operator-error.ts); these shapes put a raw server,
// extension or thrown message on screen instead. A value merely compared or passed on is not caught.
const RAW_RENDER_PATTERNS = [
  // toast.x(error.message) / toast.x(err instanceof Error ? err.message : …), nested calls allowed
  /toast(?:\.\w+)?\((?:[^()]|\([^()]*\))*?\b(?:error|err|e)\.(?:message|detail)\b/g,
  // {x instanceof Error ? x.message : …} in JSX or a template, any variable name
  /\{[^{}]*\b(\w+)\s+instanceof\s+Error\s*\?\s*\1\.message\b/g,
  // {error.message}, {mutation.error.message}, {e?.detail} in JSX or a template
  /\{\s*(?:[\w]+\??\.)*(?:error|err|e)\??\.(?:message|detail)\s*\}/g,
  // {attempt.errorMessage}, {source.data?.latestAttempt?.errorMessage}
  /\{\s*(?:[\w]+\??\.)+errorMessage\s*\}/g,
  // status rows that fall back from the message to the raw code
  /errorMessage\s*\?\?\s*[\w.?]*errorCode\b/g,
  /errorCode\s*\?\?\s*['"]UNKNOWN['"]/g,
];
export const RAW_RENDER_ALLOWLIST = new Set([
  'lib/api-error.ts',
  'lib/operator-error.ts',
]);

/** The raw-render count is a ceiling like check 2: screens move to the presenters, the count only shrinks. */
export function renderBaselineFailure(count, baseline) {
  return count > baseline
    ? `raw error rendering grew: ${count} > baseline ${baseline} (render friendlyError / attemptFailureText / operatorReason output instead)`
    : null;
}

export function rawRenderViolations(entries, allowlist = RAW_RENDER_ALLOWLIST) {
  const violations = [];
  for (const { file, source } of entries) {
    if (allowlist.has(file)) continue;
    // One finding per rendered message: a toast argument can also match the `{…}` shape, so a match
    // that ends where an earlier finding ends is the same message.
    const seenEnds = new Set();
    for (const re of RAW_RENDER_PATTERNS) {
      for (const match of source.matchAll(re)) {
        const end = match.index + match[0].length;
        if (seenEnds.has(end)) continue;
        seenEnds.add(end);
        const line = source.slice(0, match.index).split('\n').length;
        violations.push(`${file}:${line}: renders a raw error message (${match[0].trim().slice(0, 60)})`);
      }
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

  const literalCounts = { english: englishLiteralCount(server), codeMessage: codeMessageCount(server) };
  if (writeBaseline) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(BASELINE_FILE, `english=${literalCounts.english}\ncode-message=${literalCounts.codeMessage}\n`);
    console.log(`check:error-codes literal baseline written: english=${literalCounts.english} code-message=${literalCounts.codeMessage}`);
  } else if (!existsSync(BASELINE_FILE)) {
    failures.push(`missing ${path.relative(ROOT, BASELINE_FILE)} — run with --write-baseline once`);
  } else {
    const baseline = readLiteralBaseline(readFileSync(BASELINE_FILE, 'utf8'));
    failures.push(...literalBaselineFailures(literalCounts, baseline));
    if (literalCounts.english < baseline.english) console.log(`NOTE: English exception literals ${literalCounts.english} < baseline ${baseline.english}; lower the baseline with --write-baseline`);
    if (literalCounts.codeMessage < baseline.codeMessage) console.log(`NOTE: code-spelled exception messages ${literalCounts.codeMessage} < baseline ${baseline.codeMessage}; lower the baseline with --write-baseline`);
  }

  const rawRenders = rawRenderViolations(web);
  if (writeBaseline) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(RENDER_BASELINE_FILE, `${rawRenders.length}\n`);
    console.log(`check:error-codes raw-render baseline written: ${rawRenders.length}`);
  } else if (!existsSync(RENDER_BASELINE_FILE)) {
    failures.push(`missing ${path.relative(ROOT, RENDER_BASELINE_FILE)} — run with --write-baseline once`);
  } else {
    const renderBaseline = readBaseline(readFileSync(RENDER_BASELINE_FILE, 'utf8'));
    const grew = renderBaselineFailure(rawRenders.length, renderBaseline);
    if (grew) failures.push(grew, ...rawRenders);
    else if (rawRenders.length < renderBaseline) console.log(`NOTE: raw error rendering ${rawRenders.length} < baseline ${renderBaseline}; lower the baseline with --write-baseline`);
  }

  const extensionReport = extensionCodeViolations(extension, codes, aliases);
  if (extensionReport.length) console.log(`NOTE (KID-338 scope, not enforced): ${extensionReport.length} extension code literals are unregistered:\n  ${extensionReport.slice(0, 10).join('\n  ')}${extensionReport.length > 10 ? '\n  …' : ''}`);

  if (failures.length) { console.error(`check:error-codes FAIL\n${failures.join('\n')}`); process.exitCode = 1; }
  else {
    const literalBaseline = existsSync(BASELINE_FILE) ? readLiteralBaseline(readFileSync(BASELINE_FILE, 'utf8')) : null;
    const renderBaseline = existsSync(RENDER_BASELINE_FILE) ? readFileSync(RENDER_BASELINE_FILE, 'utf8').trim() : 'n/a';
    console.log(`check:error-codes PASS — ${codes.size} registered codes, ${aliases.size} aliases, english exception literals ${literalCounts.english} (baseline ${literalBaseline?.english ?? 'n/a'}), code-spelled exception messages ${literalCounts.codeMessage} (baseline ${literalBaseline?.codeMessage ?? 'n/a'}), raw renders ${rawRenders.length} (baseline ${renderBaseline})`);
  }
}
