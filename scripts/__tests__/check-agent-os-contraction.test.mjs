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
      path: "apps/server/src/agent-os/adapter/in/http/interaction/agent-work.controller.ts",
      source:
        "const loginHome = requiredEnvironment('KIDITEM_ATTEMPT_LOGIN_HOME'); const cliVersion = requiredEnvironment('KIDITEM_ATTEMPT_CLI_VERSION');",
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

test("rejects legacy Runner login and CLI version environment reads in production server source", () => {
  const findings = collectAgentOsContractionFindings([
    {
      path: "apps/server/src/agent-os/adapter/in/http/interaction/agent-work.controller.ts",
      source:
        "const loginHome = requiredEnvironment('KIDITEM_ATTEMPT_LOGIN_HOME'); const cliVersion = requiredEnvironment('KIDITEM_ATTEMPT_CLI_VERSION');",
    },
  ]);

  assert.ok(
    findings.some((finding) =>
      finding.endsWith(": API login-home/provider-login configuration"),
    ),
  );
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
        source: "await fetch('http://127.0.0.1:4000/internal/agent-runtime/runner/commands:poll');",
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
    "refreshToken",
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
    "runnerProcessId",
    "processHandle",
    "processIdentity",
    "attemptTokenDigest",
    "acknowledgedAt",
    "leaseOwner",
    "commandHash",
    "eventBodyHash",
    "processExitCode",
    "leaseRenewedAt",
    "signingSecret",
    "runnerCredential",
    "refreshToken",
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
    {
      path: "prisma/models/agent-work.prisma",
      source: "model RunnerProcess { id String @id }",
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
        path: "prisma/models/runner-control.prisma",
        source: "model RunnerProcess { id String @id }",
      },
    ]),
    ["prisma/models/runner-control.prisma: Runner control-plane persistence"],
    "a dedicated Runner process model is always ephemeral control state",
  );

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
      {
        path: "prisma/models/agent-work.prisma",
        source:
          "model AgentCapabilityInvocation { leaseOwner String? leaseExpiresAt DateTime? }",
      },
      {
        path: "prisma/models/operations.prisma",
        source: "model Operation { leaseOwner String? leaseExpiresAt DateTime? }",
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
    "/internal/agent-runtime/events",
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
    "/api/internal/agent-runtime/events",
    "/internal/agent-runtime-public/events",
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

test("composes static Nest controller and method paths for Runner routes", () => {
  const accepted = [
    [
      "source-relative",
      "@Controller('internal/agent-runtime') export class RunnerController { @Post('runner/events') post() {} }",
    ],
    [
      "fully-qualified",
      "@Controller('/internal/agent-runtime') export class RunnerController { @Post('runner/events') post() {} }",
    ],
  ];

  for (const [name, source] of accepted) {
    assert.deepEqual(
      collectAgentOsContractionFindings([
        {
          path: "apps/server/src/agent-os/adapter/in/http/control/runner.controller.ts",
          source,
        },
      ]),
      [],
      name,
    );
  }

  assert.deepEqual(
    collectAgentOsContractionFindings([
      {
        path: "apps/server/src/readiness/readiness.controller.ts",
        source:
          "@Controller('readiness') export class ReadinessController { @Get('agent-runtime') status() {} }",
      },
      {
        path: "apps/server/src/agent-os/adapter/in/http/interaction/copilotkit.controller.ts",
        source:
          "@Controller('copilotkit') export class AgentWorkCopilotKitController { @All('*path') handle() {} } class FutureOnlyRunner {}",
      },
      {
        path: "apps/server/src/ai/adapter/out/wing/wing-automation-runner.ts",
        source: "export class WingAutomationRunner { run() {} }",
      },
    ]),
    [],
    "unrelated readiness, CopilotKit, and business runner names are not Runner control routes",
  );

  for (const [name, source] of [
    [
      "public controller with an internal method path",
      "@Controller('public') export class RunnerController { @Post('internal/agent-runtime/poll') poll() {} }",
    ],
    [
      "dynamic method path",
      "@Controller('internal/agent-runtime') export class RunnerController { @Post(path) poll() {} }",
    ],
    [
      "dynamic controller path",
      "@Controller(prefix) export class RunnerController { @Post('runner/events') post() {} }",
    ],
  ]) {
    const findings = collectAgentOsContractionFindings([
      {
        path: "apps/server/src/agent-os/adapter/in/http/control/runner.controller.ts",
        source,
      },
    ]);
    assert.ok(
      findings.includes(
        "apps/server/src/agent-os/adapter/in/http/control/runner.controller.ts: Agent runtime route outside internal prefix",
      ),
      name,
    );
  }
});

test("rejects raw fields in every concrete Runner control ingress declaration", () => {
  const ingressFixtures = [
    {
      path: "apps/server/src/agent-os/adapter/in/http/runtime/start-attempt.dto.ts",
      source: "export class StartAttemptDto { command!: string; }",
    },
    {
      path: "apps/server/src/agent-os/adapter/in/http/runtime/poll-input.ts",
      source: "export interface PollInput { refreshToken: string; }",
    },
    {
      path: "apps/server/src/agent-os/adapter/in/http/runtime/event-input.ts",
      source: "export type EventInput = { executable: string };",
    },
    {
      path: "apps/agent-runner/src/control/runner-control.client.ts",
      source: "export const StartAttemptDto = z.object({ env: z.string() }).strict();",
    },
  ];

  for (const fixture of ingressFixtures) {
    assert.ok(
      collectAgentOsContractionFindings([fixture]).includes(
        `${fixture.path}: duplicate Runner control ingress contract`,
      ),
      fixture.path,
    );
  }

  assert.deepEqual(
    collectAgentOsContractionFindings([
      {
        path: "apps/server/src/agent-os/adapter/in/http/interaction/legacy.dto.ts",
        source: "export interface StartAttemptDto { command: string; }",
      },
      {
        path: "apps/agent-runner/src/control/runner-command-dispatcher.ts",
        source: "const launch = { executable: 'codex', args: [], env: {} };",
      },
      {
        path: "apps/agent-runner/src/provider/provider-command.ts",
        source: "const launch = { executable: 'codex', args: [], env: {} };",
      },
    ]),
    [],
    "only concrete Runner control ingress paths define the shared boundary",
  );
});

test("enforces API-wide relay, proc, and dynamic child-process ownership", () => {
  const findings = collectAgentOsContractionFindings([
    {
      path: "apps/server/src/ai/adapter/out/provider/relay.ts",
      source: "JSON.stringify({ tool: request.tool, arguments: request.arguments });",
    },
    {
      path: "apps/server/src/ai/adapter/out/provider/peer-inspection.ts",
      source: "path.join('/proc', String(process.pid), 'status');",
    },
    {
      path: "apps/server/src/ai/adapter/out/provider/dynamic-process.ts",
      source: "const childProcess = await import('node:child_process');",
    },
    {
      path: "apps/server/src/ai/adapter/out/provider/required-process.ts",
      source: "const childProcess = require('node:child_process');",
    },
  ]);

  for (const [filePath, category] of [
    ["apps/server/src/ai/adapter/out/provider/relay.ts", "API-owned MCP relay"],
    [
      "apps/server/src/ai/adapter/out/provider/peer-inspection.ts",
      "API runtime Linux peer-process inspection",
    ],
    [
      "apps/server/src/ai/adapter/out/provider/dynamic-process.ts",
      "API-owned CLI process supervision",
    ],
    [
      "apps/server/src/ai/adapter/out/provider/required-process.ts",
      "API-owned CLI process supervision",
    ],
  ]) {
    assert.ok(findings.includes(`${filePath}: ${category}`), filePath);
  }
});

test("rejects provider CLI launches and process kills even in child-process allowlists", () => {
  const allowlistedPath = "apps/server/src/ai/adapter/out/wing/playwriter-cli.ts";
  const providerProcessFixtures = [
    "import { spawn } from 'node:child_process'; spawn('codex', []);",
    "import { execFile as launch } from 'node:child_process'; launch('claude.exe', []);",
    "import * as childProcess from 'node:child_process'; childProcess.exec('codex');",
    "const { fork: launch } = require('node:child_process'); launch('claude');",
    "Bun.spawn(['codex']);",
    "process.kill(1234);",
  ];

  for (const source of providerProcessFixtures) {
    assert.ok(
      collectAgentOsContractionFindings([{ path: allowlistedPath, source }]).includes(
        `${allowlistedPath}: API-owned CLI process supervision`,
      ),
      source,
    );
  }

  assert.deepEqual(
    collectAgentOsContractionFindings([
      {
        path: allowlistedPath,
        source: "import { execFile } from 'node:child_process'; execFile('python3', []);",
      },
      {
        path: "apps/server/src/ai/adapter/out/provider/matcher.ts",
        source: "const match = /provider/.exec('codex');",
      },
    ]),
    [],
    "unrelated executable calls and regular-expression exec are not provider process ownership",
  );
});

test("requires an nginx deny boundary for internal Runner routes", () => {
  assert.deepEqual(
    collectAgentOsContractionFindings([
      {
        path: "deploy/office/nginx.conf",
        source: "location ^~ /internal/ { return 404; }",
      },
    ]),
    [],
  );
  assert.ok(
    collectAgentOsContractionFindings([
      {
        path: "deploy/office/nginx.conf",
        source: "location /internal/ { proxy_pass http://kiditem_api; }",
      },
    ]).includes("deploy/office/nginx.conf: nginx internal Agent runtime deny boundary"),
  );
  assert.ok(
    collectAgentOsContractionFindings([
      {
        path: "deploy/office/nginx.conf",
        source:
          "location ^~ /internal/ { proxy_pass http://kiditem_api; }\nlocation / { return 404; }",
      },
    ]).includes("deploy/office/nginx.conf: nginx internal Agent runtime deny boundary"),
    "a return in a later nginx location must not satisfy the internal route deny",
  );
});
