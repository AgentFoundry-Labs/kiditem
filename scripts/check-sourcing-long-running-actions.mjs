#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RETIRED_DIRECT_EXTENSION_HELPERS = [
  'searchWingCatalogProducts',
  'searchCoupangKeywordSuggestions',
  'runCompetitorCollection',
  'runCompetitorSellerCollection',
  'search1688ByKeyword',
  'search1688ByImage',
];

const RETIRED_DIRECT_EXTENSION_MODULES = [
  'wing-catalog-extension',
  'coupang-keyword-extension',
];

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function isProductionSource(file) {
  return /\.(?:ts|tsx)$/.test(file)
    && !/\.(?:spec|test)\.(?:ts|tsx)$/.test(file)
    && !file.includes(`${path.sep}__tests__${path.sep}`);
}

function collectProductionSources(root, relativeDirectory) {
  const directory = path.join(root, relativeDirectory);
  const sources = [];
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') visit(absolute);
        continue;
      }
      if (!entry.isFile() || !isProductionSource(absolute)) continue;
      sources.push({
        path: path.relative(root, absolute),
        source: readFileSync(absolute, 'utf8'),
      });
    }
  };
  visit(directory);
  return sources.sort((left, right) => left.path.localeCompare(right.path));
}

function findMatchingDelimiter(source, start, open, close) {
  let depth = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;

  for (let index = start; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (current === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (current === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (current === '\\') {
        index += 1;
      } else if (current === quote) {
        quote = null;
      }
      continue;
    }
    if (current === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (current === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (current === '\'' || current === '"' || current === '`') {
      quote = current;
      continue;
    }
    if (current === open) depth += 1;
    if (current === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function findEffectBodies(source) {
  const bodies = [];
  const effectPattern = /\buseEffect\s*\(/g;
  let match;
  while ((match = effectPattern.exec(source))) {
    const opening = source.indexOf('(', match.index);
    const closing = findMatchingDelimiter(source, opening, '(', ')');
    if (closing === -1) continue;

    const callback = source.slice(opening + 1, closing);
    const arrow = callback.indexOf('=>');
    if (arrow === -1) continue;
    const afterArrow = callback.slice(arrow + 2).trimStart();
    if (!afterArrow.startsWith('{')) continue;
    const bodyEnd = findMatchingDelimiter(afterArrow, 0, '{', '}');
    if (bodyEnd === -1) continue;
    bodies.push(afterArrow.slice(1, bodyEnd));
  }
  return bodies;
}

function collectionOperationBindings(source) {
  const bindings = [];
  const pattern = /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*useSourcingOperationAction\s*\(/g;
  let match;
  while ((match = pattern.exec(source))) bindings.push(match[1]);
  return bindings;
}

function finding(rule, file, detail) {
  return { rule, file, detail };
}

function hasCall(source, name) {
  return new RegExp(`\\b${name}\\s*\\(`).test(source);
}

function isRetiredExtensionImport(source) {
  return RETIRED_DIRECT_EXTENSION_MODULES.some((moduleName) =>
    new RegExp(`\\bfrom\\s*['\"][^'\"]*${moduleName}['\"]`).test(source),
  );
}

function hasDirect1688Execution(source) {
  if (!/Sourcing1688(?:Keyword|Image)SearchService/.test(source)) return false;
  return /\bthis\.[A-Za-z_$][\w$]*\.(?:searchForOperation|searchByKeyword|searchByImage|resolveTargets|detect)\s*\(/.test(source);
}

export function analyzeSourcingLongRunningActions({
  webSources,
  sourcingServerSources,
}) {
  const findings = [];

  for (const file of webSources) {
    if (isRetiredExtensionImport(file.source)) {
      findings.push(finding(
        'retired_direct_extension_import',
        file.path,
        'Retired direct collection extension modules may not be imported.',
      ));
    }

    for (const helper of RETIRED_DIRECT_EXTENSION_HELPERS) {
      if (hasCall(file.source, helper)) {
        findings.push(finding(
          'retired_direct_extension_call',
          file.path,
          `Retired direct collection helper ${helper} may not be called.`,
        ));
      }
    }

    if (
      /\buseQueries\s*\(/.test(file.source)
      && /(?:fetchWingTrackedHistory|wing-tracked-history)/.test(file.source)
    ) {
      findings.push(finding(
        'product_tracking_use_queries',
        file.path,
        'Product tracking must use the persisted batch history read, not useQueries.',
      ));
    }

    const operationBindings = collectionOperationBindings(file.source);
    for (const effectBody of findEffectBodies(file.source)) {
      const startsOperation = operationBindings.some((binding) =>
        new RegExp(`\\b${binding}\\.start\\s*\\(`).test(effectBody),
      );
      const callsRetiredHelper = RETIRED_DIRECT_EXTENSION_HELPERS.some((helper) =>
        hasCall(effectBody, helper),
      );
      if (startsOperation || callsRetiredHelper) {
        findings.push(finding(
          'collection_start_in_effect',
          file.path,
          'A sourcing useEffect may read persisted state but may not start collection work.',
        ));
      }
    }
  }

  for (const file of sourcingServerSources) {
    if (file.path.includes('/adapter/in/http/') && hasDirect1688Execution(file.source)) {
      findings.push(finding(
        'direct_1688_service_execution_from_http_controller',
        file.path,
        '1688 provider execution belongs to its owner operation handler, not an HTTP controller.',
      ));
    }
    if (/\blatestOrDetect\b/.test(file.source)) {
      findings.push(finding(
        'latest_or_detect',
        file.path,
        'Read endpoints must not compute and persist a sourcing snapshot.',
      ));
    }
    if (/@Post\s*\(\s*['"]detect['"]\s*\)/.test(file.source)) {
      findings.push(finding(
        'legacy_rising_detect_post',
        file.path,
        'Sourcing detection starts through Operations; no compatibility POST /detect facade remains.',
      ));
    }
  }

  return { findings };
}

function main() {
  const root = repoRoot();
  const result = analyzeSourcingLongRunningActions({
    webSources: collectProductionSources(root, 'apps/web/src/app/(sourcing-ai)'),
    sourcingServerSources: collectProductionSources(root, 'apps/server/src/sourcing'),
  });

  if (result.findings.length === 0) {
    console.log('check:sourcing-long-running-actions PASS');
    return;
  }

  console.error('check:sourcing-long-running-actions FAIL');
  for (const issue of result.findings) {
    console.error(`${issue.file}: [${issue.rule}] ${issue.detail}`);
  }
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
