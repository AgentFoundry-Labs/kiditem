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
  { owner: 'orders', file: 'orders/application/service/reviews.service.ts', specifier: '../../../products/adapter/out/persistence/product-transactional-read.repository', removeWith: 'KID-335' },
  { owner: 'orders', file: 'orders/application/service/reviews.service.ts', specifier: '../../../products/adapter/out/persistence/read/product-abc-publication.reader', removeWith: 'KID-335' },
  // Finance services read settlement and Orders ledger helpers until KID-334.
  { owner: 'finance', file: 'finance/application/service/settlement/settlements.service.ts', specifier: '../../../adapter/out/persistence/read/settlement/settlement-facts', removeWith: 'KID-334' },
  { owner: 'finance', file: 'finance/application/service/sales-analysis/sales-analysis-scraper.service.ts', specifier: '../../../../orders/adapter/out/persistence/read/order-facts.reader', removeWith: 'KID-334' },
  // Finance services take incoming DTOs until KID-335.
  { owner: 'finance', file: 'finance/application/service/report-export/finance-report-export.service.ts', specifier: '../../../adapter/in/web/report-export/dto/report-export-query.dto', removeWith: 'KID-335' },
  { owner: 'finance', file: 'finance/application/service/report-export/finance-report-export.service.ts', specifier: '../../../adapter/in/web/report-export/dto/profit-loss-export-query.dto', removeWith: 'KID-335' },
  { owner: 'finance', file: 'finance/application/service/sales-plan/sales-plans.service.ts', specifier: '../../../adapter/in/web/sales-plan/dto', removeWith: 'KID-335' },
  { owner: 'finance', file: 'finance/application/service/settlement/settlements.service.ts', specifier: '../../../adapter/in/web/settlement/dto', removeWith: 'KID-335' },
  { owner: 'finance', file: 'finance/application/service/supplier-payment/supplier-payments.service.ts', specifier: '../../../adapter/in/web/supplier-payment/dto', removeWith: 'KID-335' },
  // Advertising outgoing ports take read-helper types until KID-334.
  { owner: 'advertising', file: 'advertising/application/port/out/repository/keyword-rank.repository.port.ts', specifier: '../../../../adapter/out/persistence/read/keyword-rank-facts', removeWith: 'KID-334' },
  // Advertising services take incoming DTOs until KID-335.
  { owner: 'advertising', file: 'advertising/application/service/ad-export.service.ts', specifier: '../../adapter/in/http/dto/ad-export.dto', removeWith: 'KID-335' },
  { owner: 'advertising', file: 'advertising/application/service/ad-strategy.service.ts', specifier: '../../adapter/in/http/dto/register-campaign.dto', removeWith: 'KID-335' },
  { owner: 'advertising', file: 'advertising/application/service/keyword-rank-ingest.handler.ts', specifier: '../../adapter/in/http/dto', removeWith: 'KID-335' },
  // Products outgoing port takes the ABC publication read type until KID-334.
  { owner: 'products', file: 'products/application/port/out/repository/master-product-abc.repository.port.ts', specifier: '../../../../adapter/out/persistence/read/product-abc-publication.reader', removeWith: 'KID-334' },
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
      // 실행 계약(ADR-0025)의 owner 포트는 owner가 구현하는 계약이다 — 채널 자신의 port/out이 아니다(KID-354).
      if (/(?:^|\/)common\/operation\/application\/port\/out\/owner\//.test(match[1])) continue;
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
// KID-324: another owner is reachable only through its public incoming ports
// (`application/port/in/**`). Its adapters, domain, application services,
// read/ helpers and root transaction/ functions are internals. Module files
// and other root contracts stay importable; the shared kernel (common, prisma,
// types, core, test-helpers) is not an owner. Tests, test helpers and the
// src-root composition files are not scanned.
const SHARED_KERNEL = new Set(['common', 'prisma', 'types', 'core', 'test-helpers']);
const OWNER_INTERNALS = /^(?:adapter|domain|transaction)(?:\/|$)|^application\/service(?:\/|$)|(?:^|\/)read(?:\/|$)/;
const IMPORT_SPECIFIER = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)['"](\.[^'"]+)['"]/g;

// Existing cross-owner imports of another owner's internals. Each entry allows
// exactly one { from, to } pair (paths relative to apps/server/src, `to`
// without extension) until the ticket in removeWith deletes it; a stale entry
// fails. Adding an entry is not a way to allow a new import.
export const CROSS_OWNER_EXCEPTIONS = [
  { from: 'advertising/adapter/out/persistence/ad-action-operation.repository.ts', to: 'channels/domain/account/coupang-account-identity', removeWith: 'KID-398', reason: '다른 owner domain 순수 함수 직접 import — shared 또는 제공자 포트로' },
  { from: 'advertising/adapter/out/persistence/ad-action.repository.ts', to: 'products/adapter/out/persistence/read/product-abc-publication.reader', removeWith: 'KID-324' },
  { from: 'advertising/adapter/out/persistence/ad-listing.repository.ts', to: 'products/adapter/out/persistence/read/product-abc-publication.reader', removeWith: 'KID-324' },
  { from: 'advertising/adapter/out/persistence/ad-report-operation.repository.ts', to: 'channels/domain/account/coupang-account-identity', removeWith: 'KID-398', reason: '다른 owner domain 순수 함수 직접 import — shared 또는 제공자 포트로' },
  { from: 'advertising/adapter/out/persistence/ad-strategy-context.repository.ts', to: 'products/adapter/out/persistence/read/product-abc-publication.reader', removeWith: 'KID-324' },
  { from: 'advertising/adapter/out/persistence/keyword-rank.repository.ts', to: 'products/adapter/out/persistence/read/product-abc-publication.reader', removeWith: 'KID-324' },
  { from: 'advertising/adapter/out/persistence/wing-itemwinner-operation.repository.ts', to: 'channels/domain/account/coupang-account-identity', removeWith: 'KID-398', reason: '다른 owner domain 순수 함수 직접 import — shared 또는 제공자 포트로' },
  { from: 'advertising/adapter/out/persistence/wing-traffic-operation.repository.ts', to: 'channels/domain/account/coupang-account-identity', removeWith: 'KID-398', reason: '다른 owner domain 순수 함수 직접 import — shared 또는 제공자 포트로' },
  { from: 'advertising/application/service/ad-grade-rules.service.ts', to: 'channels/domain/account/channel-account-sales-costs', removeWith: 'KID-398', reason: '다른 owner domain 순수 함수 직접 import — shared 또는 제공자 포트로' },
  { from: 'advertising/domain/wing-traffic-omission.ts', to: 'channels/domain/registration/wing-listing-registration', removeWith: 'KID-398', reason: '다른 owner domain 순수 함수 직접 import — shared 또는 제공자 포트로' },
  { from: 'analytics/adapter/out/persistence/dashboard/dashboard-inventory.repository.ts', to: 'channels/domain/listing/listing-product-summary', removeWith: 'KID-398', reason: '다른 owner domain 순수 함수 직접 import — shared 또는 제공자 포트로' },
  { from: 'analytics/adapter/out/persistence/dashboard/dashboard-inventory.repository.ts', to: 'products/adapter/out/persistence/read/product-abc-publication.reader', removeWith: 'KID-324' },
  { from: 'analytics/adapter/out/persistence/dashboard/dashboard-inventory.repository.ts', to: 'orders/adapter/out/persistence/read/review-facts.reader', removeWith: 'KID-324' },
  { from: 'analytics/adapter/out/persistence/dashboard/dashboard-sales.repository.ts', to: 'orders/adapter/out/persistence/read/order-facts.reader', removeWith: 'KID-324' },
  { from: 'analytics/adapter/out/persistence/dashboard/dashboard-trend.repository.ts', to: 'orders/adapter/out/persistence/read/order-facts.reader', removeWith: 'KID-324' },
  { from: 'analytics/adapter/out/persistence/dashboard/profit-calculation.repository.ts', to: 'orders/adapter/out/persistence/read/order-facts.reader', removeWith: 'KID-324' },
  { from: 'analytics/adapter/out/persistence/dashboard/profit-calculation.repository.ts', to: 'advertising/domain/ad-spend-rule', removeWith: 'KID-398', reason: '다른 owner domain 순수 함수 직접 import — shared 또는 제공자 포트로' },
  { from: 'analytics/adapter/out/persistence/dashboard/profit-calculation.repository.ts', to: 'products/domain/option-pricing-resolver', removeWith: 'KID-398', reason: '다른 owner domain 순수 함수 직접 import — shared 또는 제공자 포트로' },
  { from: 'analytics/adapter/out/persistence/dashboard/wing-traffic-aggregation.repository.ts', to: 'channels/domain/listing/observation-facts', removeWith: 'KID-398', reason: '다른 owner domain 순수 함수 직접 import — shared 또는 제공자 포트로' },
  { from: 'analytics/adapter/out/persistence/dashboard/wing-traffic-aggregation.repository.ts', to: 'advertising/domain/ad-spend-rule', removeWith: 'KID-398', reason: '다른 owner domain 순수 함수 직접 import — shared 또는 제공자 포트로' },
  { from: 'analytics/adapter/out/persistence/dashboard/wing-traffic-aggregation.repository.ts', to: 'orders/adapter/out/persistence/read/order-facts.reader', removeWith: 'KID-324' },
  { from: 'analytics/application/service/statistics/statistics.service.ts', to: 'orders/adapter/out/persistence/read/order-facts.reader', removeWith: 'KID-324' },
  { from: 'analytics/application/service/supplier-stats/supplier-stats.service.ts', to: 'orders/adapter/out/persistence/read/order-facts.reader', removeWith: 'KID-324' },
  { from: 'channels/adapter/out/persistence/channel-account.repository.ts', to: 'products/transaction/product-mapping-lock', removeWith: 'KID-394' },
  { from: 'channels/adapter/out/persistence/channel-catalog-import.repository.ts', to: 'products/transaction/product-mapping-lock', removeWith: 'KID-394' },
  { from: 'channels/adapter/out/persistence/channel-catalog-publication.repository.ts', to: 'products/transaction/product-mapping-lock', removeWith: 'KID-394' },
  { from: 'channels/adapter/out/persistence/channel-dashboard.repository.ts', to: 'orders/adapter/out/persistence/read/order-facts.reader', removeWith: 'KID-301' },
  { from: 'channels/adapter/out/persistence/channel-listing-daily-facts.ts', to: 'advertising/transaction/wing-traffic-coverage', removeWith: 'KID-395' },
  { from: 'channels/adapter/out/persistence/channel-option-recipe.repository.ts', to: 'products/transaction/product-mapping-lock', removeWith: 'KID-394' },
  { from: 'channels/adapter/out/persistence/channel-product-matching.repository.ts', to: 'products/transaction/product-mapping-lock', removeWith: 'KID-394' },
  { from: 'channels/adapter/out/persistence/mall-admin-listings.repository.ts', to: 'products/transaction/product-mapping-lock', removeWith: 'KID-394' },
  { from: 'channels/adapter/out/persistence/mall-publishing.repository.ts', to: 'orders/adapter/out/persistence/read/order-facts.reader', removeWith: 'KID-301' },
  { from: 'channels/adapter/out/persistence/sabangnet-mall-listings.repository.ts', to: 'products/transaction/product-mapping-lock', removeWith: 'KID-394' },
  { from: 'channels/adapter/out/persistence/sales-product.repository.ts', to: 'products/domain/option-pricing-resolver', removeWith: 'KID-398', reason: '다른 owner domain 순수 함수 직접 import — shared 또는 제공자 포트로' },
  { from: 'channels/adapter/out/persistence/stockout-check.repository.ts', to: 'products/transaction/product-mapping-lock', removeWith: 'KID-394' },
  { from: 'common/per-listing-profit.ts', to: 'advertising/domain/ad-spend-rule', removeWith: 'KID-398', reason: '다른 owner domain 순수 함수 직접 import — shared 또는 제공자 포트로' },
  { from: 'common/per-listing-profit.ts', to: 'advertising/domain/ad-sweep-coverage', removeWith: 'KID-398', reason: '다른 owner domain 순수 함수 직접 import — shared 또는 제공자 포트로' },
  { from: 'common/per-listing-profit.ts', to: 'products/domain/option-pricing-resolver', removeWith: 'KID-398', reason: '다른 owner domain 순수 함수 직접 import — shared 또는 제공자 포트로' },
  { from: 'common/per-listing-profit.ts', to: 'orders/adapter/out/persistence/read/order-facts.reader', removeWith: 'KID-324' },
  { from: 'common/per-listing-profit.ts', to: 'products/adapter/out/persistence/read/product-abc-publication.reader', removeWith: 'KID-324' },
  { from: 'content/adapter/out/persistence/thumbnail-generation-ledger.query.ts', to: 'products/adapter/out/persistence/read/product-abc-publication.reader', removeWith: 'KID-324' },
  { from: 'finance/adapter/out/persistence/master-product-contribution.repository.ts', to: 'advertising/domain/ad-spend-rule', removeWith: 'KID-398', reason: '다른 owner domain 순수 함수 직접 import — shared 또는 제공자 포트로' },
  { from: 'finance/adapter/out/persistence/master-product-contribution.repository.ts', to: 'analytics/sellpia-product-sales/read/sellpia-product-monthly-facts', removeWith: 'KID-324' },
  { from: 'finance/application/service/sales-analysis/sales-analysis-scraper.service.ts', to: 'orders/adapter/out/persistence/read/order-facts.reader', removeWith: 'KID-324' },
  { from: 'finance/application/service/sales-analysis/sales-analysis.service.ts', to: 'advertising/domain/ad-sweep-coverage', removeWith: 'KID-398', reason: '다른 owner domain 순수 함수 직접 import — shared 또는 제공자 포트로' },
  { from: 'finance/application/service/sales-analysis/sales-analysis.service.ts', to: 'advertising/domain/ad-spend-rule', removeWith: 'KID-398', reason: '다른 owner domain 순수 함수 직접 import — shared 또는 제공자 포트로' },
  { from: 'orders/adapter/out/persistence/rocket-po-catalog.repository.ts', to: 'products/transaction/product-mapping-lock', removeWith: 'KID-394' },
  { from: 'orders/application/service/reviews.service.ts', to: 'products/adapter/out/persistence/product-transactional-read.repository', removeWith: 'KID-324' },
  { from: 'orders/application/service/reviews.service.ts', to: 'products/adapter/out/persistence/read/product-abc-publication.reader', removeWith: 'KID-324' },
  { from: 'products/adapter/out/persistence/product-operations-data-status.repository.ts', to: 'channels/adapter/out/persistence/channel-listing-daily-facts', removeWith: 'KID-395' },
  { from: 'products/adapter/out/persistence/product-operations-data-status.repository.ts', to: 'orders/adapter/out/persistence/read/order-facts.reader', removeWith: 'KID-324' },
  { from: 'products/adapter/out/persistence/product-operations.repository.ts', to: 'channels/domain/listing/listing-product-summary', removeWith: 'KID-398', reason: '다른 owner domain 순수 함수 직접 import — shared 또는 제공자 포트로' },
  { from: 'products/adapter/out/persistence/product-operations.repository.ts', to: 'advertising/domain/ad-spend-rule', removeWith: 'KID-398', reason: '다른 owner domain 순수 함수 직접 import — shared 또는 제공자 포트로' },
  { from: 'products/adapter/out/persistence/product-operations.repository.ts', to: 'orders/adapter/out/persistence/read/order-facts.reader', removeWith: 'KID-324' },
  { from: 'products/adapter/out/persistence/product-operations.repository.ts', to: 'channels/adapter/out/persistence/channel-listing-daily-facts', removeWith: 'KID-395' },
  { from: 'products/domain/option-pricing-resolver.ts', to: 'channels/domain/account/channel-account-sales-costs', removeWith: 'KID-398', reason: '다른 owner domain 순수 함수 직접 import — shared 또는 제공자 포트로' },
  { from: 'readiness/readiness.service.ts', to: 'channels/adapter/out/persistence/published-catalog-listing', removeWith: 'KID-324' },
  { from: 'readiness/readiness.service.ts', to: 'analytics/sellpia-sales/read/sellpia-sales-daily-facts', removeWith: 'KID-324' },
  { from: 'sourcing/adapter/out/runtime/sourcing-playwright-runtime.handler.ts', to: 'agent-os/domain/agent-os.errors', removeWith: 'KID-398', reason: '다른 owner domain 순수 함수 직접 import — shared 또는 제공자 포트로' },
  { from: 'supply/adapter/out/persistence/supply-sourcing-procurement.repository.ts', to: 'sourcing/adapter/out/persistence/source-evidence.reader', removeWith: 'KID-324' },
  { from: 'supply/adapter/out/persistence/supply-sourcing-procurement.repository.ts', to: 'sourcing/adapter/out/persistence/decision-publication.reader', removeWith: 'KID-324' },
  { from: 'supply/adapter/out/persistence/supply-sourcing-procurement.repository.ts', to: 'sourcing/adapter/out/persistence/launch-candidate.reader', removeWith: 'KID-324' },
];

export function crossOwnerImportFindings(file, source) {
  if (!file.endsWith('.ts') || /\.(?:spec|test)\.ts$/.test(file) || /(?:^|\/)__tests__\//.test(file)) return [];
  const segments = file.split('/');
  if (segments.length < 2 || segments[0] === 'test-helpers') return [];
  const owner = segments[0];
  const findings = [];
  for (const match of source.matchAll(IMPORT_SPECIFIER)) {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]));
    const targetOwner = target.split('/')[0];
    if (target.startsWith('..') || targetOwner === owner || SHARED_KERNEL.has(targetOwner)) continue;
    // Agent OS collects each owner's Agent capability catalog (`domain/capability/`).
    if (owner === 'agent-os' && target.startsWith(`${targetOwner}/domain/capability/`)) continue;
    if (OWNER_INTERNALS.test(target.slice(targetOwner.length + 1))) findings.push({ from: file, to: target });
  }
  return findings;
}

export function crossOwnerExceptionShapeErrors(known) {
  const errors = [];
  const seen = new Set();
  known.forEach((entry, index) => {
    const label = `CROSS_OWNER_EXCEPTIONS[${index}]`;
    if (!entry.from || !entry.to) errors.push(`${label}: from and to are required`);
    if (!/^KID-\d+$/.test(entry.removeWith ?? '')) errors.push(`${label}: removeWith must be KID-<n>`);
    const key = `${entry.from} -> ${entry.to}`;
    if (seen.has(key)) errors.push(`${label}: duplicate entry ${key}`);
    seen.add(key);
  });
  return errors;
}

export function evaluateCrossOwnerImports(entries, known = CROSS_OWNER_EXCEPTIONS) {
  const used = new Set();
  const errors = crossOwnerExceptionShapeErrors(known);
  for (const { file, source } of entries) {
    for (const finding of crossOwnerImportFindings(file, source)) {
      const index = known.findIndex(entry => entry.from === finding.from && entry.to === finding.to);
      if (index >= 0) used.add(index);
      else errors.push(`${finding.from} imports another owner's internals: ${finding.to} (use that owner's application/port/in)`);
    }
  }
  known.forEach((entry, index) => {
    if (!used.has(index)) errors.push(`Stale CROSS_OWNER_EXCEPTIONS entry (removeWith ${entry.removeWith}): ${entry.from} -> ${entry.to}`);
  });
  return errors;
}

export function scanCrossOwnerImports(serverSrc, known = CROSS_OWNER_EXCEPTIONS) {
  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
  const entries = walk(serverSrc).map(file => ({
    file: path.relative(serverSrc, file).split(path.sep).join('/'),
    source: readFileSync(file, 'utf8'),
  }));
  return evaluateCrossOwnerImports(entries, known);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const serverSrc = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../apps/server/src');
  const roots = HEXAGONAL_DOMAINS.map(name => path.join(serverSrc, name));
  const violations = [...scanHexagonalDomains(roots, serverSrc), ...scanCrossOwnerImports(serverSrc)];
  if (violations.length) { console.error(violations.join('\n')); process.exitCode = 1; }
  else console.log('PASS: Channels/Sourcing/Content/Orders/Finance/Advertising/Products/Analytics domain, application and business directories preserve hexagonal boundaries.');
}
