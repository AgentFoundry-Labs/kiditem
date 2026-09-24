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
const RETIRED_TOP_LEVEL_DIRS = new Set(['read', 'mapper', 'service']);
const HEXAGONAL_DOMAINS = ['channels', 'sourcing', 'content', 'orders'];

// KID-311: pure-layer adapter imports that predate an owner's move into the
// scanner. Each entry allows exactly one { file, specifier } pair (file is
// relative to apps/server/src) until the ticket in removeWith deletes it; an
// entry whose violation no longer occurs fails as stale.
export const KNOWN_VIOLATIONS = [];

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
    // The broader NestJS/Prisma/Node-builtin/xlsx framework-purity ban (and
    // the Node-global ban below) stays channels-only: sourcing and content
    // have substantial pre-existing @nestjs/node:*  usage in application/
    // and domain/ files that predates KID-310 and is not a directory-layout
    // question, so it is out of this reorganization's scope to fix here.
    if (owner === 'channels') {
      for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g)) {
        const dependency = match[1];
        if (dependency.startsWith('@nestjs/') || dependency.startsWith('@prisma/')
          || dependency.startsWith('node:') || builtins.has(dependency)
          || ['xlsx', 'exceljs', 'pg'].includes(dependency)) reject(`IO/framework import: ${dependency}`);
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
  const errors = [];
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
  else console.log('PASS: Channels/Sourcing/Content/Orders domain, application and business directories preserve hexagonal boundaries.');
}
