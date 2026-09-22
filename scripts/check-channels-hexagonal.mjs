import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { builtinModules } from 'node:module';

const areas = new Set(['account', 'sales-product', 'registration', 'listing', 'collection']);
const builtins = new Set(builtinModules.map(name => name.replace(/^node:/, '')));
export function channelBoundaryViolations(file, source) {
  if (!file.endsWith('.ts') || file.endsWith('.spec.ts')) return [];
  const errors = [];
  const pure = /\/(domain|application)\//.test(file);
  if (pure) {
    for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g)) {
      const dependency = match[1];
      if (dependency.startsWith('@nestjs/') || dependency.startsWith('@prisma/')
        || dependency.startsWith('node:') || builtins.has(dependency)
        || /(?:^|\/)adapter(?:\/|$)/.test(dependency)
        || ['xlsx', 'exceljs', 'pg'].includes(dependency)) errors.push(`IO/framework import: ${dependency}`);
    }
    if (/\b(?:Buffer|process)\b/.test(source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ''))) errors.push('Node global in pure layer');
  }
  if (file.includes('/adapter/in/')) {
    for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g)) {
      if (/application\/(?:service|usecase|port\/out)\//.test(match[1])) errors.push('Incoming adapters use application input ports');
    }
  }
  const domain = file.split('/domain/')[1];
  if (domain && !areas.has(domain.split('/')[0]) && !['capability', 'exception'].includes(domain.split('/')[0])) errors.push('Domain must belong to a business area');
  const service = file.split('/application/service/')[1];
  if (service && !areas.has(service.split('/')[0])) errors.push('Service must belong to a business area');
  if (file.includes('/application/usecase/')) errors.push('Retired usecase directory');
  if (file.includes('/adapter/in/http/')) errors.push('Use adapter/in/web');
  if (file.includes('/marketplace/')) errors.push('Separate marketplace business domain');
  return errors;
}

export function scanChannels(root) {
  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
  return walk(root).flatMap(file => channelBoundaryViolations(file, readFileSync(file, 'utf8')).map(reason => `${file}: ${reason}`));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../apps/server/src/channels');
  const violations = scanChannels(root);
  if (violations.length) { console.error(violations.join('\n')); process.exitCode = 1; }
  else console.log('PASS: Channels domain/application and business directories preserve hexagonal boundaries.');
}
