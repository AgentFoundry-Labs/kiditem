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
const persistentCutoverGate = join(
  repoRoot,
  'scripts/data-migrations/v0.1.9/001_block_persistent_sellpia_inventory_cutover.ts',
);

describe('Sellpia authoritative inventory reconstruction contract', () => {
  it('removes the legacy mutable inventory runtime', () => {
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
        matchingFiles([...serverFiles, ...sharedFiles, ...prismaFiles], pattern),
        [],
        `Forbidden legacy inventory reference: ${pattern}`,
      );
    }
  });

  it('removes stock policy fields from ProductOption and legacy inventory models', () => {
    for (const model of [
      'Inventory',
      'StockTransaction',
      'RocketInventoryLedger',
      'SellpiaStockSnapshot',
      'SellpiaStockSnapshotItem',
      'SellpiaNewProductCandidate',
    ]) {
      assert.deepEqual(filesDefiningModel(model), [], `Legacy model must be absent: ${model}`);
    }

    const option = extractModel('prisma/models/core.prisma', 'ProductOption');
    assert.ok(option, 'ProductOption model must remain');
    assert.doesNotMatch(option, /^\s*availableStock\s+/m);
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

  it('blocks the local-reset-only schema cutover before shared-environment db push', () => {
    const gateSource = readFileSync(persistentCutoverGate, 'utf8');
    assert.match(gateSource, /phase:\s*'pre-schema'/);
    assert.match(gateSource, /target !== 'local'/);
    assert.match(gateSource, /local development databases only/);

    for (const workflowPath of [
      '.github/workflows/staging-deploy.yml',
      '.github/workflows/production-deploy.yml',
    ]) {
      const workflow = readFileSync(join(repoRoot, workflowPath), 'utf8');
      const preSchema = workflow.indexOf('npm run data:migrate -- up --phase pre-schema');
      const dbPush = workflow.indexOf('npx prisma db push');
      assert.ok(preSchema >= 0, `${workflowPath} must run pre-schema migrations`);
      assert.ok(dbPush > preSchema, `${workflowPath} must run the local-only gate before db push`);
    }
  });
});
