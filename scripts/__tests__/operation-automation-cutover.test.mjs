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

test("reports the retired grade event emitted by a source owner", async () => {
  await withFixture(
    {
      "apps/server/src/advertising/traffic-ingest.handler.ts":
        "this.eventEmitter.emit('products.classify-grades');\n",
    },
    { "advertising.ad_sync": "advertising" },
    async (root) => {
      const result = await scanOperationAutomationCutover(root);
      assert.deepEqual(result.sourceToAbcReferences, [
        "apps/server/src/advertising/traffic-ingest.handler.ts:1",
      ]);
    },
  );
});

test("checks producer literals passed to the retained browser collection entrypoint", async () => {
  await withFixture(
    {
      "extensions/kiditem-os/background/coupang/worker.js": [
        'collectionRuns.beginWebCollection("advertising.keyword_rank", input);',
        '// collectionRuns.beginWebCollection("advertising.comment", input);',
        '`collectionRuns.beginWebCollection("advertising.example", input)`;',
      ].join("\n"),
    },
    { "advertising.wing_rank": "advertising" },
    async (root) => {
      const result = await scanOperationAutomationCutover(root);
      assert.deepEqual(result.unownedProducers, ["advertising.keyword_rank"]);
    },
  );
});

test("finds producer declarations after regex literals and ignores example text", async () => {
  await withFixture(
    {
      "extensions/kiditem-os/background/coupang/worker.js": [
        'const quote = /"/g;',
        'collectionRuns.beginWebCollection("advertising.keyword_rank", input);',
        'const ORDER_PRODUCER = "orders.mall";',
        'const SOURCE_PRODUCERS = new Set(["sourcing.trend"]);',
        'SOURCE_PRODUCERS.add("sourcing.product");',
        'const session = { producer: "inventory.sellpia" };',
        '// const COMMENT_PRODUCER = "orders.comment";',
        '`const EXAMPLE_PRODUCER = "orders.example";`;',
      ].join("\n"),
    },
    { "orders.mall": "orders", "inventory.sellpia": "inventory" },
    async (root) => {
      const result = await scanOperationAutomationCutover(root);
      assert.deepEqual(result.unownedProducers, [
        "advertising.keyword_rank", "sourcing.product", "sourcing.trend",
      ]);
    },
  );
});

test("finds bare PRODUCER and PRODUCERS source-owner constants", async () => {
  await withFixture(
    {
      "extensions/kiditem-os/background/orders/owner.js": [
        'const PRODUCER = "orders.sellpia_shipment_tracking";',
        'const PRODUCERS = new Set(["orders.coupang_directship", "orders.sellpia_sales"]);',
      ].join("\n"),
    },
    {},
    async (root) => {
      const result = await scanOperationAutomationCutover(root);
      assert.deepEqual(result.unownedProducers, [
        "orders.coupang_directship",
        "orders.sellpia_sales",
        "orders.sellpia_shipment_tracking",
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

test("ignores non-production local trees without hiding repository production", async () => {
  await withFixture(
    {
      ".worktrees/old-checkout/apps/server/src/stale.ts":
        "export class OperationRun {}\n",
      ".secrets/extensions/old-staging-copy/background.js":
        "export class OperationRun {}\n",
      "agents/.venv/lib/python3.11/site-packages/vendor.js":
        "export class OperationRun {}\n",
      "graphify-out/cache/ast/stale.json": '"OperationRun"\n',
      ".github/workflows/cutover.yml": "name: OperationRun\n",
      "apps/server/src/orders/live.ts": "export class OperationRun {}\n",
    },
    {},
    async (root) => {
      const result = await scanOperationAutomationCutover(root);
      assert.deepEqual(result.legacyReferences, [
        ".github/workflows/cutover.yml:1:OperationRun",
        "apps/server/src/orders/live.ts:1:OperationRun",
      ]);
    },
  );
});

test("rejects server-side Coupang OpenAPI dependencies but allows Wing and internal HTTP", async () => {
  await withFixture(
    {
      "apps/server/src/analytics/legacy-coupang.ts": [
        "import { COUPANG_PROVIDER_PORT } from './provider';",
        "type CoupangProviderPort = unknown;",
        "const request = coupangRequest({});",
        "import client from './coupang-client';",
        "const api = new CoupangOpenApiClient();",
        "const legacyClient = coupangClient;",
        "const path = '/v2/providers/openapi/';",
        "const host = 'api-gateway.coupang.com';",
        "type Credentials = CoupangCredentials;",
        "@Inject(COUPANG_API_CREDENTIALS)",
        "resolveCoupangCredentials(account);",
      ].join("\n"),
      "apps/server/src/ai/adapter/out/coupang/wing.ts": [
        "const url = 'https://wing.coupang.com/vendor-inventory/list';",
        "await page.goto(url);",
      ].join("\n"),
      "apps/server/src/advertising/application/service/internal-http.ts":
        "await fetch('http://ads.internal/status');\n",
    },
    {},
    async (root) => {
      const result = await scanOperationAutomationCutover(root);
      assert.deepEqual(result.legacyReferences, [
        "apps/server/src/analytics/legacy-coupang.ts:1:COUPANG_PROVIDER_PORT",
        "apps/server/src/analytics/legacy-coupang.ts:2:CoupangProviderPort",
        "apps/server/src/analytics/legacy-coupang.ts:3:coupangRequest(",
        "apps/server/src/analytics/legacy-coupang.ts:4:coupang-client",
        "apps/server/src/analytics/legacy-coupang.ts:5:CoupangOpenApiClient",
        "apps/server/src/analytics/legacy-coupang.ts:6:coupangClient",
        "apps/server/src/analytics/legacy-coupang.ts:7:/v2/providers/openapi/",
        "apps/server/src/analytics/legacy-coupang.ts:8:api-gateway.coupang.com",
        "apps/server/src/analytics/legacy-coupang.ts:9:CoupangCredentials",
        "apps/server/src/analytics/legacy-coupang.ts:10:COUPANG_API_CREDENTIALS",
        "apps/server/src/analytics/legacy-coupang.ts:11:resolveCoupangCredentials",
      ]);
    },
  );
});

test("reports the retired generic advertising write ingress without banning its status read", async () => {
  await withFixture(
    {
      "apps/server/src/advertising/legacy-writer.ts":
        "const writePath = '/api/ads/extension/sync';\nconst readPath = '/api/ads/extension/status';\n",
    },
    { "advertising.ad_sync": "advertising" },
    async (root) => {
      const result = await scanOperationAutomationCutover(root);
      assert.deepEqual(result.legacyReferences, [
        "apps/server/src/advertising/legacy-writer.ts:1:/api/ads/extension/sync",
      ]);
    },
  );
});

test("checks retired Prisma models, including the dropped ActionTask, while tolerating commerce", async () => {
  await withFixture(
    {
      "prisma/models/system.prisma": [
        "model OperationRun {",
        "model Marketplace {",
        "model ActionTask {",
        "  actionTasks ActionTask[]",
        "model ChannelListingDeletionOperation {",
      ].join("\n"),
      "apps/server/src/tasks.ts": "const task: ActionTask = value;",
    },
    {},
    async (root) => {
      const result = await scanOperationAutomationCutover(root);
      assert.deepEqual(result.legacyReferences, [
        "apps/server/src/tasks.ts:1:ActionTask",
        "prisma/models/system.prisma:1:OperationRun",
        "prisma/models/system.prisma:2:Marketplace",
        "prisma/models/system.prisma:3:ActionTask",
        "prisma/models/system.prisma:4:ActionTask",
        "prisma/models/system.prisma:4:actionTasks",
      ]);
    },
  );
});

test("ignores sourcing guard regex but still rejects executable runtime calls", async () => {
  await withFixture(
    {
      "scripts/check-sourcing-long-running-actions.mjs": [
        "const forbidden = /KidItemDomains\\.runOperation/;",
        "KidItemDomains.runOperation(input);",
      ].join("\n"),
      "scripts/other.mjs": "const runtime = 'runOperation';",
    },
    {},
    async (root) => {
      const result = await scanOperationAutomationCutover(root);
      assert.deepEqual(result.legacyReferences, [
        "scripts/check-sourcing-long-running-actions.mjs:2:runOperation",
        "scripts/other.mjs:1:runOperation",
      ]);
    },
  );
});

test("allows only the retained read-only preflight path, not an adjacent writer", async () => {
  await withFixture(
    {
      "scripts/operation-automation-cutover-preflight.mjs":
        "const operationRuns = await client.query('SELECT * FROM operation_runs');\n",
      "scripts/operation-automation-cutover-preflight-writer.mjs":
        "await prisma.operationRuns.deleteMany();\n",
    },
    {},
    async (root) => {
      const result = await scanOperationAutomationCutover(root);
      assert.deepEqual(result.legacyReferences, [
        "scripts/operation-automation-cutover-preflight-writer.mjs:1:operationRuns",
      ]);
    },
  );
});

test("rejects retired server-issued collection run contracts without matching owner attempts", async () => {
  await withFixture(
    {
      "apps/web/src/lib/collection.ts": [
        "BrowserCollectionRunIdSchema.parse(input);",
        "BrowserCollectionIssueResponseSchema.parse(response);",
        "const current = { attemptId, producer, progress };",
      ].join("\n"),
    },
    {},
    async (root) => {
      const result = await scanOperationAutomationCutover(root);
      assert.deepEqual(result.legacyReferences, [
        "apps/web/src/lib/collection.ts:1:BrowserCollectionRunIdSchema",
        "apps/web/src/lib/collection.ts:2:BrowserCollectionIssueResponseSchema",
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
