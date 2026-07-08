import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  dataMigrationTransactionTimeoutMs,
  DEFAULT_DATA_MIGRATION_TRANSACTION_TIMEOUT_MS,
  isDefinitelyProductionDatabaseUrl,
  normalizeReleaseVersion,
  selectDataMigrationsForPhase,
} from '../run-data-migrations';
import {
  normalizeSellpiaRecommendedSnapshotItems,
} from '../data-migrations/v0.1.7/002_normalize_sellpia_recommended_snapshot_items';

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
      'v0.1.1:004_backfill_generated_content_candidates',
      'v0.1.1:005_rewrite_product_content_route_hrefs',
      'v0.1.1:006_backfill_registration_workspaces',
      'v0.1.2:001_backfill_channel_listing_accounts',
      'v0.1.2:002_rename_registration_workspaces_to_content_workspaces',
      'v0.1.2:003_retire_fixed_ai_agent_os_requests',
      'v0.1.3:001_remove_legacy_sourcing_workspace_snapshot_payloads',
      'v0.1.4:001_record_agent_os_operator_backbone_release',
      'v0.1.6:001_record_rocket_read_model_release',
      'v0.1.7:001_record_sellpia_rocket_inventory_sync_release',
      'v0.1.7:002_normalize_sellpia_recommended_snapshot_items',
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

  it('runs destructive table renames before Prisma db push and post-schema backfills after it', () => {
    expect(selectDataMigrationsForPhase(dataMigrations, 'pre-schema').map((m) => m.id)).toEqual([
      'v0.1.2:002_rename_registration_workspaces_to_content_workspaces',
    ]);
    expect(selectDataMigrationsForPhase(dataMigrations, 'post-schema').map((m) => m.id)).toContain(
      'v0.1.2:001_backfill_channel_listing_accounts',
    );
    expect(selectDataMigrationsForPhase(dataMigrations, 'post-schema').map((m) => m.id)).not.toContain(
      'v0.1.2:002_rename_registration_workspaces_to_content_workspaces',
    );
  });
});

describe('Sellpia recommended snapshot item migration', () => {
  it('normalizes legacy recommended status rows to needs_review', async () => {
    const tx = {
      $executeRaw: vi.fn(async () => 3),
    };

    const result = await normalizeSellpiaRecommendedSnapshotItems.run(tx as never);
    const [statement] = tx.$executeRaw.mock.calls[0] as [TemplateStringsArray];

    expect(String.raw(statement)).toContain('UPDATE sellpia_stock_snapshot_items');
    expect(String.raw(statement)).toContain("WHERE status = 'recommended'");
    expect(result).toEqual({
      affectedRows: 3,
      details: {
        normalizedStatus: 'recommended -> needs_review',
      },
    });
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

describe('product content route href migration', () => {
  it('rewrites retired sourcing editor hrefs to product-pipeline candidate routes', () => {
    expect(
      rewriteProductContentRouteHref('/sourcing/product-123/editor?boldId=generation-456'),
    ).toBe('/product-pipeline/collected-products/product-123/editor?generationId=generation-456');
    expect(
      rewriteProductContentRouteHref('/sourcing/product-123/editor?generationId=generation-456'),
    ).toBe('/product-pipeline/collected-products/product-123/editor?generationId=generation-456');
  });

  it('rewrites retired sourcing detail editor hrefs to product-pipeline detail routes', () => {
    expect(
      rewriteProductContentRouteHref('/sourcing/detail-pages/generation-456/editor'),
    ).toBe('/product-pipeline/registered-products/detail-pages/generation-456/editor');
  });

  it('rewrites retired product-content candidate editor hrefs to product-pipeline routes', () => {
    expect(
      rewriteProductContentRouteHref('/product-content/product-123/editor?agentId=generation-456'),
    ).toBe('/product-pipeline/collected-products/product-123/editor?generationId=generation-456');
    expect(
      rewriteProductContentRouteHref('/product-content/candidates/product-123/editor?generationId=generation-456'),
    ).toBe('/product-pipeline/collected-products/product-123/editor?generationId=generation-456');
    expect(
      rewriteProductContentRouteHref('/product-content/detail-pages/generation-456/editor'),
    ).toBe('/product-pipeline/registered-products/detail-pages/generation-456/editor');
  });

  it('rewrites removed product AI routes to product-pipeline routes', () => {
    expect(rewriteProductContentRouteHref('/sourcing')).toBe('/product-pipeline/collected-products');
    expect(rewriteProductContentRouteHref('/product-content')).toBe('/product-pipeline/collected-products');
    expect(rewriteProductContentRouteHref('/product-content?contentType=image')).toBe(
      '/product-pipeline/registered-products?contentType=image',
    );
    expect(rewriteProductContentRouteHref('/generate')).toBe(
      '/product-pipeline/detail-template-generation',
    );
    expect(rewriteProductContentRouteHref('/thumbnails?generationId=generation-456')).toBe(
      '/product-pipeline/thumbnail-generation?generationId=generation-456',
    );
    expect(rewriteProductContentRouteHref('/thumbnail-editor/edit?generationId=generation-456')).toBe(
      '/product-pipeline/thumbnail-generation/edit?generationId=generation-456',
    );
  });

  it('leaves canonical and unrelated hrefs unchanged', () => {
    expect(
      rewriteProductContentRouteHref('/product-pipeline/collected-products/product-123/editor?generationId=generation-456'),
    ).toBe('/product-pipeline/collected-products/product-123/editor?generationId=generation-456');
    expect(isProductContentRouteHrefRewriteNeeded('/products/abc')).toBe(false);
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
