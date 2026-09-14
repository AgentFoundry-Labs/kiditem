import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { join } from "node:path";
import test from "node:test";

import {
  collectAgentOsContractionFindings,
  collectContractionInventoryFindings,
  contractionRoots,
  productionFiles,
} from "../check-agent-os-contraction.mjs";

const AGENT_KEYS = [
  "sourcing",
  "merchandising",
  "supply",
  "channel_operations",
  "advertising",
];

const DOMAIN_KEYS = [
  "advertising",
  "ai",
  "analytics",
  "channels",
  "inventory",
  "orders",
  "products",
  "sourcing",
  "supply",
];

const CAPABILITY_FILES = [
  [
    "apps/server/src/analytics/domain/capability/analytics.capabilities.ts",
    ["analytics.read_overview"],
  ],
  [
    "apps/server/src/channels/domain/capability/channels.capabilities.ts",
    [
      "channels.register_confirmed_listing",
      "channels.submit_wing_thumbnail",
    ],
  ],
  [
    "apps/server/src/products/domain/capability/products.capabilities.ts",
    ["products.create_listing_generation_package"],
  ],
  [
    "apps/server/src/sourcing/domain/capability/sourcing.capabilities.ts",
    [
      "sourcing.duplicate_check",
      "sourcing.scrape_product_url",
      "sourcing.ingest_candidate",
      "sourcing.retrieve_workspace_evidence",
      "sourcing.inspect_recommendation_run",
      "sourcing.refresh_validation",
      "sourcing.create_review_batch",
    ],
  ],
  [
    "apps/server/src/supply/domain/capability/supply.capabilities.ts",
    ["supply.create_purchase_order_draft", "supply.submit_purchase_order"],
  ],
];

function capabilitySource(keys) {
  return `export const DEFINITIONS = [${keys
    .map((key) => `{ key: '${key}', resultSummary: '업무를 완료했습니다.' }`)
    .join(",")}];`;
}

function finalContractFiles() {
  return [
    {
      path: "prisma/models/agent-work.prisma",
      source: [
        "model CapabilityInvocation {",
        "  id String @id",
        "  organizationId String",
        "  requestKey String",
        "  @@unique([organizationId, requestKey])",
        "}",
      ].join("\n"),
    },
    {
      path: "apps/server/src/agent-os/domain/agent-definition.registry.ts",
      source: `export const AGENT_DEFINITIONS = [${AGENT_KEYS.map(
        (key) => `{ key: '${key}', assignedDomains: [] }`,
      ).join(",")}];`,
    },
    {
      path: "apps/server/src/agent-os/domain/catalog/domain-definition.registry.ts",
      source: `export const DOMAIN_KEYS = [${DOMAIN_KEYS.map((key) => `'${key}'`).join(",")}];`,
    },
    ...CAPABILITY_FILES.map(([path, keys]) => ({ path, source: capabilitySource(keys) })),
    {
      path: "apps/server/src/agent-os/adapter/in/mcp/capability-mcp-wire-contract.ts",
      source: [
        "export const MCP_PROTOCOL_VERSION = '2026-07-28';",
        "export const CAPABILITY_MCP_TOOL_NAMES = [",
        "  'capability_catalog_search',",
        "  'capability_invoke',",
        "  'invocation_status',",
        "  'readiness_probe',",
        "];",
      ].join("\n"),
    },
  ];
}

function expectFinding(findings, text) {
  assert.ok(findings.some((finding) => finding.includes(text)), text);
}

test("limits the clean-cutover scan to current production roots", () => {
  const root = "/workspace/kiditem";
  const roots = contractionRoots(root).map((entry) => path.relative(root, entry));

  for (const required of [
    "apps",
    "apps/server/package.json",
    "apps/server/Dockerfile",
    "packages/shared/src",
    "prisma/models",
    "deploy",
    ".github/workflows",
    "package.json",
  ]) {
    assert.ok(roots.includes(required), required);
  }
  assert.equal(roots.some((entry) => entry.startsWith("docs/")), false);
});

test("ignores test, dependency, and generated descendants", () => {
  const root = mkdtempSync(join(tmpdir(), "kiditem-agent-os-contraction-"));
  const sourceRoot = join(root, "apps/server/src/agent-os");
  try {
    for (const relative of [
      "current.ts",
      "current.definition.ts",
      "__tests__/legacy.ts",
      "node_modules/example/legacy.ts",
      "dist/legacy.ts",
      "coverage/legacy.ts",
    ]) {
      const target = join(sourceRoot, relative);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, "export const source = true;\n");
    }

    assert.deepEqual(
      productionFiles(sourceRoot)
        .map((file) => path.relative(root, file))
        .sort(),
      [
        "apps/server/src/agent-os/current.definition.ts",
        "apps/server/src/agent-os/current.ts",
      ],
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("accepts the exact final one-model catalog and MCP contract", () => {
  assert.deepEqual(collectAgentOsContractionFindings(finalContractFiles()), []);
});

test("requires exactly one CapabilityInvocation Prisma model", () => {
  const findings = collectAgentOsContractionFindings([
    {
      path: "prisma/models/agent-work.prisma",
      source: "model CapabilityInvocation { id String @id }\nmodel AgentTask { id String @id }",
    },
    {
      path: "prisma/models/agents.prisma",
      source: "model CapabilityInvocation { id String @id }",
    },
  ]);

  expectFinding(findings, "exactly one CapabilityInvocation");
  expectFinding(findings, "retired Agent OS persistence model");
});

test("rejects retired Agent OS lifecycle, publication, and recovery surfaces", () => {
  const findings = collectAgentOsContractionFindings([
    {
      path: "packages/shared/src/identifiers/index.ts",
      source: "export type AgentSessionId = string; export type AgentAttemptId = string;",
    },
    {
      path: "apps/server/src/agent-os/application/service/publish-agent-version.service.ts",
      source: "export function publishAgentVersion() {}",
    },
    {
      path: "apps/server/src/agent-os/adapter/in/http/interaction/task.controller.ts",
      source: "@Controller('agent-os/tasks') export class TaskController {}",
    },
    {
      path: "scripts/seed-agent-os.ts",
      source: "export const seedAgentOs = true;",
    },
    {
      path: "apps/server/src/agent-os/application/service/capability-grant.service.ts",
      source: "export class CapabilityGrantService {}",
    },
    {
      path: "apps/server/src/agent-os/application/service/mutation-dispatcher.service.ts",
      source: "export class MutationDispatcher {}",
    },
    {
      path: "apps/server/src/agent-os/application/service/approval-sweeper.service.ts",
      source: "export class ApprovalSweeper {}",
    },
    {
      path: "apps/server/src/agent-os/application/service/pending-invocation-recovery.service.ts",
      source: "export function recoverPendingInvocation() {}",
    },
  ]);

  for (const category of [
    "retired Agent OS lifecycle name",
    "retired Agent OS publication surface",
    "retired Task/Attempt route",
    "retired Agent OS seed surface",
    "retired capability grant surface",
    "retired mutation dispatcher",
    "retired approval sweeper",
    "pending Invocation recovery",
  ]) {
    expectFinding(findings, category);
  }
});

test("allows the exact API-owned CapabilityMutationDispatcher", () => {
  const findings = collectAgentOsContractionFindings([
    {
      path: "apps/server/src/agent-os/application/service/capability-mutation-dispatcher.service.ts",
      source: "export class CapabilityMutationDispatcher {}",
    },
    {
      path: "apps/server/src/agent-os/application/service/capability-invocation.service.ts",
      source: "import { CapabilityMutationDispatcher, type CapabilityMutationDispatcherPort } from './capability-mutation-dispatcher.service';",
    },
  ]);

  assert.equal(
    findings.some((finding) => finding.includes("retired mutation dispatcher")),
    false,
  );
});

test("rejects lookalike mutation dispatchers outside the exact API-owned seam", () => {
  const findings = collectAgentOsContractionFindings([
    {
      path: "apps/server/src/agent-os/application/service/retry-capability-mutation-dispatcher.service.ts",
      source: "export class RetryCapabilityMutationDispatcher {}",
    },
  ]);

  expectFinding(findings, "retired mutation dispatcher");
});

test("rejects an unapproved consumer of the API-owned dispatcher", () => {
  const findings = collectAgentOsContractionFindings([
    {
      path: "apps/server/src/agent-os/application/service/unapproved-dispatcher-consumer.service.ts",
      source: "import { CapabilityMutationDispatcher } from './capability-mutation-dispatcher.service';",
    },
  ]);

  expectFinding(findings, "retired mutation dispatcher");
});

test("uses general persistence categories for secrets and Host Gateway state", () => {
  const findings = collectAgentOsContractionFindings([
    {
      path: "prisma/models/agent-work.prisma",
      source: [
        "model CapabilityInvocation {",
        "  id String @id",
        "  signingSecret String",
        "  bearer String",
        "  providerConversationRef String",
        "}",
      ].join("\n"),
    },
    {
      path: "prisma/models/system.prisma",
      source: [
        "model GatewayControlState {",
        "  id String @id",
        "  commandId String",
        "}",
      ].join("\n"),
    },
  ]);

  expectFinding(findings, "active credentials or secrets");
  expectFinding(findings, "ephemeral Host Gateway control state");
});

test("enforces final Agent, domain, capability, and MCP cardinalities", () => {
  const files = finalContractFiles();
  const agentRegistry = files.find((file) => file.path.endsWith("agent-definition.registry.ts"));
  const domains = files.find((file) => file.path.endsWith("domain-definition.registry.ts"));
  const mcp = files.find((file) => file.path.endsWith("capability-mcp-wire-contract.ts"));

  agentRegistry.source = "export const AGENT_DEFINITIONS = [{ key: 'sourcing', assignedDomains: [] }];";
  domains.source = "export const DOMAIN_KEYS = ['sourcing'];";
  mcp.source = "export const MCP_PROTOCOL_VERSION = '2025-01-01'; export const CAPABILITY_MCP_TOOL_NAMES = ['one'];";

  const findings = collectAgentOsContractionFindings(files);
  expectFinding(findings, "exactly five Agents");
  expectFinding(findings, "exactly nine domains");
  expectFinding(findings, "exactly four MCP tools");
  expectFinding(findings, "MCP protocol must be 2026-07-28");
});

test("requires each owner capability to provide bounded Korean completion copy", () => {
  const files = finalContractFiles();
  const analytics = files.find((file) => file.path.endsWith("analytics.capabilities.ts"));
  const channels = files.find((file) => file.path.endsWith("channels.capabilities.ts"));

  analytics.source = analytics.source.replace(", resultSummary: '업무를 완료했습니다.'", "");
  channels.source = channels.source.replace("업무를 완료했습니다.", "technical-completion");

  const findings = collectAgentOsContractionFindings(files);
  expectFinding(findings, "analytics.read_overview: missing resultSummary");
  expectFinding(findings, "channels.register_confirmed_listing: resultSummary must be bounded Korean copy");
});

test("keeps provider CLIs out of the API and worker image surfaces", () => {
  const findings = collectAgentOsContractionFindings([
    {
      path: "apps/server/package.json",
      source: JSON.stringify({ dependencies: { "@openai/codex": "1.0.0" } }),
    },
    {
      path: "apps/server/src/agent-os/adapter/out/runtime/launch.ts",
      source: "import { spawn } from 'node:child_process'; spawn('claude', []);",
    },
    {
      path: "apps/server/Dockerfile",
      source: "RUN npm install --global @anthropic-ai/claude-code",
    },
  ]);

  expectFinding(findings, "API/worker provider CLI package");
  expectFinding(findings, "API/worker provider CLI spawn");
  expectFinding(findings, "API/worker image contains a provider CLI");
});

test("rejects retired applications, port 4401, and public internal runtime routes", () => {
  const findings = collectAgentOsContractionFindings([
    {
      path: "apps/agent-runner/src/main.ts",
      source: "export const legacy = true;",
    },
    {
      path: "apps/interaction-gateway/src/main.ts",
      source: "export const legacy = true;",
    },
    {
      path: "deploy/office/compose.office.yml",
      source: "ports: ['4401:4401']",
    },
    {
      path: "apps/server/src/agent-os/adapter/in/http/runtime/public.controller.ts",
      source: "@Controller('api/internal/agent-runtime') export class RuntimeController {}",
    },
  ]);

  expectFinding(findings, "retired Agent runtime application");
  expectFinding(findings, "retired runtime port 4401");
  expectFinding(findings, "public internal runtime route");
});

test("detects retired runtime application directories from the filesystem inventory", () => {
  const root = mkdtempSync(join(tmpdir(), "kiditem-agent-os-inventory-"));
  try {
    mkdirSync(join(root, "apps/agent-runner"), { recursive: true });
    mkdirSync(join(root, "apps/interaction-gateway"), { recursive: true });
    const findings = collectContractionInventoryFindings(root);
    expectFinding(findings, "apps/agent-runner: retired Agent runtime application");
    expectFinding(findings, "apps/interaction-gateway: retired Agent runtime application");
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
