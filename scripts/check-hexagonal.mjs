import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { builtinModules } from 'node:module';

// Channels nests domain/ and application/service/ by these business areas.
// Sourcing and content (KID-310) do not commit to the same area-nesting
// convention — most of their domain/application/service files sit flat, one
// file per concern — so this allowlist stays scoped to channels only; forcing
// it on the other two domains would flag their legitimate flat files.
const channelsAreas = new Set(['account', 'sales-product', 'registration', 'listing', 'collection']);
const builtins = new Set(builtinModules.map(name => name.replace(/^node:/, '')));

// KID-310 retired these as top-level domain-root lanes: channels/sourcing's
// read/ absorbed into adapter/out/{persistence,repository}, content's mapper/
// absorbed into domain/. A bare top-level service/ (sibling to adapter/,
// application/, domain/) is the pre-hexagonal shape; application/service/ is
// the correct nested location and is not matched by this check.
// KID-311 vacated the flat controllers/, services/ and dto/ lanes in orders,
// finance, advertising and products; they are retired for every scanned
// domain so a vacated folder cannot silently return.
const RETIRED_TOP_LEVEL_DIRS = new Set(['read', 'mapper', 'service', 'controllers', 'services', 'dto']);
const HEXAGONAL_DOMAINS = ['channels', 'sourcing', 'content', 'orders', 'finance', 'advertising', 'products', 'analytics'];

// KID-311: pure-layer adapter imports that predate an owner's move into the
// scanner. Each entry allows exactly one { file, specifier } pair (file is
// relative to apps/server/src) until the ticket in removeWith deletes it; an
// entry whose violation no longer occurs fails as stale.
export const KNOWN_VIOLATIONS = [
  // Orders services read their own ledger helpers directly until the read port lands.
  { owner: 'orders', file: 'orders/application/service/orders.service.ts', specifier: '../../adapter/out/persistence/read/order-facts.reader', removeWith: 'KID-334' },
  { owner: 'orders', file: 'orders/application/service/return-transfers/return-transfers.service.ts', specifier: '../../../adapter/out/persistence/read/order-facts.reader', removeWith: 'KID-334' },
  { owner: 'orders', file: 'orders/application/service/reviews.service.ts', specifier: '../../adapter/out/persistence/read/review-facts.reader', removeWith: 'KID-334' },
  { owner: 'orders', file: 'orders/application/service/reviews.service.ts', specifier: '../../adapter/out/persistence/read/order-facts.reader', removeWith: 'KID-334' },
  // Orders services take incoming DTOs and Products adapters until KID-335.
  { owner: 'orders', file: 'orders/application/service/return-transfers/return-transfers.service.ts', specifier: '../../../adapter/in/web/return-transfers/dto', removeWith: 'KID-335' },
  { owner: 'orders', file: 'orders/application/service/reviews.service.ts', specifier: '../../adapter/in/web/dto/list-reviews.dto', removeWith: 'KID-335' },
  { owner: 'orders', file: 'orders/application/service/reviews.service.ts', specifier: '../../adapter/in/web/dto/list-review-items.dto', removeWith: 'KID-335' },
  { owner: 'orders', file: 'orders/application/service/reviews.service.ts', specifier: '../../../products/adapter/out/persistence/product-transactional-read.repository.adapter', removeWith: 'KID-335' },
  { owner: 'orders', file: 'orders/application/service/reviews.service.ts', specifier: '../../../products/adapter/out/persistence/read/product-abc-publication.reader', removeWith: 'KID-335' },
  // Finance services read settlement and Orders ledger helpers until KID-334.
  { owner: 'finance', file: 'finance/application/service/settlement/settlements.service.ts', specifier: '../../../adapter/out/persistence/read/settlement/settlement-facts', removeWith: 'KID-334' },
  { owner: 'finance', file: 'finance/application/service/sales-analysis/sales-analysis-scraper.service.ts', specifier: '../../../../orders/adapter/out/persistence/read/order-facts.reader', removeWith: 'KID-334' },
  { owner: 'finance', file: 'finance/application/service/sales-analysis/sales-analysis-scraper.service.ts', specifier: '../../../../advertising/adapter/out/persistence/read/ad-target-facts', removeWith: 'KID-334' },
  // Finance services take incoming DTOs until KID-335.
  { owner: 'finance', file: 'finance/application/service/report-export/finance-report-export.service.ts', specifier: '../../../adapter/in/web/report-export/dto/report-export-query.dto', removeWith: 'KID-335' },
  { owner: 'finance', file: 'finance/application/service/report-export/finance-report-export.service.ts', specifier: '../../../adapter/in/web/report-export/dto/profit-loss-export-query.dto', removeWith: 'KID-335' },
  { owner: 'finance', file: 'finance/application/service/sales-plan/sales-plans.service.ts', specifier: '../../../adapter/in/web/sales-plan/dto', removeWith: 'KID-335' },
  { owner: 'finance', file: 'finance/application/service/settlement/settlements.service.ts', specifier: '../../../adapter/in/web/settlement/dto', removeWith: 'KID-335' },
  { owner: 'finance', file: 'finance/application/service/supplier-payment/supplier-payments.service.ts', specifier: '../../../adapter/in/web/supplier-payment/dto', removeWith: 'KID-335' },
  // Advertising outgoing ports take read-helper types until KID-334.
  { owner: 'advertising', file: 'advertising/application/port/out/repository/ad-action.repository.port.ts', specifier: '../../../../adapter/out/persistence/read/ad-action-execution', removeWith: 'KID-334' },
  { owner: 'advertising', file: 'advertising/application/port/out/repository/keyword-rank.repository.port.ts', specifier: '../../../../adapter/out/persistence/read/keyword-rank-facts', removeWith: 'KID-334' },
  // Advertising services take incoming DTOs until KID-335.
  { owner: 'advertising', file: 'advertising/application/service/ad-export.service.ts', specifier: '../../adapter/in/http/dto/ad-export.dto', removeWith: 'KID-335' },
  { owner: 'advertising', file: 'advertising/application/service/ad-strategy.service.ts', specifier: '../../adapter/in/http/dto/register-campaign.dto', removeWith: 'KID-335' },
  { owner: 'advertising', file: 'advertising/application/service/keyword-rank-ingest.handler.ts', specifier: '../../adapter/in/http/dto', removeWith: 'KID-335' },
  // Products outgoing port takes the ABC publication read type until KID-334.
  { owner: 'products', file: 'products/application/port/out/persistence/master-product-abc.repository.port.ts', specifier: '../../../../adapter/out/persistence/read/product-abc-publication.reader', removeWith: 'KID-334' },
  // Products categories service takes incoming DTOs until KID-335.
  { owner: 'products', file: 'products/application/service/category/categories.service.ts', specifier: '../../../adapter/in/web/category/dto', removeWith: 'KID-335' },
  // Analytics statistics and supplier-stats services read the Orders ledger helper until KID-334.
  { owner: 'analytics', file: 'analytics/application/service/statistics/statistics.service.ts', specifier: '../../../../orders/adapter/out/persistence/read/order-facts.reader', removeWith: 'KID-334' },
  { owner: 'analytics', file: 'analytics/application/service/supplier-stats/supplier-stats.service.ts', specifier: '../../../../orders/adapter/out/persistence/read/order-facts.reader', removeWith: 'KID-334' },
];

// Every entry must name a scanned owner, a file under that owner, a non-empty
// specifier and a KID ticket that deletes it; duplicates are refused. An
// entry that fails this shape would otherwise pass silently (KID-311 review).
export function knownViolationShapeErrors(known) {
  const errors = [];
  const seen = new Set();
  known.forEach((entry, index) => {
    const label = `KNOWN_VIOLATIONS[${index}]`;
    if (!HEXAGONAL_DOMAINS.includes(entry.owner)) errors.push(`${label}: owner ${JSON.stringify(entry.owner)} is not a scanned domain`);
    else if (typeof entry.file !== 'string' || !entry.file.startsWith(`${entry.owner}/`)) errors.push(`${label}: file must start with ${entry.owner}/`);
    if (typeof entry.specifier !== 'string' || entry.specifier === '') errors.push(`${label}: specifier is required`);
    if (!/^KID-\d+$/.test(entry.removeWith ?? '')) errors.push(`${label}: removeWith must be KID-<n>`);
    const key = `${entry.file} -> ${entry.specifier}`;
    if (seen.has(key)) errors.push(`${label}: duplicate entry ${key}`);
    seen.add(key);
  });
  return errors;
}

function domainOwner(file) {
  for (const owner of HEXAGONAL_DOMAINS) {
    if (file === owner || file.startsWith(`${owner}/`) || file.includes(`/${owner}/`)) return owner;
  }
  return null;
}

export function hexagonalBoundaryViolations(file, source) {
  return hexagonalFindings(file, source).map(finding => finding.reason);
}

function hexagonalFindings(file, source) {
  if (!file.endsWith('.ts') || file.endsWith('.spec.ts')) return [];
  const findings = [];
  const reject = reason => findings.push({ reason });
  const owner = domainOwner(file);
  const pure = /\/(domain|application)\//.test(file);
  if (pure) {
    // adapter→port direction (KID-310): a pure domain/application file must
    // never import a concrete adapter — ports depend on nothing, adapters
    // depend on ports, never the reverse. Verified zero pre-existing hits in
    // sourcing/content, so this narrow rule is safe to apply to all three.
    for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g)) {
      if (/(?:^|\/)adapter(?:\/|$)/.test(match[1])) findings.push({ reason: `Pure layer imports a concrete adapter: ${match[1]}`, specifier: match[1] });
    }
    // Channels keeps its existing persistence/provider IO boundary. NestJS
    // imports are allowed: framework independence is not a business boundary.
    // Extending the IO checks to other owners is outside this scanner's scope.
    if (owner === 'channels') {
      for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g)) {
        const dependency = match[1];
        if (dependency.startsWith('@prisma/')
          || dependency.startsWith('node:') || builtins.has(dependency)
          || ['xlsx', 'exceljs', 'pg'].includes(dependency)) reject(`IO import: ${dependency}`);
      }
      if (/\b(?:Buffer|process)\b/.test(source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ''))) reject('Node global in pure layer');
    }
  }
  // Incoming adapters bypassing input ports, and adapter/in/http naming, stay
  // channels-only for the same reason: real pre-existing debt in sourcing's
  // adapter/in/http and agent capability adapters, unrelated to KID-310.
  if (owner === 'channels' && file.includes('/adapter/in/')) {
    for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g)) {
      if (/application\/(?:service|usecase|port\/out)\//.test(match[1])) reject('Incoming adapters use application input ports');
    }
  }
  if (owner === 'channels') {
    const domain = file.split('/domain/')[1];
    if (domain && !channelsAreas.has(domain.split('/')[0]) && !['capability', 'exception'].includes(domain.split('/')[0])) reject('Domain must belong to a business area');
    const service = file.split('/application/service/')[1];
    if (service && !channelsAreas.has(service.split('/')[0])) reject('Service must belong to a business area');
    if (file.includes('/adapter/in/http/')) reject('Use adapter/in/web');
  }
  // Retired usecase directory and marketplace separation: zero pre-existing
  // hits in sourcing/content, safe to apply to all three domains.
  if (file.includes('/application/usecase/')) reject('Retired usecase directory');
  if (file.includes('/marketplace/')) reject('Separate marketplace business domain');
  if (owner) {
    const topLevelMatch = file.match(new RegExp(`(?:^|/)${owner}/([^/]+)/`));
    if (topLevelMatch && RETIRED_TOP_LEVEL_DIRS.has(topLevelMatch[1])) {
      reject(`Retired top-level ${topLevelMatch[1]}/ lane (KID-310) — use adapter/out or domain/`);
    }
  }
  return findings;
}

// entries: [{ file, source }] with file relative to apps/server/src.
export function evaluateHexagonal(entries, known = KNOWN_VIOLATIONS) {
  const used = new Set();
  const errors = knownViolationShapeErrors(known);
  for (const { file, source } of entries) {
    for (const finding of hexagonalFindings(file, source)) {
      const index = finding.specifier === undefined ? -1 : known.findIndex(entry =>
        entry.owner === domainOwner(file) && entry.file === file && entry.specifier === finding.specifier);
      if (index >= 0) used.add(index);
      else errors.push(`${file}: ${finding.reason}`);
    }
  }
  known.forEach((entry, index) => {
    if (!used.has(index)) errors.push(`Stale KNOWN_VIOLATIONS entry (removeWith ${entry.removeWith}): ${entry.file} -> ${entry.specifier}`);
  });
  return errors;
}

export function scanHexagonalDomains(roots, serverSrc, known = KNOWN_VIOLATIONS) {
  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
  const entries = roots.flatMap(root => walk(root).map(file => ({
    file: path.relative(serverSrc, file).split(path.sep).join('/'),
    source: readFileSync(file, 'utf8'),
  })));
  return evaluateHexagonal(entries, known);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const serverSrc = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../apps/server/src');
  const roots = HEXAGONAL_DOMAINS.map(name => path.join(serverSrc, name));
  const violations = scanHexagonalDomains(roots, serverSrc);
  if (violations.length) { console.error(violations.join('\n')); process.exitCode = 1; }
  else console.log('PASS: Channels/Sourcing/Content/Orders/Finance/Advertising/Products/Analytics domain, application and business directories preserve hexagonal boundaries.');
}
