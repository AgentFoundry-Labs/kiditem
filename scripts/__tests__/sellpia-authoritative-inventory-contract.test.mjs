import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { describe, it } from 'node:test';

const repoRoot = process.cwd();

function productionFiles(root) {
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.next') {
        continue;
      }
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!['.ts', '.tsx', '.prisma'].includes(extname(entry.name))) continue;
      if (/\.(spec|test)\.[^.]+$/.test(entry.name)) continue;
      files.push(absolute);
    }
  };
  walk(join(repoRoot, root));
  return files;
}

function matchingFiles(files, pattern) {
  return files
    .filter((file) => pattern.test(readFileSync(file, 'utf8')))
    .map((file) => relative(repoRoot, file));
}

function filesDefiningModel(modelName) {
  const pattern = new RegExp(`^model ${modelName}\\s*\\{`, 'm');
  return matchingFiles(prismaFiles, pattern);
}

function extractModel(file, modelName) {
  const source = readFileSync(join(repoRoot, file), 'utf8');
  return source.match(new RegExp(`model ${modelName}\\s*\\{[\\s\\S]*?\\n\\}`))?.[0];
}

const serverFiles = productionFiles('apps/server/src');
const sharedFiles = productionFiles('packages/shared/src');
const prismaFiles = productionFiles('prisma/models');
const inventoryImporter = join(
  repoRoot,
  'apps/server/src/inventory/adapter/out/repository/inventory-sku-import.repository.adapter.ts',
);
const migrationRegistry = join(repoRoot, 'scripts/data-migrations/index.ts');

describe('Sellpia authoritative inventory reconstruction contract', () => {
  it('removes the legacy mutable inventory runtime while retaining expand-schema rollback lanes', () => {
    const forbidden = [
      /\bINVENTORY_PORT\b/,
      /\bprisma\.inventory\b/,
      /\bRocketInventoryLedger\b/,
      /\bStockTransaction\b/,
      /\bSellpiaStockSnapshot(?:Item)?\b/,
      /\bSellpiaNewProductCandidate\b/,
    ];

    for (const pattern of forbidden) {
      assert.deepEqual(
        matchingFiles([...serverFiles, ...sharedFiles], pattern),
        [],
        `Forbidden legacy inventory reference: ${pattern}`,
      );
    }
  });

  it('retains ProductOption stock policy fields and legacy inventory models at 0.1.8', () => {
    for (const model of [
      'Inventory',
      'StockTransaction',
      'RocketInventoryLedger',
      'SellpiaStockSnapshot',
      'SellpiaStockSnapshotItem',
      'SellpiaNewProductCandidate',
    ]) {
      assert.equal(filesDefiningModel(model).length, 1, `Legacy model must remain: ${model}`);
    }

    const option = extractModel('prisma/models/core.prisma', 'ProductOption');
    assert.ok(option, 'ProductOption model must remain');
    assert.match(option, /^\s*availableStock\s+/m);
    assert.equal(readFileSync(join(repoRoot, 'VERSION'), 'utf8').trim(), '0.1.8');
  });

  it('keeps InventorySku currentStock writes inside the full-snapshot importer only', () => {
    assert.ok(existsSync(inventoryImporter), 'Sellpia InventorySku importer must remain');

    const writers = serverFiles.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return /\.inventorySku\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/.test(source)
        || /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:"?[a-z_]+"?\.)?"?inventory_skus"?/i.test(source);
    });

    const unauthorized = writers
      .filter((file) => file !== inventoryImporter)
      .map((file) => relative(repoRoot, file));
    assert.deepEqual(unauthorized, [], 'Only the Sellpia importer may write currentStock');

    const importerSource = readFileSync(inventoryImporter, 'utf8');
    assert.match(importerSource, /current_stock/);
  });

  it('removes legacy inventory mutation HTTP adapters', () => {
    const forbiddenFiles = [
      'apps/server/src/inventory/adapter/in/http/inventory-items.controller.ts',
      'apps/server/src/inventory/adapter/in/http/inventory-assets.controller.ts',
      'apps/server/src/inventory/adapter/in/http/inventory-stock-mutations.controller.ts',
      'apps/server/src/inventory/adapter/in/http/inventory-transactions.controller.ts',
      'apps/server/src/inventory/adapter/in/http/rocket-inventory.controller.ts',
      'apps/server/src/inventory/adapter/in/http/audits.controller.ts',
    ];
    assert.deepEqual(
      forbiddenFiles.filter((file) => existsSync(join(repoRoot, file))),
      [],
    );
  });

  it('replaces the unshipped local-only blocker with shared-environment preservation guards', () => {
    const registry = readFileSync(migrationRegistry, 'utf8');
    assert.doesNotMatch(registry, /blockPersistentSellpiaInventoryCutover|v0\.1\.9/);
    assert.match(registry, /normalizeOperationalChannelAccounts/);
    assert.match(registry, /backfillChannelSkuAccounts/);

    for (const workflowPath of [
      '.github/workflows/staging-deploy.yml',
      '.github/workflows/production-deploy.yml',
    ]) {
      const workflow = readFileSync(join(repoRoot, workflowPath), 'utf8');
      const preSchema = workflow.indexOf('npm run data:migrate -- up --phase pre-schema');
      const preflight = workflow.indexOf('Check Sellpia cutover preflight');
      const dbPush = workflow.indexOf('npx prisma db push');
      assert.ok(preSchema >= 0, `${workflowPath} must run pre-schema migrations`);
      assert.ok(preflight > preSchema, `${workflowPath} must run the repeatable preflight after normalization`);
      assert.ok(dbPush > preflight, `${workflowPath} must run the preservation preflight before db push`);
      assert.match(workflow, /check-sellpia-db-push-warning\.mjs/);
    }
  });
});
