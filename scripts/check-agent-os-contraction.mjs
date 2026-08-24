#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function productionFiles(directory) {
  if (!existsSync(directory)) return [];
  if (statSync(directory).isFile()) {
    return /(?:\.(?:ts|tsx|mjs|prisma|json|conf|ya?ml)|\.env\.example|\.example)$/.test(
      path.basename(directory),
    )
      ? [directory]
      : [];
  }
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : productionFiles(absolute);
    }
    return entry.isFile() &&
      /(?:\.(?:ts|tsx|mjs|prisma|json|conf|ya?ml)|\.env\.example|\.example)$/.test(
        entry.name,
      ) &&
      !/\.(?:spec|test)\.(?:ts|tsx|mjs)$/.test(entry.name)
      ? [absolute]
      : [];
  });
}

const hasPath = (filePath, expression) => expression.test(filePath);

const ATTEMPT_MCP_ADAPTER_ROOT = /^apps\/server\/src\/agent-os\/adapter\/in\/mcp\//;
const ATTEMPT_MCP_SOCKET_SERVER =
  "apps/server/src/agent-os/adapter/in/mcp/attempt-mcp-socket-server.ts";
const ATTEMPT_MCP_STDIO_BRIDGE =
  "apps/server/src/agent-os/adapter/in/mcp/attempt-mcp-stdio-to-uds.ts";
const ATTEMPT_MCP_PROXY =
  "apps/server/src/agent-os/adapter/in/mcp/attempt-mcp-proxy.ts";

function attemptMcpPackageFindings(source) {
  let manifest;
  try {
    manifest = JSON.parse(source);
  } catch {
    return ["MCP dependency manifest invalid"];
  }
  const dependencies = manifest.dependencies ?? {};
  const devDependencies = manifest.devDependencies ?? {};
  const direct = { ...dependencies, ...devDependencies };
  const findings = [];
  if (dependencies["@modelcontextprotocol/server"] !== "2.0.0")
    findings.push("MCP v2 server runtime dependency pin");
  if (devDependencies["@modelcontextprotocol/client"] !== "2.0.0")
    findings.push("MCP v2 client development dependency pin");
  if ("@modelcontextprotocol/sdk" in direct)
    findings.push("MCP v1 SDK direct dependency");
  if ("@modelcontextprotocol/core" in direct)
    findings.push("MCP core direct dependency");
  if ("@anthropic-ai/claude-code" in direct || "@openai/codex" in direct)
    findings.push("API-owned provider CLI dependency");
  if (dependencies["zod-v4"] !== "npm:zod@4.4.3")
    findings.push("MCP Zod v4 runtime dependency pin");
  if (
    dependencies.zod !== "^3.25.0" ||
    dependencies["zod-to-json-schema"] !== "^3.25.2"
  )
    findings.push("MCP Zod 3 compatibility dependency range");
  return findings;
}

function isComposeConfiguration(filePath) {
  return /(?:^|\/)compose(?:\.[^/]+)?\.ya?ml$/.test(filePath) ||
    /^docker-compose(?:\.[^/]+)?\.ya?ml$/.test(filePath);
}

function agentVersionBlock(source) {
  const match = source.match(/model\s+AgentVersion\s*\{([\s\S]*?)\}/);
  return match?.[1] ?? "";
}

function hasForbiddenVersionOrCapabilityState(filePath, source) {
  const forbidden = /\b(?:provider(?:session|history|resume|credential|token|apikey|secret|key)?|model(?:name|id|config|selection)?|credential(?:s|id)?|history|resume)\w*\b/i;
  if (
    filePath === "prisma/models/agent-work.prisma" &&
    forbidden.test(agentVersionBlock(source))
  ) {
    return true;
  }
  return (
    /(?:common|agent-os\/domain\/capability)\/capability-definition\.ts$/.test(filePath) &&
    /(?:interface|type)\s+CapabilityDefinition[\s\S]*?\{[\s\S]*?\b(?:provider(?:session|history|resume|credential|token|apikey|secret|key)?|model(?:name|id|config|selection)?|credential(?:s|id)?|history|resume)\w*\s*:/i.test(
      source,
    )
  );
}

function hasPersistedRunnerControlState(filePath, source) {
  return (
    /^prisma\/models\/.+\.prisma$/.test(filePath) &&
    /model\s+(?:Runner(?:Lease|Command|Event|Control|Token)|AgentRuntime(?:Lease|Command|Event|Control|Token)|Attempt(?:Token|Lease|Command|Event))\b/.test(
      source,
    )
  );
}

function hasDuplicateRuntimeContract(filePath, source) {
  if (filePath.startsWith("packages/shared/src/agent-runtime/")) return false;
  return (
    /\b(?:export\s+)?const\s+ATTEMPT_RUNTIME_TRAIN\b/.test(source) ||
    /\b(?:export\s+)?const\s+(?:RunnerPlatformSchema|AgentCliRuntimeSchema)\b/.test(source) ||
    /\b(?:export\s+)?type\s+(?:AttemptRuntimeType|RunnerPlatform|AgentCliRuntime)\s*=/.test(source) ||
    /z\.enum\s*\(\s*\[[^\]]*['"](?:macos|codex_cli)['"][^\]]*\]\s*\)/.test(source)
  );
}

function hasRawLaunchCommandField(source) {
  return /(?:\{|,)\s*(?:command|executable|shell|args|env|cwd|path|loginHome|organizationId|userId|sessionId|database(?:Url)?|(?:provider)?Credential(?:s)?|(?:provider)?(?:Api)?Key|hmac(?:Key|Secret)?)\s*:\s*(?:z\.|[A-Za-z_$][\w$]*Schema\b)/i.test(
    source,
  );
}

function hasInternalAgentRuntimeRouteOutsidePrefix(source) {
  const routeLiterals = [
    ...source.matchAll(
      /(?:@(?:All|Controller|Delete|Get|Patch|Post|Put)\s*\(\s*|basePath\s*:\s*)['"`]([^'"`]*)['"`]/g,
    ),
  ].map((match) => match[1]);
  return routeLiterals.some(
    (route) =>
      /(?:runner|attempt|mcp)/i.test(route) &&
      !/(?:^|\/)internal\/agent-runtime(?:\/|$)/.test(route),
  );
}

function hasNginxInternalAgentRuntimeDenyBoundary(source) {
  return /location\s+\^~\s+\/api\/internal\/(?:agent-runtime\/)?\s*\{[\s\S]*?return\s+404\s*;/m.test(
    source,
  );
}

function findingsFor({ path: filePath, source }) {
  const findings = [];
  if (filePath === "apps/server/package.json")
    findings.push(...attemptMcpPackageFindings(source));

  const isAgentOsSource = /^apps\/server\/src\/agent-os\//.test(filePath);
  const isAttemptMcpAdapter = ATTEMPT_MCP_ADAPTER_ROOT.test(filePath);
  if (isAgentOsSource && /@modelcontextprotocol\/sdk(?:\/|["'])/.test(source))
    findings.push("MCP v1 source import");
  if (isAgentOsSource && /@modelcontextprotocol\/core(?:\/|["'])/.test(source))
    findings.push("MCP core source import");
  if (
    isAttemptMcpAdapter &&
    /(?:legacy_compatible|ATTEMPT_MCP_PROTOCOL_MODE|OPERATOR_MCP_MODE)/i.test(
      source + filePath,
    )
  )
    findings.push("retired MCP protocol mode");
  if (filePath === ATTEMPT_MCP_PROXY || source.includes("attempt-mcp-proxy"))
    findings.push("retired MCP proxy relay");
  if (
    filePath === ATTEMPT_MCP_SOCKET_SERVER ||
    filePath === ATTEMPT_MCP_STDIO_BRIDGE ||
    /attempt-mcp-(?:socket-server|stdio-to-uds)/.test(source)
  )
    findings.push("retired UDS/stdio MCP transport");
  if (isAttemptMcpAdapter && /new\s+StdioServerTransport\s*\(\s*\)/.test(source))
    findings.push("zero-argument MCP stdio transport");
  if (isAttemptMcpAdapter && /\bserver\.connect\s*\(/.test(source))
    findings.push("direct MCP server connect");
  if (isAttemptMcpAdapter && /JSON\.parse\s*\(\s*line\s*\)/.test(source))
    findings.push("line-oriented MCP JSON relay");
  if (
    isAttemptMcpAdapter &&
    /JSON\.stringify\s*\(\s*\{\s*tool\s*,\s*arguments\b/.test(source)
  )
    findings.push("custom MCP tool relay");
  if (isAttemptMcpAdapter && /\blet\s+handled\s*=\s*false\b/.test(source))
    findings.push("one-request-per-socket MCP routing");
  if (
    isAgentOsSource &&
    filePath !== ATTEMPT_MCP_SOCKET_SERVER &&
    /\b(?:StdioServerTransport|serveStdio)\b/.test(source)
  )
    findings.push("MCP SDK construction outside private socket server");
  if (filePath === ATTEMPT_MCP_SOCKET_SERVER) {
    const configuredTransport =
      /new\s+StdioServerTransport\s*\(\s*socket\s*,\s*socket\s*,\s*\{\s*maxBufferSize\s*:\s*64\s*\*\s*1024\s*,?\s*\}\s*\)/gs;
    const hasExactlyOneConfiguredTransport = [...source.matchAll(configuredTransport)].length === 1;
    const hasExactlyOneTransportConstruction =
      [...source.matchAll(/new\s+StdioServerTransport\s*\(/g)].length === 1;
    const rejectsLegacy =
      /serveStdio\s*\(/.test(source) &&
      /\btransport\s*,\s*legacy\s*:\s*["']reject["']/.test(source);
    if (
      !hasExactlyOneConfiguredTransport ||
      !hasExactlyOneTransportConstruction ||
      !rejectsLegacy
    )
      findings.push("modern MCP UDS transport contract");
  }
  if (filePath === ATTEMPT_MCP_STDIO_BRIDGE) {
    const imports = [...source.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map(
      (match) => match[1],
    );
    const allowedImports = new Set([
      "node:events",
      "node:net",
      "node:stream",
      "node:timers/promises",
    ]);
    if (imports.some((specifier) => !allowedImports.has(specifier)))
      findings.push("MCP byte bridge import boundary");
    if (
      /@modelcontextprotocol|JSON\.(?:parse|stringify)|\b(?:capability_[a-z_]+|invocation_[a-z_]+|delegate_to_agent|child_[a-z_]+)\b|AttemptMcpActionsPort|application\/port/i.test(
        source,
      )
    )
      findings.push("MCP byte bridge protocol parsing/routing");
    if (/https?:\/\/|\b(?:host|port)\s*:/i.test(source))
      findings.push("MCP byte bridge network fallback");
  }
  if (
    /(?:legacy_compatible|ATTEMPT_MCP_PROTOCOL_MODE|OPERATOR_MCP_MODE)/i.test(
      source + filePath,
    ) &&
    !findings.includes("retired MCP protocol mode")
  )
    findings.push("retired MCP protocol mode");
  if (
    isComposeConfiguration(filePath) &&
    /(?:^|\n)\s*(?:-\s*)?(?:ATTEMPT_MCP_PROTOCOL_MODE|OPERATOR_MCP_MODE|[A-Z0-9_]*MCP_(?:SDK|PROTOCOL|MODE)[A-Z0-9_]*)\s*[:=]/m.test(
      source,
    )
  )
    findings.push("MCP/provider protocol control configuration");
  if (
    /^(?:apps\/server\/(?:\.env\.example|Dockerfile)|deploy\/office\/compose\.office\.yml)$/.test(
      filePath,
    ) &&
    /(?:KIDITEM_ATTEMPT_LOGIN_HOME|CODEX_HOME|CLAUDE_CONFIG_DIR|\b(?:codex|claude)\b[^\n]*(?:login|auth))/i.test(
      source,
    )
  )
    findings.push("API login-home/provider-login configuration");
  if (
    filePath === "apps/server/Dockerfile" &&
    /\b(?:codex|claude)\s+--version\b/i.test(source)
  )
    findings.push("API image provider CLI assertion");
  if (
    isAgentOsSource &&
    /(?:node:child_process|\bchild_process\b|\b(?:spawn|exec|execFile|execSync|fork)\s*\(|\bprocess\.kill\s*\()/i.test(
      source,
    )
  )
    findings.push("API-owned CLI process supervision");
  if (isAgentOsSource && /(?:^|[^A-Za-z0-9_])\/proc\//.test(source))
    findings.push("API runtime Linux peer-process inspection");
  if (
    filePath.startsWith("apps/agent-runner/") &&
    /(?:\b(?:createServer|listen)\s*\(|\.listen\s*\()/i.test(source)
  )
    findings.push("Runner inbound listener or LAN exposure");
  if (filePath.startsWith("packages/shared/src/agent-runtime/") && hasRawLaunchCommandField(source))
    findings.push("raw launch command field");
  if (hasPersistedRunnerControlState(filePath, source))
    findings.push("Runner control-plane persistence");
  if (hasForbiddenVersionOrCapabilityState(filePath, source))
    findings.push("provider/model/session persistence on AgentVersion");
  if (
    /^prisma\/models\/.+\.prisma$/.test(filePath) &&
    /\bprovider(?:Session|History|Resume)\w*\s+\w+/i.test(source)
  )
    findings.push("provider session/history/resume persistence");
  if (hasDuplicateRuntimeContract(filePath, source))
    findings.push("duplicate runtime train/platform contract");
  if (
    /^apps\/server\/src\/agent-os\/adapter\/in\/http\/runtime\//.test(filePath) &&
    hasInternalAgentRuntimeRouteOutsidePrefix(source)
  )
    findings.push("Agent runtime route outside internal prefix");
  if (
    filePath === "deploy/office/nginx.conf" &&
    !hasNginxInternalAgentRuntimeDenyBoundary(source)
  )
    findings.push("nginx internal Agent runtime deny boundary");
  if (
    /^(?:apps\/server\/src\/agent-os\/|packages\/shared\/src\/|prisma\/models\/)/.test(filePath) &&
    /\bAgent(?:SessionTask|WorkTask|WorkSession|WorkVersion)\b/.test(source)
  )
    findings.push("legacy task model/name");
  if (
    hasPath(filePath, /^apps\/server\/src\/agent-os\//) &&
    /\bAgent(?:Run(?:Request|Event)?|Execution(?:Attempt)?)\b/.test(source)
  )
    findings.push("legacy AgentRun symbol");
  if (
    hasPath(filePath, /^apps\/server\/src\/agent-os\//) &&
    !/\/application\/(?:port\/out\/work\/agent-live-message\.port|service\/work\/agent-live-message\.service)\.ts$/.test(filePath) &&
    hasPath(
      filePath,
      /(?:conversation|message|event|replay|summarizer|live-publisher|live-join)/i,
    )
  )
    findings.push("legacy conversation/replay surface");
  if (
    hasPath(filePath, /^apps\/server\/src\/agent-os\//) &&
    hasPath(
      filePath,
      /(?:artifact|materialization|provider-upload|storage-agent-session)/i,
    )
  )
    findings.push("legacy artifact/storage surface");
  if (
    hasPath(filePath, /^apps\/server\/src\/agent-os\//) &&
    hasPath(filePath, /(?:cost|usage)/i)
  )
    findings.push("legacy usage/cost surface");
  if (
    hasPath(filePath, /^apps\/server\/src\/agent-os\//) &&
    hasPath(
      filePath,
      /(?:authority-profile|policy-snapshot|execution-grant|dispatch-outbox)/i,
    )
  )
    findings.push("legacy authority/grant/outbox surface");
  if (
    hasPath(filePath, /^apps\/server\/src\/agent-os\//) &&
    hasPath(filePath, /(?:playbook|tool-wrapper)/i)
  )
    findings.push("legacy fixed playbook/tool-wrapper surface");
  if (
    hasPath(filePath, /^apps\/server\/src\/agent-os\//) &&
    /\bruntimeKind\s*:\s*["']tool_wrapper["']|\bdefaultToolPolicies\s*:|\bplaybookKeys\s*:/.test(
      source,
    )
  )
    findings.push("legacy fixed playbook/tool-wrapper metadata");
  if (
    filePath ===
      "apps/server/src/agent-os/application/port/out/capability/agent-capability-handler.port.ts" &&
    /\bexecutionKind\b/.test(source) &&
    /\bsideEffects\b/.test(source) &&
    /(?:\bArtifactOutput\b|\bartifacts?\b)/.test(source)
  )
    findings.push("legacy handler metadata");
  if (
    hasPath(filePath, /^apps\/server\/src\/agent-os\//) &&
    /(?:continuationMode|continuationKey|background continuation|operation-to-agent|-continuation\.)/i.test(
      source + filePath,
    )
  )
    findings.push("legacy continuation surface");
  if (
    hasPath(filePath, /^apps\/server\/src\/agent-os\//) &&
    /(?:advisory|release-drain|coordinated-deletion)/i.test(source + filePath)
  )
    findings.push("legacy advisory/release/deletion surface");
  if (
    hasPath(filePath, /^apps\/server\/src\/agent-os\//) &&
    hasPath(
      filePath,
      /(?:hermes|openai|gateway|credential-broker|handle-codec|provider-session)/i,
    )
  )
    findings.push("legacy provider/gateway runtime surface");
  if (
    hasPath(filePath, /^apps\/server\/src\/agent-os\//) &&
    /(?:KIDITEM_MCP_EXECUTION_CONTEXT|INTERACTION_[A-Z_]*HMAC_KEY|AGENT_RUNTIME_CREDENTIAL_HMAC_KEY|full-nest-mcp)/.test(
      source + filePath,
    )
  )
    findings.push("legacy full-Nest MCP/HMAC runtime surface");
  if (
    hasPath(filePath, /^apps\/web\/src\/app\/\(automation\)\/agents\//) ||
    hasPath(
      filePath,
      /^apps\/web\/src\/app\/agent-os\/(?:components|lib|network)\//,
    )
  )
    findings.push("legacy Web Agent OS path");
  if (
    [
      "packages/shared/src/agent-os.ts",
      "packages/shared/src/schemas/agent-os.ts",
    ].includes(filePath)
  )
    findings.push("legacy shared Agent OS export");
  if (
    hasPath(
      filePath,
      /^packages\/shared\/src\/agent-interaction\/(?:durable-runtime|deletion|ui)\.ts$/,
    )
  )
    findings.push("legacy shared interaction export");
  if (
    filePath === "prisma/models/agents.prisma" &&
    /model\s+Agent(?:Run(?:Request|Event)?|Execution(?:Attempt)?)\b/.test(
      source,
    )
  )
    findings.push("legacy AgentRun model");
  if (
    filePath === "prisma/models/agents.prisma" &&
    /model\s+Agent(?:Conversation|Message|ConversationEvent|ConversationOutbox)\b/.test(
      source,
    )
  )
    findings.push("legacy conversation/replay model");
  if (
    filePath === "prisma/models/agents.prisma" &&
    /model\s+Agent(?:Artifact|SessionArtifact|SessionArtifactMaterialization)\b/.test(
      source,
    )
  )
    findings.push("legacy artifact/storage model");
  if (
    filePath === "prisma/models/agents.prisma" &&
    /model\s+Agent(?:ExecutionUsage|CostEvent)\b/.test(source)
  )
    findings.push("legacy usage/cost model");
  if (
    filePath === "prisma/models/agents.prisma" &&
    /model\s+AgentSessionApprovalContinuation\b/.test(source)
  )
    findings.push("legacy continuation model");
  if (
    filePath === "prisma/models/agents.prisma" &&
    /model\s+AgentSessionDeletionOperationBinding\b/.test(source)
  )
    findings.push("legacy deletion binding model");
  if (
    filePath === "prisma/models/agents.prisma" &&
    /model\s+Agent(?:Instance|InstanceToolPolicy|ToolInvocation)\b/.test(source)
  )
    findings.push("legacy instance/tool policy model");
  if (
    filePath === "prisma/models/agents.prisma" &&
    /model\s+Agent(?:PolicySnapshot|AuthorityProfileVersion|ExecutionDispatchOutbox|AuthorizationEvent|ApprovalRequest)\b/.test(
      source,
    )
  )
    findings.push("legacy authority/grant/outbox model");
  if (
    /^(?:apps\/server\/\.env\.example|(?:deploy|docker|infra|\.github\/workflows)\/|docker-compose(?:\.[^/]+)?\.ya?ml$)/.test(
      filePath,
    ) &&
    /(?:AGENT_GATEWAY|GATEWAY_URL|KIDITEM_MCP_EXECUTION_CONTEXT|(?:INTERACTION|AGENT_RUNTIME_CREDENTIAL)_[A-Z_]*HMAC_KEY|AGENT_RUNTIME_WORKER_ENABLED|agentGateway)/.test(
      source,
    )
  )
    findings.push("legacy gateway configuration");
  return findings.map((finding) => `${filePath}: ${finding}`);
}

export function collectAgentOsContractionFindings(files) {
  return files.flatMap(findingsFor);
}

export function contractionRoots(root) {
  return [
    path.join(root, "apps/server/src/agent-os"),
    path.join(root, "apps/server/.env.example"),
    path.join(root, "apps/server/package.json"),
    path.join(root, "apps/server/Dockerfile"),
    path.join(root, "apps/agent-runner"),
    path.join(root, "apps/web/src"),
    path.join(root, "apps/web/next.config.mjs"),
    path.join(root, "packages/shared/src"),
    path.join(root, "prisma/models"),
    path.join(root, "deploy"),
    path.join(root, "docker"),
    path.join(root, "infra"),
    path.join(root, ".github/workflows"),
    path.join(root, "docker-compose.yml"),
  ];
}

function main() {
  const mode = process.argv.includes("--enforce") ? "enforce" : "report";
  if (!process.argv.includes("--report") && mode !== "enforce")
    throw new Error("Use --report or --enforce");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const findings = collectAgentOsContractionFindings(
    contractionRoots(root)
      .flatMap(productionFiles)
      .map((file) => ({
        path: path.relative(root, file),
        source: readFileSync(file, "utf8"),
      })),
  );
  console.log(
    `check:agent-os-contraction ${mode.toUpperCase()} (${findings.length} findings)`,
  );
  for (const finding of findings) console.log(`- ${finding}`);
  if (mode === "enforce" && findings.length > 0) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  main();
