import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { scanOperationAutomationCutover } from "../check-operation-automation-cutover.mjs";

function withFixture(files, owners, assertion) {
  const root = mkdtempSync(path.join(tmpdir(), "kiditem-operation-cutover-"));
  try {
    for (const [relativePath, source] of Object.entries(files)) {
      const absolutePath = path.join(root, relativePath);
      mkdirSync(path.dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, source);
    }
    const manifestPath = path.join(
      root,
      "extensions/kiditem-os/background/source-owner-manifest.js",
    );
    mkdirSync(path.dirname(manifestPath), { recursive: true });
    writeFileSync(
      manifestPath,
      `export const SOURCE_OWNER_BY_PRODUCER = Object.freeze(${JSON.stringify(owners)});\n`,
    );
    return assertion(root);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

test("reports a production producer missing from the ownership table", async () => {
  await withFixture(
    {
      "extensions/kiditem-os/background/orders/worker.js":
        'const session = { producer: "orders.unknown" };\n',
    },
    { "orders.mall": "orders" },
    async (root) => {
      const result = await scanOperationAutomationCutover(root);
      assert.deepEqual(result.unownedProducers, ["orders.unknown"]);
    },
  );
});

test("reports a source owner that calls product ABC", async () => {
  await withFixture(
    {
      "extensions/kiditem-os/background/orders/worker.js":
        'const session = { producer: "inventory.sellpia" };\n',
      "apps/server/src/inventory/import.service.ts":
        "abcGradeService.recalculate({ organizationId });\n",
    },
    { "inventory.sellpia": "inventory" },
    async (root) => {
      const result = await scanOperationAutomationCutover(root);
      assert.deepEqual(result.sourceToAbcReferences, [
        "apps/server/src/inventory/import.service.ts:1",
      ]);
    },
  );
});

test("reports active legacy runtime references", async () => {
  await withFixture(
    {
      "apps/server/src/orders/orders.module.ts":
        "export class OperationRun {}\n",
    },
    {},
    async (root) => {
      const result = await scanOperationAutomationCutover(root);
      assert.deepEqual(result.legacyReferences, [
        "apps/server/src/orders/orders.module.ts:1:OperationRun",
      ]);
    },
  );
});

test("accepts a direct owner fixture with no legacy runtime", async () => {
  await withFixture(
    {
      "extensions/kiditem-os/background/orders/worker.js":
        'const session = { producer: "orders.mall" };\n',
      "apps/server/src/orders/order-import.service.ts":
        "export class OrderImportService {}\n",
    },
    { "orders.mall": "orders" },
    async (root) => {
      assert.deepEqual(await scanOperationAutomationCutover(root), {
        unownedProducers: [],
        sourceToAbcReferences: [],
        legacyReferences: [],
      });
    },
  );
});
