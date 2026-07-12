import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const repoRoot = join(import.meta.dirname, '..', '..');
const read = (relativePath) => readFileSync(join(repoRoot, relativePath), 'utf8');
const schema = (name) => read(`prisma/models/${name}.prisma`);

function modelBlock(source, name) {
  const match = source.match(new RegExp(`model ${name}\\s+\\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `Expected Prisma model ${name}`);
  return match[0];
}

function assertFields(block, fields) {
  for (const [field, type] of fields) {
    assert.match(block, new RegExp(`^\\s*${field}\\s+${type}`, 'm'), `Expected ${field} ${type}`);
  }
}

describe('Sellpia Master expand release contract', () => {
  const core = schema('core');
  const inventory = schema('inventory');
  const channels = schema('channels');
  const sourcing = schema('sourcing');
  const ai = schema('ai');
  const orders = schema('orders');
  const supply = schema('supply');
  const advertising = schema('advertising');
  const finance = schema('finance');

  it('pins the expand-only release and excludes the unshipped 0.1.9 blocker', () => {
    assert.equal(read('VERSION').trim(), '0.1.8');
    const registry = read('scripts/data-migrations/index.ts');
    assert.doesNotMatch(registry, /blockPersistentSellpiaInventoryCutover|v0\.1\.9/);
    assert.equal(
      existsSync(join(repoRoot, 'scripts/data-migrations/v0.1.9/001_block_persistent_sellpia_inventory_cutover.ts')),
      false,
    );
    assert.match(registry, /normalizeOperationalChannelAccounts/);
    assert.match(registry, /backfillChannelSkuAccounts/);
  });

  it('retains every legacy product and inventory owner during expansion', () => {
    for (const model of ['MasterProduct', 'MasterCodeCounter', 'MasterProductImage', 'ProductOption', 'BundleComponent']) {
      modelBlock(core, model);
    }
    for (const model of [
      'Inventory',
      'StockTransaction',
      'StockAudit',
      'InventorySku',
      'SellpiaStockSnapshot',
      'SellpiaStockSnapshotItem',
      'SellpiaNewProductCandidate',
      'RocketInventoryLedger',
    ]) {
      modelBlock(inventory, model);
    }
    for (const model of ['ChannelReconciliationRun', 'ChannelReconciliationItem']) {
      modelBlock(channels, model);
    }

    assertFields(modelBlock(core, 'MasterProduct'), [
      ['code', 'String'],
      ['description', 'String'],
      ['optionCounter', 'Int'],
      ['sourceUrl', 'String\\?'],
      ['pipelineStep', 'String\\?'],
      ['lifecycleState', 'String'],
    ]);
    assertFields(modelBlock(core, 'ProductOption'), [
      ['masterId', 'String'],
      ['costPrice', 'Int\\?'],
      ['sellPrice', 'Int\\?'],
      ['isBundle', 'Boolean'],
      ['availableStock', 'Int\\?'],
    ]);
  });

  it('adds nullable staged physical identity without redefining legacy Master identity', () => {
    const master = modelBlock(core, 'MasterProduct');
    assertFields(master, [
      ['sellpiaProductCode', 'String\\?'],
      ['sellpiaName', 'String\\?'],
      ['sellpiaBarcode', 'String\\?'],
      ['optionName', 'String\\?'],
      ['currentStock', 'Int\\?'],
      ['purchasePrice', 'Int\\?'],
      ['salePrice', 'Int\\?'],
      ['isActive', 'Boolean\\?'],
      ['rawJson', 'Json\\?'],
      ['lastImportRunId', 'String\\?'],
    ]);
    assert.match(master, /@@unique\(\[organizationId, sellpiaProductCode\][^\n]*where:\s*raw\("sellpia_product_code IS NOT NULL"\)/);
    assert.match(master, /@@unique\(\[id, organizationId\]/);

    const ledger = modelBlock(inventory, 'InventorySkuMasterProductMap');
    assertFields(ledger, [
      ['organizationId', 'String'],
      ['inventorySkuId', 'String'],
      ['masterProductId', 'String'],
      ['resolution', 'String'],
      ['details', 'Json\\?'],
    ]);
    assert.match(ledger, /fields:\s*\[inventorySkuId, organizationId\][\s\S]*references:\s*\[id, organizationId\]/);
    assert.match(ledger, /fields:\s*\[masterProductId, organizationId\][\s\S]*references:\s*\[id, organizationId\]/);

    const component = modelBlock(channels, 'ChannelSkuComponent');
    assertFields(component, [
      ['inventorySkuId', 'String'],
      ['masterProductId', 'String\\?'],
    ]);
  });

  it('adds account-scoped listing and import targets alongside legacy columns', () => {
    assert.match(modelBlock(core, 'ChannelAccount'), /@@unique\(\[id, organizationId\]/);

    const importRun = modelBlock(core, 'SourceImportRun');
    assertFields(importRun, [['publicationSequence', 'BigInt\\?']]);
    assert.match(importRun, /fields:\s*\[channelAccountId, organizationId\][\s\S]*references:\s*\[id, organizationId\]/);
    assert.match(importRun, /@@unique\(\[id, organizationId\]/);

    const listing = modelBlock(core, 'ChannelListing');
    assertFields(listing, [
      ['masterId', 'String\\?'],
      ['sourceCandidateId', 'String\\?'],
      ['isActive', 'Boolean'],
      ['abcGrade', 'String\\?'],
      ['profitTag', 'String\\?'],
      ['adTier', 'String\\?'],
      ['adBudgetLimit', 'Int\\?'],
      ['healthScore', 'Int\\?'],
      ['healthUpdatedAt', 'DateTime\\?'],
    ]);
    assert.match(listing, /@@unique\(\[id, organizationId\]/);
    assert.match(listing, /fields:\s*\[channelAccountId, organizationId\][\s\S]*references:\s*\[id, organizationId\]/);
    assert.match(listing, /fields:\s*\[lastImportRunId, organizationId\][\s\S]*references:\s*\[id, organizationId\]/);
    assert.match(listing, /fields:\s*\[sourceCandidateId, organizationId\][\s\S]*references:\s*\[id, organizationId\]/);

    const option = modelBlock(core, 'ChannelListingOption');
    assertFields(option, [
      ['optionId', 'String\\?'],
      ['attributesJson', 'Json\\?'],
      ['costPriceOverride', 'Int\\?'],
      ['commissionRate', 'Decimal\\?'],
      ['shippingCost', 'Int\\?'],
      ['otherCost', 'Int\\?'],
    ]);
    assert.match(option, /fields:\s*\[listingId, organizationId\][\s\S]*references:\s*\[id, organizationId\]/);
    assert.match(option, /@@unique\(\[id, organizationId\]/);
  });

  it('adds sourcing, preparation, and content-owner targets without deleting legacy owners', () => {
    const candidate = modelBlock(sourcing, 'SourcingCandidate');
    assertFields(candidate, [
      ['promotedMasterId', 'String\\?'],
      ['provenanceMasterProductId', 'String\\?'],
    ]);
    assert.match(candidate, /@@unique\(\[id, organizationId\]/);

    const preparation = modelBlock(ai, 'ProductPreparation');
    assertFields(preparation, [
      ['masterId', 'String\\?'],
      ['channelAccountId', 'String\\?'],
      ['sourceContentWorkspaceId', 'String\\?'],
      ['channelListingId', 'String\\?'],
      ['submissionKey', 'String\\?'],
      ['providerSubmissionId', 'String\\?'],
      ['lastError', 'String\\?'],
      ['registrationResult', 'Json\\?'],
      ['submissionPayloadJson', 'Json\\?'],
      ['submissionPayloadHash', 'String\\?'],
      ['providerOutcome', 'String\\?'],
      ['submissionLeaseToken', 'String\\?'],
      ['submissionLeaseClaimedAt', 'DateTime\\?'],
    ]);
    assert.doesNotMatch(
      preparation,
      /status IN \(/,
      'PostgreSQL normalizes IN to = ANY; use its canonical predicate so db:push is idempotent',
    );
    assert.match(preparation, /status = ANY \(ARRAY\[/);

    const workspace = modelBlock(ai, 'ContentWorkspace');
    assertFields(workspace, [
      ['targetMasterId', 'String\\?'],
      ['channelListingId', 'String\\?'],
      ['originWorkspaceId', 'String\\?'],
      ['currentThumbnailSelectionId', 'String\\?'],
    ]);
    modelBlock(ai, 'ContentWorkspaceThumbnailSelection');

    for (const [relation, field] of [
      ['sourceCandidate', 'sourceCandidateId'],
      ['targetMaster', 'targetMasterId'],
      ['channelListing', 'channelListingId'],
      ['originWorkspace', 'originWorkspaceId'],
      ['currentDetailPageArtifact', 'currentDetailPageArtifactId'],
      ['currentDetailPageRevision', 'currentDetailPageRevisionId'],
      ['currentThumbnailSelection', 'currentThumbnailSelectionId'],
    ]) {
      assert.match(
        workspace,
        new RegExp(`${relation}\\s+[^\\n]*fields:\\s*\\[${field}, organizationId\\][^\\n]*references:\\s*\\[id, organizationId\\]`),
        `Expected tenant-safe ContentWorkspace.${relation}`,
      );
    }

    for (const [relation, field] of [
      ['sourceCandidate', 'sourceCandidateId'],
      ['master', 'masterId'],
      ['contentWorkspace', 'contentWorkspaceId'],
      ['channelAccount', 'channelAccountId'],
      ['sourceContentWorkspace', 'sourceContentWorkspaceId'],
      ['channelListing', 'channelListingId'],
      ['selectedDetailPageArtifact', 'selectedDetailPageArtifactId'],
      ['selectedDetailPageRevision', 'selectedDetailPageRevisionId'],
      ['selectedDetailPageGeneration', 'selectedDetailPageGenerationId'],
      ['selectedThumbnailGeneration', 'selectedThumbnailGenerationId'],
      ['selectedThumbnailGenerationCandidate', 'selectedThumbnailGenerationCandidateId'],
    ]) {
      assert.match(
        preparation,
        new RegExp(`${relation}\\s+[^\\n]*fields:\\s*\\[${field}, organizationId\\][^\\n]*references:\\s*\\[id, organizationId\\]`),
        `Expected tenant-safe ProductPreparation.${relation}`,
      );
    }

    for (const model of [
      'ContentGeneration',
      'DetailPageArtifact',
      'DetailPageRevision',
      'ContentWorkspace',
      'ContentWorkspaceThumbnailSelection',
      'ThumbnailGeneration',
      'ThumbnailGenerationCandidate',
    ]) {
      assert.match(
        modelBlock(ai, model),
        /@@unique\(\[id, organizationId\]/,
        `Expected tenant-safe identity for ${model}`,
      );
    }

    assertFields(modelBlock(ai, 'ContentGenerationGroup'), [
      ['targetMasterId', 'String\\?'],
      ['contentWorkspaceId', 'String\\?'],
    ]);
    assertFields(modelBlock(ai, 'ContentAsset'), [
      ['generationGroupId', 'String'],
      ['originGenerationGroupId', 'String\\?'],
    ]);
  });

  it('adds nullable final-owner references beside preserved operational references', () => {
    const expected = [
      [inventory, 'StockTransfer', 'optionId', 'masterProductId'],
      [inventory, 'PickingItem', 'inventorySkuId', 'masterProductId'],
      [inventory, 'ReturnTransfer', 'inventorySkuId', 'masterProductId'],
      [orders, 'Order', 'platform', 'channelAccountId'],
      [orders, 'OrderLineItem', 'optionId', 'listingOptionId'],
      [orders, 'OrderReturn', 'platform', 'channelAccountId'],
      [orders, 'OrderReturnLineItem', 'optionId', 'listingOptionId'],
      [orders, 'UnshippedItem', 'optionId', 'orderLineItemId'],
      [supply, 'SupplierProduct', 'optionId', 'masterProductId'],
      [supply, 'PurchaseOrderItem', 'optionId', 'masterProductId'],
      [advertising, 'AdAction', 'listingId', 'listingOptionId'],
      [finance, 'GradeHistory', 'masterId', 'listingId'],
    ];
    for (const [source, model, legacyField, targetField] of expected) {
      const block = modelBlock(source, model);
      assert.match(block, new RegExp(`^\\s*${legacyField}\\s+`, 'm'), `Expected legacy ${model}.${legacyField}`);
      assert.match(block, new RegExp(`^\\s*${targetField}\\s+[^\\n]*\\?`, 'm'), `Expected nullable ${model}.${targetField}`);
    }
    const shipmentItem = modelBlock(orders, 'ShipmentItem');
    assertFields(shipmentItem, [
      ['organizationId', 'String'],
      ['shipmentId', 'String'],
      ['orderLineItemId', 'String'],
      ['quantity', 'Int'],
    ]);
  });

  it('adds account scope to retained collection run and account KPI snapshots', () => {
    for (const model of ['ChannelScrapeRun', 'ChannelAccountDailyKpiSnapshot']) {
      assertFields(modelBlock(channels, model), [['channelAccountId', 'String\\?']]);
    }
  });
});
