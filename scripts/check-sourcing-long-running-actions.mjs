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
  'collectInterestKeywordsFrom1688',
  'collect1688TrendsFromChrome',
  'collectTiktokCcFromChrome',
  'collectLiveCommerceFromChrome',
  'collectTaobaoLive',
];

const RETIRED_DIRECT_EXTENSION_MODULES = [
  'wing-catalog-extension',
  'coupang-keyword-extension',
  'collect-interest-1688',
  '1688-trend-extension',
  'tiktok-cc-trend-extension',
];

const RETIRED_DIRECT_EXTENSION_ACTIONS = [
  'start1688TrendCollection',
  'get1688TrendCollectionStatus',
  'cancel1688TrendCollection',
  'startTiktokCcCollection',
  'getTiktokCcCollectionStatus',
  'cancelTiktokCcCollection',
  'collectLiveCommerceUrl',
];

// These calls used to bypass OperationRun creation from an approved web
// origin. They are intentionally checked only inside an external-message
// listener, so the exact browser-operation handlers may continue to use the
// underlying collectors.
const RETIRED_EXTERNAL_SOURCE_BRIDGES = [
  ['searchWingCatalogProducts', 'searchWingCatalogProducts'],
  ['searchCoupangKeywordSuggestions', 'searchCoupangKeywordSuggestions'],
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

function findTopLevelComma(source) {
  const expectedClosers = [];
  let quote = null;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < source.length; index += 1) {
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
    if (current === '(') expectedClosers.push(')');
    else if (current === '[') expectedClosers.push(']');
    else if (current === '{') expectedClosers.push('}');
    else if (current === expectedClosers.at(-1)) expectedClosers.pop();
    else if (current === ',' && expectedClosers.length === 0) return index;
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
    if (afterArrow.startsWith('{')) {
      const bodyEnd = findMatchingDelimiter(afterArrow, 0, '{', '}');
      if (bodyEnd === -1) continue;
      bodies.push(afterArrow.slice(1, bodyEnd));
      continue;
    }
    const comma = findTopLevelComma(afterArrow);
    const expression = afterArrow.slice(0, comma === -1 ? undefined : comma).trim();
    if (expression) bodies.push(expression);
  }
  return bodies;
}

function collectionOperationBindings(source) {
  const objectBindings = [];
  const startBindings = [];
  const pattern = /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*useSourcingOperationAction\s*\(/g;
  let match;
  while ((match = pattern.exec(source))) objectBindings.push(match[1]);

  // Documented scope: a direct `start` destructure (optionally aliased) from
  // this hook. Nested/computed patterns require a parser and are not inferred.
  const destructured = /\b(?:const|let)\s+\{([^{}]*)\}\s*=\s*useSourcingOperationAction\s*\(/g;
  while ((match = destructured.exec(source))) {
    for (const binding of match[1].split(',')) {
      const parsed = /^\s*start\s*(?::\s*([A-Za-z_$][\w$]*))?\s*$/.exec(binding);
      if (parsed) startBindings.push(parsed[1] ?? 'start');
    }
  }
  return { objectBindings, startBindings };
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
  ) || RETIRED_DIRECT_EXTENSION_HELPERS.some((helper) =>
    new RegExp(`\\bimport\\s*\\{[^}]*\\b${helper}\\b[^}]*\\}`).test(source),
  );
}

function hasRetiredExtensionAction(source) {
  return RETIRED_DIRECT_EXTENSION_ACTIONS.some((action) =>
    new RegExp(`\\baction\\s*:\\s*['\"]${action}['\"]`).test(source),
  );
}

function hasDirect1688Execution(source) {
  if (!/Sourcing1688(?:Keyword|Image)SearchService/.test(source)) return false;
  return /\bthis\.[A-Za-z_$][\w$]*\.(?:searchForOperation|searchByKeyword|searchByImage|resolveTargets|detect)\s*\(/.test(source);
}

function hasLegacyDirectCollectionPost(source) {
  return [
    ['taobao/collect', 'collectTaobao'],
    ['1688-results', 'ingest1688ExtensionResults'],
    ['tiktok-cc-results', 'ingestTiktokCcResults'],
    ['live-commerce-results', 'ingestExtension'],
  ].some(([route, method]) =>
    new RegExp(`@Post\\s*\\(\\s*['\"]${route}['\"]\\s*\\)`).test(source)
      && new RegExp(`\\bthis\\.[A-Za-z_$][\\w$]*\\.${method}\\s*\\(`).test(source),
  );
}

function externalMessageListenerBodies(source) {
  const bodies = [];
  const pattern = /\bchrome\.runtime\.onMessageExternal\.addListener\s*\(/g;
  let match;
  while ((match = pattern.exec(source))) {
    const opening = source.indexOf('(', match.index);
    const closing = findMatchingDelimiter(source, opening, '(', ')');
    if (closing === -1) continue;
    bodies.push(source.slice(opening + 1, closing));
  }
  return bodies;
}

function hasRetiredExternalSourceBridge(source) {
  return externalMessageListenerBodies(source).some((listener) =>
    RETIRED_EXTERNAL_SOURCE_BRIDGES.some(([action, helper]) =>
      new RegExp(`\\b(?:msg|message)\\.action\\s*===\\s*['\"]${action}['\"]`).test(listener)
        && hasCall(listener, helper),
    ),
  );
}

export function analyzeSourcingLongRunningActions({
  webSources,
  sourcingServerSources,
  extensionSources = [],
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

    const helper = RETIRED_DIRECT_EXTENSION_HELPERS.find((candidate) =>
      hasCall(file.source, candidate),
    );
    if (helper || hasRetiredExtensionAction(file.source)) {
      findings.push(finding(
        'retired_direct_extension_call',
        file.path,
        helper
          ? `Retired direct collection helper ${helper} may not be called.`
          : 'Retired direct collection extension actions may not be dispatched.',
      ));
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
      const startsOperation = operationBindings.objectBindings.some((binding) =>
        new RegExp(`\\b${binding}\\.start\\s*\\(`).test(effectBody),
      ) || operationBindings.startBindings.some((binding) =>
        hasCall(effectBody, binding),
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
    if (file.path.includes('/adapter/in/http/') && hasLegacyDirectCollectionPost(file.source)) {
      findings.push(finding(
        'legacy_direct_collection_post',
        file.path,
        'Collection starts and owner ingest must use fixed Operations routes, not legacy direct POST endpoints.',
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

  for (const file of extensionSources) {
    if (hasRetiredExternalSourceBridge(file.source)) {
      findings.push(finding(
        'retired_external_source_collection_bridge',
        file.path,
        'Approved web origins may start sourcing only through an exact OperationRun, never a direct external collector action.',
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
    extensionSources: [{
      path: 'extensions/kiditem-os/background/coupang/worker.js',
      source: readFileSync(
        path.join(root, 'extensions/kiditem-os/background/coupang/worker.js'),
        'utf8',
      ),
    }],
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
