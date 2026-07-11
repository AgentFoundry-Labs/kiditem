import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  CHANNEL_SKU_IDENTITY_SCHEMA_VERSION,
  MAX_CHANNEL_SKU_IDENTITY_EXAMPLES,
  checkChannelSkuIdentity,
  runChannelSkuIdentityPreflight,
} from '../check-channel-sku-identity';

const repoRoot = join(__dirname, '..', '..');

class FakeQueryClient {
  readonly sql: string[] = [];
  private responseIndex = 0;

  constructor(private readonly responses: unknown[][]) {}

  readonly $queryRaw = vi.fn(
    async (strings: TemplateStringsArray, ..._values: unknown[]): Promise<unknown> => {
      this.sql.push(strings.join('$value'));
      const response = this.responses[this.responseIndex];
      this.responseIndex += 1;
      if (!response) {
        throw new Error(`Missing fake response for query ${this.responseIndex}`);
      }
      return response;
    },
  );
}

function examples(count: number, prefix: string): Array<Record<string, unknown>> {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    organizationId: `organization-${index}`,
  }));
}

describe('channel SKU identity preflight', () => {
  it('bounds every reported violation category to 20 examples and never mutates data', async () => {
    const prisma = new FakeQueryClient([
      [{ exists: true }],
      examples(25, 'parent-duplicate'),
      examples(24, 'sku-parent-org'),
      examples(23, 'parent-account-org'),
      examples(22, 'sku-parent-account'),
      examples(21, 'projected-duplicate'),
    ]);

    const report = await checkChannelSkuIdentity(prisma as never);

    expect(report).toMatchObject({
      schemaVersion: CHANNEL_SKU_IDENTITY_SCHEMA_VERSION,
      passed: false,
      channelSkuAccountColumnPresent: true,
    });
    expect(MAX_CHANNEL_SKU_IDENTITY_EXAMPLES).toBe(20);
    expect(report.violations.activeParentIdentityDuplicates).toHaveLength(20);
    expect(report.violations.channelSkuParentOrganizationMismatches).toHaveLength(20);
    expect(report.violations.parentChannelAccountOrganizationMismatches).toHaveLength(20);
    expect(report.violations.channelSkuParentAccountMismatches).toHaveLength(20);
    expect(report.violations.projectedChannelSkuIdentityDuplicates).toHaveLength(20);
    expect(prisma.sql.slice(1).every((sql) => /LIMIT\s+20/i.test(sql))).toBe(true);
    expect(prisma.sql.join('\n')).not.toMatch(/\b(?:UPDATE|INSERT|DELETE|ALTER|DROP|TRUNCATE)\b/i);
  });

  it('runs before the nullable child account column exists without querying that column', async () => {
    const prisma = new FakeQueryClient([
      [{ exists: false }],
      [],
      [],
      [],
      [],
    ]);
    const output = vi.fn<(text: string) => void>();

    const exitCode = await runChannelSkuIdentityPreflight(prisma as never, output);

    expect(exitCode).toBe(0);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(5);
    expect(prisma.sql.slice(1).join('\n')).not.toContain('sku.channel_account_id');
    expect(JSON.parse(output.mock.calls[0][0])).toMatchObject({
      schemaVersion: CHANNEL_SKU_IDENTITY_SCHEMA_VERSION,
      passed: true,
      channelSkuAccountColumnPresent: false,
      violations: {
        channelSkuParentAccountMismatches: [],
      },
    });
  });

  it('emits a failing JSON report when any identity violation exists', async () => {
    const prisma = new FakeQueryClient([
      [{ exists: false }],
      [{ organizationId: 'org-1', channelAccountId: 'account-1', externalId: 'product-1' }],
      [],
      [],
      [],
    ]);
    const output = vi.fn<(text: string) => void>();

    const exitCode = await runChannelSkuIdentityPreflight(prisma as never, output);

    expect(exitCode).toBe(1);
    expect(JSON.parse(output.mock.calls[0][0])).toMatchObject({ passed: false });
  });
});

describe('schema deployment ordering', () => {
  it.each([
    ['staging', '.github/workflows/staging-deploy.yml', 'Apply staging Prisma schema'],
    ['production', '.github/workflows/production-deploy.yml', 'Apply production Prisma schema'],
  ])(
    'orders the %s transition around the repeatable identity preflight',
    (_environment, relativePath, schemaStepName) => {
      const workflow = readFileSync(join(repoRoot, relativePath), 'utf8');
      const orderedMarkers = [
        '- name: Run pre-schema data migrations',
        '- name: Check channel SKU identity preflight',
        `- name: ${schemaStepName}`,
        '- name: Generate Prisma client after schema push',
        '- name: Run post-schema data migrations',
      ];
      const positions = orderedMarkers.map((marker) => workflow.indexOf(marker));

      expect(positions.every((position) => position >= 0)).toBe(true);
      expect(positions).toEqual([...positions].sort((left, right) => left - right));
      expect(workflow).toContain('CHANNEL_SKU_IDENTITY_PREFLIGHT=passed');
      expect(workflow).toContain('check-channel-sku-db-push-warning.mjs');
    },
  );

  it('keeps production data migrations behind the protected workflow confirmation', () => {
    const workflow = readFileSync(
      join(repoRoot, '.github/workflows/production-deploy.yml'),
      'utf8',
    );

    expect(workflow.match(/DATA_MIGRATION_PRODUCTION_CONFIRM: \$\{\{ inputs\.confirm \}\}/g)).toHaveLength(2);
    expect(workflow).toContain('environment: production');
  });

  it('retains the staging reviewed-cleanup input without allowing a direct identity-guard bypass', () => {
    const workflow = readFileSync(join(repoRoot, '.github/workflows/staging-deploy.yml'), 'utf8');

    expect(workflow).toContain('accept_data_loss:');
    expect(workflow).not.toMatch(/elif \[ "\$\{ACCEPT_DATA_LOSS\}" = "true" \]/);
  });
});
