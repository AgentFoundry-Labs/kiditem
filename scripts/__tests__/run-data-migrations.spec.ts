import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DATA_MIGRATION_IDS,
  dataMigrations,
  isLegacyDetailEditorHref,
  rewriteLegacyDetailEditorHref,
} from '../data-migrations/index';
import {
  APPLY_DATA_MIGRATIONS_CONFIRMATION,
  assertApplyDataMigrationsConfirmation,
  isDefinitelyProductionDatabaseUrl,
  normalizeReleaseVersion,
} from '../run-data-migrations';

const repoRoot = join(__dirname, '..', '..');

describe('data migration registry', () => {
  it('keeps durable data migrations in sortable versioned files', () => {
    expect(DATA_MIGRATION_IDS).toEqual([
      'v0.1.0:001_backfill_sourcing_candidates_from_master_products',
      'v0.1.0:002_rewrite_legacy_detail_editor_alert_hrefs',
      'v0.1.0:003_backfill_content_archive_classification',
    ]);
  });

  it('uses semver-shaped root release versions', () => {
    expect(normalizeReleaseVersion('0.1.0\n')).toBe('0.1.0');
    expect(() => normalizeReleaseVersion('latest')).toThrow(/Invalid root VERSION/);
  });

  it('ties migration ids and directories to the root app VERSION', () => {
    const rootVersion = normalizeReleaseVersion(readFileSync(join(repoRoot, 'VERSION'), 'utf8'));
    expect(dataMigrations.map((migration) => migration.releaseVersion)).toEqual([
      rootVersion,
      rootVersion,
      rootVersion,
    ]);
    for (const migration of dataMigrations) {
      expect(migration.id.startsWith(`v${migration.releaseVersion}:`)).toBe(true);
    }
  });
});

describe('legacy detail editor alert href migration', () => {
  it('rewrites legacy sourcing editor hrefs to the product-content editor', () => {
    expect(
      rewriteLegacyDetailEditorHref('/sourcing/product-123/editor?boldId=generation-456'),
    ).toBe('/product-content/product-123/editor?generationId=generation-456');
  });

  it('normalizes legacy agentId and generationId query keys', () => {
    expect(
      rewriteLegacyDetailEditorHref('/sourcing/product-123/editor?agentId=generation-456'),
    ).toBe('/product-content/product-123/editor?generationId=generation-456');

    expect(
      rewriteLegacyDetailEditorHref('/sourcing/product-123/editor?generationId=generation-456'),
    ).toBe('/product-content/product-123/editor?generationId=generation-456');
  });

  it('leaves unrelated hrefs unchanged', () => {
    expect(isLegacyDetailEditorHref('/products/abc')).toBe(false);
    expect(rewriteLegacyDetailEditorHref('/products/abc')).toBe('/products/abc');
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

  it('refuses obvious production database URLs', () => {
    expect(isDefinitelyProductionDatabaseUrl('postgresql://u:p@prod-db.example.com/app')).toBe(
      true,
    );
    expect(isDefinitelyProductionDatabaseUrl('postgresql://u:p@staging-db.example.com/app')).toBe(
      false,
    );
  });
});
