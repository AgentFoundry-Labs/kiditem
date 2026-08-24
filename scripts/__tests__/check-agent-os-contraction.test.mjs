import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  collectAgentOsContractionFindings,
  contractionRoots,
} from "../check-agent-os-contraction.mjs";

test("limits enforcement to final native Runner boundaries", () => {
  const root = "/workspace/kiditem";
  assert.deepEqual(
    contractionRoots(root).map((directory) => path.relative(root, directory)),
    [
      "apps/server/src",
      "apps/server/.env.example",
      "apps/server/package.json",
      "apps/server/Dockerfile",
      "apps/agent-runner",
      "packages/shared/src/agent-runtime",
      "prisma/models",
      "deploy/office/nginx.conf",
      "deploy/office/compose.office.yml",
      "docker-compose.yml",
    ],
  );
});

test("freezes the API MCP dependency train and excludes provider CLIs", () => {
  const correct = JSON.stringify({
    dependencies: {
      "@modelcontextprotocol/server": "2.0.0",
      "zod-v4": "npm:zod@4.4.3",
      zod: "^3.25.0",
      "zod-to-json-schema": "^3.25.2",
    },
    devDependencies: { "@modelcontextprotocol/client": "2.0.0" },
  });
  assert.deepEqual(
    collectAgentOsContractionFindings([{ path: "apps/server/package.json", source: correct }]),
    [],
  );

  const findings = collectAgentOsContractionFindings([
    {
      path: "apps/server/package.json",
      source: JSON.stringify({
        dependencies: {
          "@modelcontextprotocol/server": "^2.0.0",
          "@modelcontextprotocol/sdk": "1.19.1",
          "@modelcontextprotocol/core": "2.0.0",
          "@anthropic-ai/claude-code": "^2.1.241",
          "@openai/codex": "0.149.0",
          "zod-v4": "npm:zod@4.4.0",
        },
        devDependencies: { "@modelcontextprotocol/client": "^2.0.0" },
      }),
    },
  ]);
  for (const category of [
    "MCP v2 server runtime dependency pin",
    "MCP v2 client development dependency pin",
    "MCP v1 SDK direct dependency",
    "MCP core direct dependency",
    "API-owned provider CLI dependency",
    "MCP Zod v4 runtime dependency pin",
  ]) {
    assert.ok(findings.includes(`apps/server/package.json: ${category}`), category);
  }
});

test("keeps AgentVersion and capability definitions free of provider and model state", () => {
  const findings = collectAgentOsContractionFindings([
    {
      path: "prisma/models/agent-work.prisma",
      source: "model AgentVersion { providerName String modelName String }",
    },
    {
      path: "apps/server/src/common/capability-definition.ts",
      source: "export interface CapabilityDefinition { providerName: string; modelName: string; }",
    },
  ]);
  for (const category of [
    "provider/model state on AgentVersion",
    "provider/model state on CapabilityDefinition",
  ]) {
    assert.ok(findings.some((finding) => finding.endsWith(`: ${category}`)), category);
  }
});

test("rejects API-owned transport, relay, process, and deployment boundaries", () => {
  const findings = collectAgentOsContractionFindings([
    {
      path: "apps/server/src/agent-os/adapter/in/mcp/runner-transport.ts",
      source:
        "import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'; import { Protocol } from '@modelcontextprotocol/core'; new StdioServerTransport();",
    },
    {
      path: "apps/server/src/agent-os/adapter/in/mcp/runner-relay.ts",
      source:
        "import { connect } from 'node:net'; connect('/tmp/runner.sock'); JSON.stringify({ tool: request.tool, arguments: request.arguments });",
    },
    {
      path: "deploy/office/compose.office.yml",
      source: "KIDITEM_ATTEMPT_LOGIN_HOME: /var/lib/kiditem-cli\ncommand: [\"codex\", \"login\"]",
    },
    {
      path: "apps/server/Dockerfile",
      source: "RUN codex --version && claude --version",
    },
    {
      path: "apps/server/src/ai/adapter/out/provider/native-runner.ts",
      source: "import { execFile } from 'node:child_process'; execFile('codex', []);",
    },
    {
      path: "apps/server/src/agent-os/adapter/out/runtime/attempt/peer.ts",
      source: "path.join('/proc', String(process.pid), 'status');",
    },
    {
      path: "apps/agent-runner/src/listener.ts",
      source: "http.createServer(handler).listen('0.0.0.0');",
    },
  ]);
  for (const category of [
    "MCP v1 source import",
    "MCP core source import",
    "API-owned UDS/stdio relay",
    "API-owned MCP relay",
    "API login-home/provider-login configuration",
    "API image provider CLI assertion",
    "API-owned CLI process supervision",
    "API runtime Linux peer-process inspection",
    "Runner inbound listener or LAN exposure",
  ]) {
    assert.ok(findings.some((finding) => finding.endsWith(`: ${category}`)), category);
  }
});

test("does not confuse unrelated server code with native Runner ownership", () => {
  assert.deepEqual(
    collectAgentOsContractionFindings([
      {
        path: "apps/server/src/agent-os/application/service/matcher.ts",
        source: "const matched = /kiditem/.exec(input);",
      },
      {
        path: "apps/server/src/ai/adapter/out/wing/playwriter-cli.ts",
        source: "import { execFile } from 'node:child_process';",
      },
      {
        path: "apps/agent-runner/src/runner-client.ts",
        source: "await fetch('http://127.0.0.1:4401/api/internal/agent-runtime/poll');",
      },
    ]),
    [],
  );
});

test("rejects current launch ingress execution, authority, and active-secret fields", () => {
  const rawLaunchFields = [
    "command",
    "executable",
    "shell",
    "args",
    "env",
    "cwd",
    "path",
    "loginHome",
    "organizationId",
    "organizationAuthority",
    "userId",
    "userAuthority",
    "sessionId",
    "sessionAuthority",
    "signingSecret",
    "runnerCredential",
    "integrationPassword",
    "runnerPassphrase",
    "runnerAccessToken",
    "runnerBearerToken",
    "runnerOAuthToken",
    "runnerApiToken",
    "runnerApiKey",
    "runnerPrivateKey",
    "connectionString",
    "connectionUrl",
    "connectionDsn",
  ];

  for (const field of rawLaunchFields) {
    const findings = collectAgentOsContractionFindings([
      {
        path: "packages/shared/src/agent-runtime/control.ts",
        source: `const AttemptLaunchSpecSchema = z.object({ ${field}: z.string() });`,
      },
    ]);
    assert.ok(
      findings.includes(
        "packages/shared/src/agent-runtime/control.ts: Runner launch authority/secret field",
      ),
      field,
    );
  }

  assert.deepEqual(
    collectAgentOsContractionFindings([
      {
        path: "packages/shared/src/agent-runtime/control.ts",
        source:
          "const AttemptLaunchSpecSchema = z.object({ attemptToken: z.string(), eventHash: z.string(), hmacDigest: z.string() });",
      },
      {
        path: "packages/shared/src/agent-runtime/runtime-train.ts",
        source: "const nonIngressMetadata = { signingSecret: 'not a schema' };",
      },
    ]),
    [],
  );
});

test("rejects ephemeral Runner state and active secrets only in scoped Prisma surfaces", () => {
  const controlFields = [
    "runnerLeaseId",
    "runnerCommandId",
    "runnerEventSeq",
    "runnerPollState",
    "attemptToken",
    "leaseExpiresAt",
    "leaseExpiry",
    "leaseDeadline",
    "leaseTtlMs",
    "commandPayload",
    "commandBatch",
    "commandAck",
    "commandAcknowledgement",
    "eventBatch",
    "eventAck",
    "eventAcknowledgement",
    "pollPayload",
    "controlState",
    "signingSecret",
    "runnerCredential",
  ];

  for (const field of controlFields) {
    const findings = collectAgentOsContractionFindings([
      {
        path: "prisma/models/agent-work.prisma",
        source: [
          "model AgentAttempt {",
          "  id String @id",
          `  ${field} String`,
          "}",
        ].join("\n"),
      },
    ]);
    assert.ok(
      findings.includes(
        "prisma/models/agent-work.prisma: Runner control-plane persistence",
      ),
      field,
    );
  }

  const findings = collectAgentOsContractionFindings([
    {
      path: "prisma/models/system.prisma",
      source: "model RunnerState { runnerLeaseId String }",
    },
    {
      path: "prisma/models/agent-work.prisma",
      source: "model AgentVersion { signingSecret String }",
    },
    {
      path: "prisma/models/agent-work.prisma",
      source: "model AgentAttempt { claudeSessionId String }",
    },
  ]);
  for (const category of [
    "Runner control-plane persistence",
    "provider session/history/resume persistence",
  ]) {
    assert.ok(findings.some((finding) => finding.endsWith(`: ${category}`)), category);
  }

  assert.deepEqual(
    collectAgentOsContractionFindings([
      {
        path: "prisma/models/system.prisma",
        source: "model OperationLease { leaseExpiresAt DateTime? eventHash String }",
      },
      {
        path: "prisma/models/product.prisma",
        source: "model Product { signingSecret String }",
      },
    ]),
    [],
  );
});

test("rejects duplicate runtime contracts outside the shared subpath", () => {
  const findings = collectAgentOsContractionFindings([
    {
      path: "apps/server/src/agent-os/domain/execution/runtime-contract.ts",
      source: [
        "type HostPlatform = 'macos' | 'windows';",
        "type ProviderRuntime = 'codex_cli' | 'claude_cli';",
      ].join("\n"),
    },
  ]);
  assert.ok(
    findings.includes(
      "apps/server/src/agent-os/domain/execution/runtime-contract.ts: duplicate runtime train/platform contract",
    ),
  );
});

test("accepts only canonical internal Runner controller prefixes", () => {
  for (const route of [
    "internal/agent-runtime/commands",
    "/api/internal/agent-runtime/events",
  ]) {
    assert.deepEqual(
      collectAgentOsContractionFindings([
        {
          path: "apps/server/src/agent-os/adapter/in/http/control/runner.controller.ts",
          source: `@Controller('${route}') export class RunnerController {}`,
        },
      ]),
      [],
      route,
    );
  }

  for (const route of [
    "/api/agent-runtime/commands",
    "internal/agent-runtime-lan/events",
    "/api/internal/agent-runtime-public/events",
  ]) {
    const findings = collectAgentOsContractionFindings([
      {
        path: "apps/server/src/agent-os/adapter/in/http/control/runner.controller.ts",
        source: `@Controller('${route}') export class RunnerController {}`,
      },
    ]);
    assert.ok(
      findings.includes(
        "apps/server/src/agent-os/adapter/in/http/control/runner.controller.ts: Agent runtime route outside internal prefix",
      ),
      route,
    );
  }
});

test("requires an nginx deny boundary for internal Runner routes", () => {
  assert.deepEqual(
    collectAgentOsContractionFindings([
      {
        path: "deploy/office/nginx.conf",
        source: "location ^~ /api/internal/agent-runtime/ { return 404; }",
      },
    ]),
    [],
  );
  assert.ok(
    collectAgentOsContractionFindings([
      {
        path: "deploy/office/nginx.conf",
        source: "location /api/internal/agent-runtime/ { proxy_pass http://kiditem_api; }",
      },
    ]).includes("deploy/office/nginx.conf: nginx internal Agent runtime deny boundary"),
  );
});
