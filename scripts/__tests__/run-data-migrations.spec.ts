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
  dataMigrationTransactionTimeoutMs,
  DEFAULT_DATA_MIGRATION_TRANSACTION_TIMEOUT_MS,
  isDefinitelyProductionDatabaseUrl,
  normalizeReleaseVersion,
} from '../run-data-migrations';

const repoRoot = join(__dirname, '..', '..');

describe('data migration registry', () => {
  it('keeps durable data migrations in sortable versioned files', () => {
    expect(DATA_MIGRATION_IDS).toEqual([
      'v0.1.0:001_backfill_sourcing_candidates_from_master_products',
      'v0.1.0:002_rewrite_legacy_detail_editor_alert_hrefs',
      'v0.1.0:003_relabel_image_edit_agent_instances_to_gemini_image',
      'v0.1.0:004_backfill_content_archive_classification',
      'v0.1.1:001_backfill_content_generation_workspace_assets',
      'v0.1.1:002_backfill_detail_page_artifacts',
      'v0.1.1:003_backfill_sourcing_candidate_images',
    ]);
  });

  it('uses semver-shaped root release versions', () => {
    expect(normalizeReleaseVersion('0.1.0\n')).toBe('0.1.0');
    expect(() => normalizeReleaseVersion('latest')).toThrow(/Invalid root VERSION/);
  });

  it('keeps migration ids tied to their versioned directories and includes the root app VERSION', () => {
    const rootVersion = normalizeReleaseVersion(readFileSync(join(repoRoot, 'VERSION'), 'utf8'));
    expect(dataMigrations.map((migration) => migration.releaseVersion)).toContain(rootVersion);
    for (const migration of dataMigrations) {
      expect(migration.id.startsWith(`v${migration.releaseVersion}:`)).toBe(true);
    }
  });
});

describe('legacy detail editor alert href migration', () => {
  it('rewrites legacy sourcing editor hrefs to the sourcing editor', () => {
    expect(
      rewriteLegacyDetailEditorHref('/sourcing/product-123/editor?boldId=generation-456'),
    ).toBe('/sourcing/product-123/editor?generationId=generation-456');
  });

  it('normalizes legacy agentId and generationId query keys', () => {
    expect(
      rewriteLegacyDetailEditorHref('/sourcing/product-123/editor?agentId=generation-456'),
    ).toBe('/sourcing/product-123/editor?generationId=generation-456');

    expect(
      rewriteLegacyDetailEditorHref('/sourcing/product-123/editor?generationId=generation-456'),
    ).toBe('/sourcing/product-123/editor?generationId=generation-456');
  });

  it('rewrites retired product-content editor hrefs to sourcing generation editor hrefs', () => {
    expect(
      rewriteLegacyDetailEditorHref('/product-content/detail-pages/generation-456/editor'),
    ).toBe('/sourcing/detail-pages/generation-456/editor');
    expect(
      rewriteLegacyDetailEditorHref('/product-content/product-123/editor?generationId=generation-456'),
    ).toBe('/sourcing/detail-pages/generation-456/editor');
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

  it('uses a staging-safe interactive transaction timeout', () => {
    expect(dataMigrationTransactionTimeoutMs(undefined)).toBe(
      DEFAULT_DATA_MIGRATION_TRANSACTION_TIMEOUT_MS,
    );
    expect(dataMigrationTransactionTimeoutMs('45000')).toBe(45000);
    expect(() => dataMigrationTransactionTimeoutMs('0')).toThrow(/positive integer/);
    expect(() => dataMigrationTransactionTimeoutMs('soon')).toThrow(/positive integer/);
  });
});
