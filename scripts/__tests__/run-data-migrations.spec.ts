import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DATA_MIGRATION_IDS,
  dataMigrations,
  isLegacyDetailEditorHref,
  isProductContentRouteHrefRewriteNeeded,
  rewriteLegacyDetailEditorHref,
  rewriteProductContentRouteHref,
} from '../data-migrations/index';
import {
  APPLY_DATA_MIGRATIONS_CONFIRMATION,
  assertApplyDataMigrationsConfirmation,
  assertMutatingTarget,
  dataMigrationTransactionTimeoutMs,
  DEFAULT_DATA_MIGRATION_TRANSACTION_TIMEOUT_MS,
  isDefinitelyProductionDatabaseUrl,
  normalizeReleaseVersion,
  selectDataMigrationsForPhase,
} from '../run-data-migrations';

const repoRoot = join(__dirname, '..', '..');

describe('data migration registry', () => {
  it('registers baseline metadata only', () => {
    expect(DATA_MIGRATION_IDS).toEqual([
      'v0.1.4:001_record_agent_os_operator_backbone_release',
      'v0.1.6:001_record_rocket_read_model_release',
      'v0.1.7:001_record_sellpia_rocket_inventory_sync_release',
    ]);
    expect(DATA_MIGRATION_IDS.some((id) => /backfill|normalize|rewrite|repoint|verify/.test(id)))
      .toBe(false);
  });

  it('uses a schema-only 0.1.8 release without a release data migration', () => {
    const rootVersion = normalizeReleaseVersion(readFileSync(join(repoRoot, 'VERSION'), 'utf8'));
    expect(rootVersion).toBe('0.1.8');
    expect(dataMigrations.map((migration) => migration.releaseVersion)).not.toContain(rootVersion);
    for (const migration of dataMigrations) {
      expect(migration.id.startsWith(`v${migration.releaseVersion}:`)).toBe(true);
    }
  });

  it('has no preservation migration in an automatic schema phase', () => {
    expect(selectDataMigrationsForPhase(dataMigrations, 'pre-schema')).toEqual([]);
    expect(selectDataMigrationsForPhase(dataMigrations, 'post-schema')).toEqual(dataMigrations);
  });

  it('rejects malformed root versions', () => {
    expect(normalizeReleaseVersion('0.1.8\n')).toBe('0.1.8');
    expect(() => normalizeReleaseVersion('latest')).toThrow(/Invalid root VERSION/);
  });
});

describe('persisted route rewrite helpers', () => {
  it('rewrites retired detail-editor hrefs', () => {
    expect(
      rewriteLegacyDetailEditorHref('/sourcing/product-123/editor?agentId=generation-456'),
    ).toBe('/product-content/product-123/editor?generationId=generation-456');
    expect(isLegacyDetailEditorHref('/sourcing/product-123/editor')).toBe(true);
    expect(isLegacyDetailEditorHref('/products/abc')).toBe(false);
  });

  it('rewrites retired product-content routes and leaves canonical routes unchanged', () => {
    expect(
      rewriteProductContentRouteHref('/product-content/candidate-123/editor?generationId=generation-456'),
    ).toBe(
      '/product-pipeline/collected-products/candidate-123/editor?generationId=generation-456',
    );
    expect(
      isProductContentRouteHrefRewriteNeeded('/product-content/candidate-123/editor'),
    ).toBe(true);
    expect(rewriteProductContentRouteHref('/products/abc')).toBe('/products/abc');
  });
});

describe('data migration CLI guardrails', () => {
  it('requires explicit apply confirmation', () => {
    expect(() => assertApplyDataMigrationsConfirmation(undefined)).toThrow(
      APPLY_DATA_MIGRATIONS_CONFIRMATION,
    );
    expect(() =>
      assertApplyDataMigrationsConfirmation(APPLY_DATA_MIGRATIONS_CONFIRMATION),
    ).not.toThrow();
  });

  it('keeps local and staging targets away from production-looking URLs', () => {
    const productionUrl = 'postgresql://u:p@prod-db.example.com/app';
    expect(isDefinitelyProductionDatabaseUrl(productionUrl)).toBe(true);
    expect(isDefinitelyProductionDatabaseUrl('postgresql://u:p@staging-db.example.com/app'))
      .toBe(false);
    expect(() => assertMutatingTarget('local', productionUrl, {})).toThrow(/production/i);
    expect(() => assertMutatingTarget('staging', productionUrl, {})).toThrow(/production/i);
  });

  it('allows production only in GitHub Actions with independent confirmation', () => {
    const productionUrl = 'postgresql://u:p@prod-db.example.com/app';
    expect(() => assertMutatingTarget('production', productionUrl, {})).toThrow(/GitHub Actions/i);
    expect(() => assertMutatingTarget('production', productionUrl, {
      GITHUB_ACTIONS: 'true',
    })).toThrow(/DATA_MIGRATION_PRODUCTION_CONFIRM/i);
    expect(() => assertMutatingTarget('production', productionUrl, {
      GITHUB_ACTIONS: 'true',
      DATA_MIGRATION_PRODUCTION_CONFIRM: 'DEPLOY_PRODUCTION',
    })).not.toThrow();
  });

  it('rejects unknown targets and invalid transaction timeouts', () => {
    expect(() => assertMutatingTarget('development', 'postgresql://localhost/app', {})).toThrow(
      /local, staging, or production/i,
    );
    expect(dataMigrationTransactionTimeoutMs(undefined)).toBe(
      DEFAULT_DATA_MIGRATION_TRANSACTION_TIMEOUT_MS,
    );
    expect(dataMigrationTransactionTimeoutMs('45000')).toBe(45000);
    expect(() => dataMigrationTransactionTimeoutMs('0')).toThrow(/positive integer/);
  });
});
