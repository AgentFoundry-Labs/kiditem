import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  collectAgentOsContractionFindings,
  contractionRoots,
  productionFiles,
} from "../check-agent-os-contraction.mjs";

test("reports every targeted legacy category without a production allowlist", () => {
  const findings = collectAgentOsContractionFindings([
    {
      path: "apps/server/src/agent-os/runtime.ts",
      source: "const run = new AgentRun();",
    },
    {
      path: "apps/web/src/app/agent-os/components/RunInspector.tsx",
      source: "export const x = 1;",
    },
    {
      path: "packages/shared/src/agent-interaction/durable-runtime.ts",
      source: "export const old = true;",
    },
    {
      path: "packages/shared/src/agent-os.ts",
      source: "export const old = true;",
    },
    {
      path: "prisma/models/agents.prisma",
      source: "model AgentRun {} model AgentPolicySnapshot {}",
    },
    { path: "deploy/gateway.yml", source: "AGENT_GATEWAY_URL=example" },
    {
      path: "apps/server/src/agent-os/application/service/agent-conversation.service.ts",
      source: "export const x = 1;",
    },
    {
      path: "apps/server/src/agent-os/adapter/out/storage/storage-agent-session-artifact.adapter.ts",
      source: "export const x = 1;",
    },
    {
      path: "apps/server/src/agent-os/application/service/agent-cost-ledger.service.ts",
      source: "export const x = 1;",
    },
    {
      path: "apps/server/src/agent-os/application/service/agent-session-operation-continuation.service.ts",
      source: "export const x = 1;",
    },
    {
      path: "apps/server/src/agent-os/adapter/out/transaction/prisma-agent-run-authorization.transaction.ts",
      source: "pg_advisory_xact_lock",
    },
    {
      path: "apps/server/src/agent-os/adapter/out/runtime/runtime-credential-broker.ts",
      source: "KIDITEM_MCP_EXECUTION_CONTEXT",
    },
    {
      path: "apps/server/src/agent-os/domain/capability/capability-routing.policy.ts",
      source: "'cross_domain_read_grant'; 'explicit_execution_grant';",
    },
    {
      path: "apps/server/src/agent-os/live-control.fixture.ts",
      source: "const liveControlHandle = true;",
    },
  ]);
  assert.deepEqual(findings, [
    "apps/server/src/agent-os/runtime.ts: legacy AgentRun symbol",
    "apps/web/src/app/agent-os/components/RunInspector.tsx: legacy Web Agent OS path",
    "packages/shared/src/agent-interaction/durable-runtime.ts: legacy shared interaction export",
    "packages/shared/src/agent-os.ts: legacy shared Agent OS export",
    "prisma/models/agents.prisma: legacy AgentRun model",
    "prisma/models/agents.prisma: legacy authority/grant/outbox model",
    "deploy/gateway.yml: legacy gateway configuration",
    "apps/server/src/agent-os/application/service/agent-conversation.service.ts: legacy conversation/replay surface",
    "apps/server/src/agent-os/adapter/out/storage/storage-agent-session-artifact.adapter.ts: legacy artifact/storage surface",
    "apps/server/src/agent-os/application/service/agent-cost-ledger.service.ts: legacy usage/cost surface",
    "apps/server/src/agent-os/application/service/agent-session-operation-continuation.service.ts: legacy continuation surface",
    "apps/server/src/agent-os/adapter/out/transaction/prisma-agent-run-authorization.transaction.ts: legacy advisory/release/deletion surface",
    "apps/server/src/agent-os/adapter/out/runtime/runtime-credential-broker.ts: legacy provider/gateway runtime surface",
    "apps/server/src/agent-os/adapter/out/runtime/runtime-credential-broker.ts: legacy full-Nest MCP/HMAC runtime surface",
  ]);
});

test("keeps final names, final page, grants, policy, and in-memory handles clean", () => {
  assert.deepEqual(
    collectAgentOsContractionFindings([
      {
        path: "apps/web/src/app/agent-os/page.tsx",
        source: "export default function Page() {}",
      },
      {
        path: "apps/server/src/agent-os/domain/capability/capability-routing.policy.ts",
        source:
          "const kind = 'explicit_execution_grant'; const handle = liveControlHandle;",
      },
      {
        path: "prisma/models/agent-work.prisma",
        source:
          "model AgentVersion {} model AgentSession {} model AgentSessionTask {} model AgentAttempt {} model AgentCapabilityInvocation {} model AgentCapabilityApproval {}",
      },
    ]),
    [],
  );
});

test("reports each legacy Prisma model family independently", () => {
  const cases = [
    ["AgentConversation", "legacy conversation/replay model"],
    ["AgentMessage", "legacy conversation/replay model"],
    ["AgentConversationEvent", "legacy conversation/replay model"],
    ["AgentConversationOutbox", "legacy conversation/replay model"],
    ["AgentExecutionDispatchOutbox", "legacy authority/grant/outbox model"],
    ["AgentArtifact", "legacy artifact/storage model"],
    ["AgentSessionArtifactMaterialization", "legacy artifact/storage model"],
    ["AgentExecutionUsage", "legacy usage/cost model"],
    ["AgentCostEvent", "legacy usage/cost model"],
    ["AgentSessionApprovalContinuation", "legacy continuation model"],
    ["AgentSessionDeletionOperationBinding", "legacy deletion binding model"],
    ["AgentInstance", "legacy instance/tool policy model"],
    ["AgentInstanceToolPolicy", "legacy instance/tool policy model"],
    ["AgentToolInvocation", "legacy instance/tool policy model"],
    ["AgentAuthorizationEvent", "legacy authority/grant/outbox model"],
    ["AgentApprovalRequest", "legacy authority/grant/outbox model"],
  ];

  for (const [model, category] of cases) {
    const findings = collectAgentOsContractionFindings([
      {
        path: "prisma/models/agents.prisma",
        source: `model ${model} { id String @id }`,
      },
    ]);
    assert.ok(
      findings.includes(`prisma/models/agents.prisma: ${category}`),
      `${model} must report ${category}`,
    );
  }
});

test("reports targeted legacy source and configuration tokens", () => {
  const cases = [
    [
      "apps/server/src/agent-os/domain/legacy-runtime.ts",
      "runtimeKind: 'tool_wrapper'",
      "legacy fixed playbook/tool-wrapper metadata",
    ],
    [
      "apps/server/src/agent-os/domain/legacy-policy.ts",
      "defaultToolPolicies: []",
      "legacy fixed playbook/tool-wrapper metadata",
    ],
    [
      "apps/server/src/agent-os/application/port/out/capability/agent-capability-handler.port.ts",
      "executionKind: 'tool'; sideEffects: ['read']; artifact: {}",
      "legacy handler metadata",
    ],
    [
      "apps/server/src/agent-os/adapter/in/mcp/full-nest-mcp.context.ts",
      "KIDITEM_MCP_EXECUTION_CONTEXT",
      "legacy full-Nest MCP/HMAC runtime surface",
    ],
    [
      "deploy/office/agent-os.env.example",
      "AGENT_RUNTIME_WORKER_ENABLED=1",
      "legacy gateway configuration",
    ],
    [
      "apps/server/.env.example",
      "AGENT_RUNTIME_WORKER_ENABLED=1",
      "legacy gateway configuration",
    ],
    [
      "deploy/office/agent-os.conf",
      "INTERACTION_RUN_INTENT_HMAC_KEY=x",
      "legacy gateway configuration",
    ],
    [
      "deploy/office/agent-os.json",
      '{ "agentGateway": true }',
      "legacy gateway configuration",
    ],
    [
      ".github/workflows/agent-os.yml",
      "INTERACTION_RUN_INTENT_HMAC_KEY=x",
      "legacy gateway configuration",
    ],
    [
      "docker-compose.yml",
      "AGENT_RUNTIME_WORKER_ENABLED=1",
      "legacy gateway configuration",
    ],
  ];

  for (const [path, source, category] of cases) {
    assert.ok(
      collectAgentOsContractionFindings([{ path, source }]).includes(
        `${path}: ${category}`,
      ),
      `${path} must report ${category}`,
    );
  }

  assert.deepEqual(
    collectAgentOsContractionFindings([
      {
        path: "apps/server/src/agent-os/domain/capability/capability-definition.ts",
        source:
          "effects: ['db_write']; authorizationKind: 'cross_domain_read_grant'",
      },
      {
        path: "apps/server/src/agent-os/runtime.ts",
        source: "const liveControlHandle = new Map();",
      },
    ]),
    [],
  );
});

test("enumerates JSON, conf, and environment examples", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "kid25-scanner-"));
  try {
    for (const name of [
      "agent-os.json",
      "agent-os.conf",
      ".env.example",
      "office.example",
    ]) {
      writeFileSync(path.join(directory, name), "legacy=true");
    }
    assert.deepEqual(
      productionFiles(directory)
        .map((file) => path.basename(file))
        .sort(),
      [".env.example", "agent-os.conf", "agent-os.json", "office.example"],
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("limits Web traversal to source while retaining deployment config roots", () => {
  const root = "/workspace/kiditem";
  assert.deepEqual(
    contractionRoots(root).map((directory) => path.relative(root, directory)),
    [
      "apps/server/src/agent-os",
      "apps/server/.env.example",
      "apps/web/src",
      "apps/web/next.config.mjs",
      "packages/shared/src",
      "prisma/models",
      "deploy",
      "docker",
      "infra",
      ".github/workflows",
      "docker-compose.yml",
    ],
  );
});
