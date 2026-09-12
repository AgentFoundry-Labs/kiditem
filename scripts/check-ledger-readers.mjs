#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_EXTENSIONS = new Set([
  '.cjs',
  '.js',
  '.jsx',
  '.mjs',
  '.sql',
  '.ts',
  '.tsx',
]);
const PRISMA_READ_METHODS =
  'findMany|findFirst|findFirstOrThrow|findUnique|findUniqueOrThrow|aggregate|groupBy|count';
const RETIRED_LISTING_AD_WRITERS = new Set([
  'apps/server/src/advertising/adapter/out/repository/channel-listing-daily.repository.adapter.ts',
  'apps/server/src/advertising/adapter/out/repository/ad-traffic-source.repository.ts',
  'apps/server/src/analytics/traffic/traffic-upload.ts',
]);
const RETIRED_LISTING_AD_READER = 'apps/server/src/common/ad-window-facts.ts';

function slash(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseArguments(argv) {
  let root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let requireNoLegacy = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--root') {
      const value = argv[index + 1];
      if (!value) throw new Error('--root requires a path');
      root = path.resolve(value);
      index += 1;
    } else if (argument === '--require-no-legacy') {
      requireNoLegacy = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return { root, requireNoLegacy };
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function validateRelativePath(root, value, label) {
  const relativePath = slash(requireString(value, label));
  if (
    path.isAbsolute(relativePath) ||
    relativePath === '..' ||
    relativePath.startsWith('../')
  ) {
    throw new Error(
      `${label} must stay inside the repository: ${relativePath}`,
    );
  }
  if (!existsSync(path.join(root, relativePath))) {
    throw new Error(`${label} does not exist: ${relativePath}`);
  }
  return relativePath;
}

function validateManifest(root, input) {
  if (!input || input.version !== 1)
    throw new Error('ledger reader manifest version must be 1');
  if (!Array.isArray(input.scanRoots) || input.scanRoots.length === 0) {
    throw new Error('ledger reader manifest needs at least one scanRoot');
  }
  if (!Array.isArray(input.ledgers) || input.ledgers.length === 0) {
    throw new Error('ledger reader manifest needs at least one ledger');
  }

  const scanRoots = input.scanRoots.map((entry, index) =>
    validateRelativePath(root, entry, `scanRoots[${index}]`),
  );
  const tables = new Set();
  const prismaModels = new Set();
  const ledgers = input.ledgers.map((entry, ledgerIndex) => {
    const prefix = `ledgers[${ledgerIndex}]`;
    const name = requireString(entry?.name, `${prefix}.name`);
    const table = requireString(entry?.table, `${prefix}.table`);
    const prismaModel = requireString(
      entry?.prismaModel,
      `${prefix}.prismaModel`,
    );
    const reader = validateRelativePath(
      root,
      entry?.reader,
      `${prefix}.reader`,
    );
    if (tables.has(table)) throw new Error(`duplicate ledger table: ${table}`);
    if (prismaModels.has(prismaModel))
      throw new Error(`duplicate Prisma ledger model: ${prismaModel}`);
    tables.add(table);
    prismaModels.add(prismaModel);

    const ownerPublications = (entry.ownerPublications ?? []).map(
      (publication, index) => ({
        path: validateRelativePath(
          root,
          publication?.path,
          `${prefix}.ownerPublications[${index}].path`,
        ),
        reason: requireString(
          publication?.reason,
          `${prefix}.ownerPublications[${index}].reason`,
        ),
      }),
    );
    const legacyReaders = (entry.legacyReaders ?? []).map((legacy, index) => {
      const removeWith = requireString(
        legacy?.removeWith,
        `${prefix}.legacyReaders[${index}].removeWith`,
      );
      if (!/^KID-\d+$/.test(removeWith)) {
        throw new Error(
          `${prefix}.legacyReaders[${index}].removeWith must be a KID issue`,
        );
      }
      return {
        path: validateRelativePath(
          root,
          legacy?.path,
          `${prefix}.legacyReaders[${index}].path`,
        ),
        removeWith,
        reason: requireString(
          legacy?.reason,
          `${prefix}.legacyReaders[${index}].reason`,
        ),
      };
    });

    const allowedPaths = [
      reader,
      ...ownerPublications.map((publication) => publication.path),
      ...legacyReaders.map((legacy) => legacy.path),
    ];
    if (new Set(allowedPaths).size !== allowedPaths.length) {
      throw new Error(
        `${prefix} declares the same allowed path more than once`,
      );
    }
    return {
      name,
      table,
      prismaModel,
      reader,
      ownerPublications,
      legacyReaders,
    };
  });

  return { scanRoots, ledgers };
}

function listSourceFiles(root, scanRoots) {
  const files = [];
  const visit = (absoluteDirectory) => {
    for (const entry of readdirSync(absoluteDirectory, {
      withFileTypes: true,
    })) {
      const absolutePath = path.join(absoluteDirectory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (
        entry.isFile() &&
        SOURCE_EXTENSIONS.has(path.extname(entry.name))
      ) {
        files.push(slash(path.relative(root, absolutePath)));
      }
    }
  };
  for (const scanRoot of scanRoots) visit(path.join(root, scanRoot));
  return files.sort();
}

function isTestOrSeed(relativePath) {
  return (
    /(^|\/)(__tests__|test-helpers|seeds?)(\/|$)/.test(relativePath) ||
    /\.(spec|test|seed)\.[^.]+$/.test(relativePath)
  );
}

function detectReads(source, ledger) {
  const reads = [];
  const prismaPattern = new RegExp(
    `\\b${escapeRegExp(ledger.prismaModel)}\\s*\\.\\s*(${PRISMA_READ_METHODS})\\s*\\(`,
    'm',
  );
  if (prismaPattern.test(source)) reads.push('Prisma read');

  const rawSqlPattern = new RegExp(
    `\\b(?:from|join)\\s+(?:"?[A-Za-z_][A-Za-z0-9_]*"?\\.)?"?${escapeRegExp(ledger.table)}"?\\b`,
    'im',
  );
  if (rawSqlPattern.test(source)) reads.push('raw SQL read');
  return reads;
}

// These negative rules came from check-listing-day-ad-reader.sh. The listing
// table is a dead advertising rollup rather than a ledger, so it does not
// belong in the ledger inventory, but its reads stay forbidden until cutover.
function detectRetiredListingAdReads(source) {
  const reads = [];
  if (/\b(?:adCoverageStatus|trafficCoverageStatus)\b/.test(source)) {
    reads.push('retired coverage-status read');
  }
  if (
    new RegExp(
      `\\bchannelListingDailySnapshots?\\s*\\.\\s*(?:${PRISMA_READ_METHODS})\\s*\\([^;]*?\\bad(?:Spend|Revenue|Impressions|Clicks|Conversions|Orders)\\b`,
      'ms',
    ).test(source)
  ) {
    reads.push('retired Prisma read');
  }
  if (
    /(?:\b(?:from|join)\s+"?channel_listing_daily_snapshots"?\b[^;]*?\bad_(?:spend|revenue|impressions|clicks|conversions|orders)\b|\bad_(?:spend|revenue|impressions|clicks|conversions|orders)\b[^;]*?\b(?:from|join)\s+"?channel_listing_daily_snapshots"?\b)/ims.test(
      source,
    )
  ) {
    reads.push('retired raw SQL read');
  }
  return reads;
}

export function inspectLedgerReaders({
  root,
  manifest,
  requireNoLegacy = false,
}) {
  const violations = [];
  const legacyViolations = [];
  const files = listSourceFiles(root, manifest.scanRoots).filter(
    (file) => !isTestOrSeed(file),
  );

  for (const ledger of manifest.ledgers) {
    const allowed = new Set([
      ledger.reader,
      ...ledger.ownerPublications.map((publication) => publication.path),
      ...ledger.legacyReaders.map((legacy) => legacy.path),
    ]);
    for (const file of files) {
      if (allowed.has(file)) continue;
      const source = readFileSync(path.join(root, file), 'utf8');
      for (const kind of detectReads(source, ledger)) {
        violations.push({
          file,
          kind,
          ledger: ledger.name,
          reader: ledger.reader,
        });
      }
    }
    if (requireNoLegacy) {
      for (const legacy of ledger.legacyReaders) {
        legacyViolations.push({ ...legacy, ledger: ledger.name });
      }
    }
  }

  for (const file of files) {
    if (RETIRED_LISTING_AD_WRITERS.has(file)) continue;
    const source = readFileSync(path.join(root, file), 'utf8');
    for (const kind of detectRetiredListingAdReads(source)) {
      violations.push({
        file,
        kind,
        ledger: 'retired listing-day advertising fields',
        reader: RETIRED_LISTING_AD_READER,
      });
    }
  }

  return { violations, legacyViolations };
}

export function loadManifest(root) {
  const manifestPath = path.join(root, 'scripts/ledger-readers.json');
  const input = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return validateManifest(root, input);
}

function main() {
  let options;
  let manifest;
  try {
    options = parseArguments(process.argv.slice(2));
    manifest = loadManifest(options.root);
  } catch (error) {
    console.error(`check:ledger-readers FAIL: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const result = inspectLedgerReaders({ ...options, manifest });
  if (result.violations.length > 0 || result.legacyViolations.length > 0) {
    console.error('check:ledger-readers FAIL');
    for (const violation of result.violations) {
      console.error(
        `${violation.file}: ${violation.kind} of ${violation.ledger}; use ${violation.reader}`,
      );
    }
    for (const legacy of result.legacyViolations) {
      console.error(
        `${legacy.path}: legacy reader of ${legacy.ledger}; remove with ${legacy.removeWith} (${legacy.reason})`,
      );
    }
    process.exitCode = 1;
    return;
  }

  const ledgerCount = manifest.ledgers.length;
  const legacyCount = manifest.ledgers.reduce(
    (count, ledger) => count + ledger.legacyReaders.length,
    0,
  );
  console.log(
    `check:ledger-readers PASS (${ledgerCount} ledger${ledgerCount === 1 ? '' : 's'}, ${legacyCount} legacy reader${legacyCount === 1 ? '' : 's'})`,
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main();
}
