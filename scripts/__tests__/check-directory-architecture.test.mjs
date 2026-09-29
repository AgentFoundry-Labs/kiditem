import assert from "node:assert/strict";
import test from "node:test";

import { analyzeDirectoryArchitecture } from "../check-directory-architecture.mjs";

test("accepts documented backend, Gateway, web app, and web shared directories", () => {
  const result = analyzeDirectoryArchitecture({
    architectureDoc: [
      "`apps/server/src/agent-os`",
      "`apps/agent-gateway/src/conversation`",
      "`apps/agent-gateway/src/provider`",
      "`apps/web/src/app/(automation)`",
      "`apps/web/src/components`",
    ].join("\n"),
    serverSrcDirs: ["agent-os"],
    gatewaySrcDirs: ["conversation", "provider"],
    webAppDirs: ["(automation)"],
    webSrcDirs: ["app", "components"],
    webAppApiExists: false,
  });

  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.forbidden, []);
});

test("reports undocumented current directories and forbidden web route handlers", () => {
  const result = analyzeDirectoryArchitecture({
    architectureDoc: "`apps/server/src/agent-os`",
    serverSrcDirs: ["agent-os", "operations"],
    gatewaySrcDirs: ["conversation"],
    webAppDirs: ["(automation)"],
    webSrcDirs: ["app", "lib"],
    webAppApiExists: true,
  });

  assert.deepEqual(result.missing, [
    "apps/agent-gateway/src/conversation",
    "apps/server/src/operations",
    "apps/web/src/app/(automation)",
    "apps/web/src/lib",
  ]);
  assert.deepEqual(result.forbidden, ["apps/web/src/app/api"]);
});

test("keeps the lane rule while allowing only the two plan-defined Agent OS direct ports", () => {
  const result = analyzeDirectoryArchitecture({
    architectureDoc: "",
    serverSrcDirs: [],
    gatewaySrcDirs: [],
    webAppDirs: [],
    webSrcDirs: ["app"],
    webAppApiExists: false,
    backendPortFiles: [
      "apps/server/src/ai/application/port/out/provider/text-completion.port.ts",
      "apps/server/src/agent-os/application/port/out/capability-invocation.repository.port.ts",
      "apps/server/src/agent-os/application/port/out/gateway-conversation.port.ts",
      "apps/server/src/supply/application/port/out/supplier.repository.port.ts",
      "apps/server/src/sourcing/application/port/out/repository-transaction.ts",
    ],
  });

  assert.deepEqual(result.directOutPortFiles, [
    "apps/server/src/sourcing/application/port/out/repository-transaction.ts",
    "apps/server/src/supply/application/port/out/supplier.repository.port.ts",
  ]);
});

test("requires incoming ports to use capability names rather than caller or runtime folders", () => {
  const result = analyzeDirectoryArchitecture({
    architectureDoc: "",
    serverSrcDirs: [],
    gatewaySrcDirs: [],
    webAppDirs: [],
    webSrcDirs: ["app"],
    webAppApiExists: false,
    backendPortFiles: [
      "apps/server/src/inventory/application/port/in/capability/stock.port.ts",
      "apps/server/src/products/application/port/in/agent/master-promotion.port.ts",
      "apps/server/src/automation/application/port/in/workflow/workflow-run-cancellation.port.ts",
      "apps/server/src/supply/application/port/in/gateway/gateway-control.port.ts",
      "apps/server/src/channels/application/port/in/runner/legacy.port.ts",
    ],
  });

  assert.deepEqual(result.forbiddenInPortCallerFolders, [
    "apps/server/src/automation/application/port/in/workflow/workflow-run-cancellation.port.ts",
    "apps/server/src/channels/application/port/in/runner/legacy.port.ts",
    "apps/server/src/products/application/port/in/agent/master-promotion.port.ts",
    "apps/server/src/supply/application/port/in/gateway/gateway-control.port.ts",
  ]);
});

test("rejects retired backend lanes: adapter/out/repository, application/usecase and port/out/persistence (KID-324)", () => {
  const result = analyzeDirectoryArchitecture({
    architectureDoc: "",
    serverSrcDirs: [],
    gatewaySrcDirs: [],
    webAppDirs: [],
    webSrcDirs: ["app"],
    webAppApiExists: false,
    serverFiles: [
      "apps/server/src/channels/adapter/out/persistence/listing.repository.ts",
      "apps/server/src/channels/adapter/out/repository/listing.repository.ts",
      "apps/server/src/inventory/application/service/transfers.service.ts",
      "apps/server/src/inventory/application/usecase/transfers.service.ts",
      "apps/server/src/products/application/port/out/repository/product.repository.port.ts",
      "apps/server/src/products/application/port/out/persistence/product.repository.port.ts",
      "apps/server/src/common/operation/adapter/out/repository/operation.repository.ts",
    ],
  });

  assert.deepEqual(result.retiredLaneFiles, [
    "apps/server/src/channels/adapter/out/repository/listing.repository.ts",
    "apps/server/src/common/operation/adapter/out/repository/operation.repository.ts",
    "apps/server/src/inventory/application/usecase/transfers.service.ts",
    "apps/server/src/products/application/port/out/persistence/product.repository.port.ts",
  ]);
});

test("rejects the retired *.repository.adapter.ts and *.persistence.adapter.ts file names (KID-324)", () => {
  const result = analyzeDirectoryArchitecture({
    architectureDoc: "",
    serverSrcDirs: [],
    gatewaySrcDirs: [],
    webAppDirs: [],
    webSrcDirs: ["app"],
    webAppApiExists: false,
    serverFiles: [
      "apps/server/src/channels/adapter/out/persistence/listing.repository.ts",
      "apps/server/src/channels/adapter/out/persistence/listing.repository.adapter.ts",
      "apps/server/src/channels/adapter/out/persistence/account.persistence.adapter.spec.ts",
      "apps/server/src/supply/adapter/out/transaction/submission.transaction.adapter.ts",
    ],
  });

  assert.deepEqual(result.retiredAdapterFileNames, [
    "apps/server/src/channels/adapter/out/persistence/account.persistence.adapter.spec.ts",
    "apps/server/src/channels/adapter/out/persistence/listing.repository.adapter.ts",
  ]);
});
