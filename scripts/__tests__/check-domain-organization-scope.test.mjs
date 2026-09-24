import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeDomainOrganizationScope,
  findOrganizationScopeParameters,
} from '../check-domain-organization-scope.mjs';

const DOMAIN = 'apps/server/src/example/domain/pricing.ts';

test('reports organizationId taken as a direct or destructured parameter of a pure domain function', () => {
  const source = `
export function price(organizationId: string, amount: number) { return amount; }
export const round = ({ organizationId, value }: { organizationId: string; value: number }) => value;
export class Policy {
  decide(input: { organizationId: string }, { nested: { organizationId } }: Nested) { return input; }
}
`;
  assert.deepEqual(findOrganizationScopeParameters(DOMAIN, source), [2, 3, 5]);
});

test('ignores organizationId as a record field, a type member, or a local', () => {
  const source = `
export interface Scoped { organizationId: string }
export function key(input: Scoped) { const organizationId = input.organizationId; return organizationId; }
`;
  assert.deepEqual(findOrganizationScopeParameters(DOMAIN, source), []);
});

test('accepts the organization-as-data marker on the same line or the line above', () => {
  const source = `
// organization-scope: data — the organization id is part of the storage key.
export function imageKey(organizationId: string, url: string) { return organizationId + url; }
export function render(organizationId: string) { return organizationId; } // organization-scope: data — printed in the report header.

export function bare(organizationId: string) { return organizationId; } // organization-scope: data
`;
  assert.deepEqual(findOrganizationScopeParameters(DOMAIN, source), [6]);
});

test('skips domain files that reach persistence, which already own scope', () => {
  for (const importLine of [
    "import { Prisma } from '@prisma/client';",
    "import type { Repo } from '../application/port/out/repository/x.repository.port';",
    "import { load } from './pricing.repository';",
  ]) {
    const result = analyzeDomainOrganizationScope({
      files: { [DOMAIN]: `${importLine}\nexport function f(organizationId: string) { return organizationId; }\n` },
      baseline: new Map(),
    });
    assert.deepEqual(result.counts, new Map(), importLine);
  }
});

test('fails a new violation, tolerates the baseline, and reports growth', () => {
  const violation = 'export function f(organizationId: string) { return organizationId; }\n';
  const baseline = new Map([[DOMAIN, 1]]);

  const atBaseline = analyzeDomainOrganizationScope({ files: { [DOMAIN]: violation }, baseline });
  assert.deepEqual(atBaseline.newFiles, []);
  assert.deepEqual(atBaseline.grownFiles, []);

  const planted = analyzeDomainOrganizationScope({
    files: {
      [DOMAIN]: violation + 'export function g(organizationId: string) { return organizationId; }\n',
      'apps/server/src/other/domain/new.ts': violation,
    },
    baseline,
  });
  assert.deepEqual(planted.newFiles, ['1 apps/server/src/other/domain/new.ts']);
  assert.deepEqual(planted.grownFiles, [`${DOMAIN}: 1 -> 2`]);
});
