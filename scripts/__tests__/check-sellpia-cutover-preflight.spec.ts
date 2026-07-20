import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MAX_SELLPIA_CUTOVER_EXAMPLES,
  SELLPIA_CUTOVER_PREFLIGHT_SCHEMA_VERSION,
  SELLPIA_CUTOVER_TARGET_RELEASE,
  checkSellpiaCutoverPreflight,
  runSellpiaCutoverPreflight,
} from '../check-sellpia-cutover-preflight';

const repoRoot = join(__dirname, '..', '..');

class FakeQueryClient {
  readonly sql: string[] = [];
  private index = 0;

  constructor(private readonly responses: unknown[][]) {}

  readonly $queryRaw = vi.fn(async (strings: TemplateStringsArray) => {
    this.sql.push(strings.join('$value'));
    const response = this.responses[this.index++];
    if (!response) throw new Error(`Missing fake query response ${this.index}`);
    return response;
  });
}

const cleanCounts = [{
  legacyMasterProducts: 12,
  legacyProductOptions: 13,
  legacyBundleComponents: 14,
  supplierRows: 15,
  orderRows: 16,
  orderLineItems: 17,
  returnRows: 17,
  returnLineItems: 18,
  shipmentRows: 18,
  shipmentItems: 19,
  unshippedRows: 19,
  contentRows: 20,
  contentGenerationGroups: 21,
  channelListings: 21,
  channelListingOptions: 22,
  channelListingOptionDailySnapshots: 23,
  analyticsRows: 23,
  advertisingRows: 24,
}];

function issueRows(issueCode: string, count = 1) {
  return Array.from({ length: count }, (_, index) => ({
    issueCode,
    issueCount: count,
    id: `${issueCode}-${index}`,
  }));
}

describe('Sellpia cutover preflight', () => {
  it('passes with machine-readable preservation counts and no blocking codes', async () => {
    const prisma = new FakeQueryClient([cleanCounts, [], [], [], [], [], [], [], []]);

    const report = await checkSellpiaCutoverPreflight(prisma as never);

    expect(report).toMatchObject({
      schemaVersion: SELLPIA_CUTOVER_PREFLIGHT_SCHEMA_VERSION,
      status: 'passed',
      targetRelease: SELLPIA_CUTOVER_TARGET_RELEASE,
      blockingIssueCodes: [],
      rowCounts: cleanCounts[0],
    });
    expect(report.issues).toEqual([]);
    expect(prisma.sql[0]).toContain('public.grade_histories');
    expect(prisma.sql[0]).not.toMatch(/public\.grade_history\b/);
    for (const table of [
      'public.bundle_components',
      'public.order_line_items',
      'public.order_return_line_items',
      'public.shipment_items',
      'public.content_generation_groups',
      'public.channel_listing_option_daily_snapshots',
    ]) {
      expect(prisma.sql[0]).toContain(table);
    }
    expect(prisma.sql[4]).toContain('channel_options_org_account_external_option_key');
    expect(prisma.sql[4]).toContain('content_workspaces_candidate_active_key');
    const crossTenantSql = prisma.sql[6];
    for (const relationName of [
      'source_import_account',
      'channel_listing_source_candidate',
      'channel_listing_last_import',
      'channel_option_account',
      'channel_option_last_import',
      'order_account',
      'return_account',
      'shipment_order',
      'shipment_item_order_line',
      'unshipped_order_line',
      'content_workspace_target_master',
      'content_workspace_listing',
      'content_workspace_origin',
      'content_workspace_current_detail_artifact',
      'content_workspace_current_detail_revision',
      'product_preparation_account',
      'product_preparation_source_workspace',
      'product_preparation_selected_detail_artifact',
      'product_preparation_selected_detail_revision',
      'product_preparation_selected_detail_generation',
      'product_preparation_selected_thumbnail_generation',
      'product_preparation_selected_thumbnail_candidate',
      'content_generation_group_workspace',
      'content_asset_origin_generation_group',
      'supplier_product_supplier',
      'supplier_product_master',
      'purchase_order_item_order',
      'purchase_order_item_master',
      'stock_transfer_from_warehouse',
      'stock_transfer_master',
      'picking_item_list',
      'picking_item_master',
      'return_transfer_master',
      'sellpia_snapshot_item_master',
      'channel_scrape_run_account',
      'channel_scrape_snapshot_run',
      'listing_daily_raw_snapshot',
      'listing_option_daily_raw_snapshot',
      'ad_target_daily_raw_snapshot',
      'account_kpi_account',
      'ad_action_target',
      'profit_loss_listing',
    ]) {
      expect(crossTenantSql).toContain(relationName);
    }
    expect(crossTenantSql).toContain('information_schema.columns');
    expect(crossTenantSql).toContain('query_to_xml');
    expect(crossTenantSql).toContain('child.organization_id IS NOT NULL');
    expect(prisma.sql.join('\n')).not.toMatch(
      /['"]inventory_skus['"]|public\.inventory_skus|channel_sku_components/,
    );
    expect(prisma.sql.join('\n')).not.toMatch(/\b(?:UPDATE|INSERT|DELETE|ALTER|DROP|TRUNCATE)\b/i);
  });

  it.each([
    ['NULL_OPERATIONAL_CHANNEL_ACCOUNT', 1],
    ['DUPLICATE_OPERATIONAL_CHANNEL_ACCOUNT', 2],
    ['DUPLICATE_LISTING_IDENTITY', 3],
    ['DUPLICATE_STAGED_UNIQUE_KEY', 4],
    ['CHANNEL_OPTION_PARENT_ACCOUNT_MISMATCH', 5],
    ['CROSS_TENANT_FOREIGN_KEY', 6],
    ['OWNERLESS_RETAINED_CONTENT', 7],
    ['AMBIGUOUS_PRODUCT_OPTION_REFERENCE', 8],
  ])('blocks %s and reports the full issue count', async (issueCode, responseIndex) => {
    const responses = [cleanCounts, [], [], [], [], [], [], [], []];
    responses[responseIndex] = issueRows(issueCode, 3);
    const prisma = new FakeQueryClient(responses);

    const report = await checkSellpiaCutoverPreflight(prisma as never);

    expect(report.status).toBe('blocked');
    expect(report.blockingIssueCodes).toContain(issueCode);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: issueCode,
      count: 3,
    }));
  });

  it('bounds every issue sample at twenty rows while retaining the total count', async () => {
    const prisma = new FakeQueryClient([
      cleanCounts,
      issueRows('NULL_OPERATIONAL_CHANNEL_ACCOUNT', 27),
      issueRows('DUPLICATE_OPERATIONAL_CHANNEL_ACCOUNT', 26),
      issueRows('DUPLICATE_LISTING_IDENTITY', 25),
      issueRows('DUPLICATE_STAGED_UNIQUE_KEY', 24),
      issueRows('CHANNEL_OPTION_PARENT_ACCOUNT_MISMATCH', 24),
      issueRows('CROSS_TENANT_FOREIGN_KEY', 23),
      issueRows('OWNERLESS_RETAINED_CONTENT', 22),
      issueRows('AMBIGUOUS_PRODUCT_OPTION_REFERENCE', 21),
    ]);

    const report = await checkSellpiaCutoverPreflight(prisma as never);

    expect(MAX_SELLPIA_CUTOVER_EXAMPLES).toBe(20);
    expect(report.issues).toHaveLength(8);
    expect(report.issues.every((issue) => issue.examples.length === 20)).toBe(true);
    expect(report.issues[0].count).toBe(27);
    expect(prisma.sql.slice(1).every((sql) => /LIMIT\s+20/i.test(sql))).toBe(true);
  });

  it('returns a failing exit code and JSON report for blockers', async () => {
    const prisma = new FakeQueryClient([
      cleanCounts,
      issueRows('NULL_OPERATIONAL_CHANNEL_ACCOUNT'),
      [], [], [], [], [], [], [],
    ]);
    const output = vi.fn<(text: string) => void>();

    await expect(runSellpiaCutoverPreflight(prisma as never, output)).resolves.toBe(1);
    expect(JSON.parse(output.mock.calls[0][0])).toMatchObject({
      status: 'blocked',
      targetRelease: '0.1.8',
    });
  });
});

describe('authoritative rebuild deployment ordering', () => {
  it.each([
    ['staging', '.github/workflows/staging-deploy.yml'],
    ['production', '.github/workflows/production-deploy.yml'],
  ])('orders the guarded %s rebuild and removes warning acceptance', (
    environment,
    relativePath,
  ) => {
    const workflow = readFileSync(join(repoRoot, relativePath), 'utf8');
    const markers = environment === 'staging' ? [
      '- name: Validate staging rebuild confirmation',
      '- name: Quiesce staging application traffic',
      '- name: Export staging account baseline',
      '- name: Rebuild staging database from final schema',
      '- name: Generate Prisma client after schema push',
      '- name: Restore staging account baseline',
    ] : [
      `- name: Validate ${environment} rebuild confirmation`,
      `- name: Quiesce ${environment} application traffic`,
      '- name: Export approved Coupang replay bundle',
      `- name: Rebuild ${environment} database from final schema`,
      '- name: Generate Prisma client after schema push',
      `- name: Bootstrap ${environment} authentication and account baseline`,
    ];
    const positions = markers.map((marker) => workflow.indexOf(marker));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(workflow).toContain('npx prisma db push --force-reset');
    expect(workflow).not.toContain('check-sellpia-cutover-preflight');
    expect(workflow).not.toContain('check-sellpia-db-push-warning.mjs');
    expect(workflow).not.toContain('--accept-data-loss');
  });

  it('keeps production migrations behind the independent workflow confirmation', () => {
    const workflow = readFileSync(join(repoRoot, '.github/workflows/production-deploy.yml'), 'utf8');
    expect(workflow.match(/DATA_MIGRATION_PRODUCTION_CONFIRM: \$\{\{ inputs\.confirm \}\}/g)).toHaveLength(2);
    expect(workflow).toContain('environment: production');
  });

  it('uses the exact staging reset token instead of a boolean cleanup bypass', () => {
    const workflow = readFileSync(join(repoRoot, '.github/workflows/staging-deploy.yml'), 'utf8');
    expect(workflow).not.toContain('accept_data_loss:');
    expect(workflow).toContain('EXPECTED_RESET_CONFIRMATION: RESET_STAGING_DATA');
    expect(workflow).toContain('npm run inventory:rebuild -- guard');
  });
});
