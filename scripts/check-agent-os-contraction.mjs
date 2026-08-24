#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

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
const SERVER_CHILD_PROCESS_ALLOWLIST = new Set([
  "apps/server/src/ai/adapter/out/wing/playwriter-cli.ts",
  "apps/server/src/orders/coupang-directship/coupang-directship.service.ts",
  "apps/server/src/test-helpers/postgres-global-setup.ts",
]);
const RAW_LAUNCH_FIELD_NAMES = new Set([
  "command",
  "executable",
  "shell",
  "args",
  "env",
  "cwd",
  "path",
  "loginhome",
  "organizationid",
  "userid",
  "sessionid",
  "database",
  "databaseurl",
  "credential",
  "credentials",
  "providercredential",
  "providercredentials",
  "providerapikey",
  "providerkey",
  "hmac",
  "hmackey",
  "hmacsecret",
]);

function sourceFile(filePath, source) {
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
}

function normalizedName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function propertyName(node) {
  if (
    ts.isIdentifier(node) ||
    ts.isStringLiteral(node) ||
    ts.isNumericLiteral(node)
  ) {
    return node.text;
  }
  return null;
}

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

function prismaModelBlocks(source) {
  return [...source.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)].map(
    ([, name, body]) => ({ name, body }),
  );
}

function prismaFieldNames(body) {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim().match(/^([A-Za-z][A-Za-z0-9_]*)\s+/)?.[1])
    .filter(Boolean);
}

function hasPersistedRunnerControlState(filePath, source) {
  if (!/^prisma\/models\/.+\.prisma$/.test(filePath)) return false;
  if (
    /model\s+(?:Runner(?:Lease|Command|Event|Control|Token)|AgentRuntime(?:Lease|Command|Event|Control|Token)|Attempt(?:Token|Lease|Command|Event))\b/.test(
      source,
    )
  ) {
    return true;
  }
  return prismaModelBlocks(source).some(({ name, body }) => {
    const isAgentControlModel = /^Agent(?:Attempt|Runtime|Runner|Session|Task)$/.test(
      name,
    );
    return prismaFieldNames(body).some((field) => {
      const normalized = normalizedName(field);
      return (
        /^runner(?:lease|command|event|control|token|instance)[a-z0-9]*$/.test(
          normalized,
        ) ||
        (isAgentControlModel &&
          (/^(?:agentruntime|attempt)(?:lease|command|event|control|token)[a-z0-9]*$/.test(
            normalized,
          ) ||
            /^(?:lease|command|event)(?:id|hash|seq)[a-z0-9]*$/.test(
              normalized,
            )))
      );
    });
  });
}

function hasPersistedProviderSessionHistoryResume(filePath, source) {
  if (!/^prisma\/models\/.+\.prisma$/.test(filePath)) return false;
  return prismaModelBlocks(source).some(({ body }) =>
    prismaFieldNames(body).some((field) =>
      /^(?:provider|codex|claude)(?:session|history|resume)[a-z0-9]*$/.test(
        normalizedName(field),
      ),
    ),
  );
}

function literalUnionValues(node) {
  if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) {
    return [node.literal.text];
  }
  if (ts.isUnionTypeNode(node)) return node.types.flatMap(literalUnionValues);
  return [];
}

function containsRuntimeLiteralUnion(node) {
  const values = new Set(literalUnionValues(node));
  return (
    (values.has("macos") && values.has("windows")) ||
    (values.has("codex_cli") && values.has("claude_cli"))
  );
}

function hasDuplicateRuntimeContract(filePath, source) {
  if (filePath.startsWith("packages/shared/src/agent-runtime/")) return false;
  if (
    /\b(?:export\s+)?const\s+ATTEMPT_RUNTIME_TRAIN\b/.test(source) ||
    /\b(?:export\s+)?const\s+(?:RunnerPlatformSchema|AgentCliRuntimeSchema)\b/.test(source) ||
    /\b(?:export\s+)?type\s+(?:AttemptRuntimeType|RunnerPlatform|AgentCliRuntime)\s*=/.test(source) ||
    /z\.enum\s*\(\s*\[[^\]]*['"](?:macos|codex_cli)['"][^\]]*\]\s*\)/.test(source)
  ) {
    return true;
  }
  let duplicate = false;
  const visit = (node) => {
    if (ts.isTypeAliasDeclaration(node) && containsRuntimeLiteralUnion(node.type)) {
      duplicate = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile(filePath, source));
  return duplicate;
}

function isSchemaInitializer(node) {
  if (ts.isIdentifier(node)) return node.text.endsWith("Schema");
  if (!ts.isCallExpression(node)) return false;
  const expression = node.expression;
  return (
    (ts.isPropertyAccessExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === "z") ||
    (ts.isPropertyAccessExpression(expression) &&
      expression.name.text.endsWith("Schema")) ||
    (ts.isIdentifier(expression) && expression.text.endsWith("Schema"))
  );
}

function hasRawLaunchCommandField(filePath, source) {
  let found = false;
  const visit = (node) => {
    if (ts.isPropertySignature(node)) {
      const name = propertyName(node.name);
      if (name && RAW_LAUNCH_FIELD_NAMES.has(normalizedName(name))) found = true;
    }
    if (ts.isPropertyAssignment(node)) {
      const name = propertyName(node.name);
      if (
        name &&
        RAW_LAUNCH_FIELD_NAMES.has(normalizedName(name)) &&
        isSchemaInitializer(node.initializer)
      ) {
        found = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile(filePath, source));
  return found;
}

function routeEntries(source) {
  const decorators = [
    ...source.matchAll(
      /@(?:All|Controller|Delete|Get|Patch|Post|Put)\s*\(\s*['"`]([^'"`]*)['"`]/g,
    ),
  ].map((match) => ({
    decorator: match[0].match(/@([A-Za-z]+)/)?.[1] ?? "",
    route: match[1],
  }));
  const basePaths = [...source.matchAll(/basePath\s*:\s*['"`]([^'"`]*)['"`]/g)].map(
    (match) => ({ decorator: "basePath", route: match[1] }),
  );
  return [...decorators, ...basePaths];
}

function hasInternalAgentRuntimeRouteOutsidePrefix(source) {
  return routeEntries(source).some(
    ({ decorator, route }) =>
      ((decorator === "Controller" || decorator === "basePath")
        ? /(?:runner|agent-runtime)/i.test(route)
        : /(?:runner|(?:^|\/)internal\/agent-runtime)/i.test(route)) &&
      !/^\/?api\/internal\/agent-runtime(?:\/|$)/.test(route),
  );
}

function hasCustomMcpToolRelay(filePath, source) {
  let found = false;
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "JSON" &&
      node.expression.name.text === "stringify"
    ) {
      found ||= node.arguments.some((argument) => {
        if (!ts.isObjectLiteralExpression(argument)) return false;
        const keys = new Set(
          argument.properties
            .map((property) =>
              ts.isPropertyAssignment(property) ||
              ts.isShorthandPropertyAssignment(property)
                ? propertyName(property.name)
                : null,
            )
            .filter(Boolean),
        );
        return keys.has("tool") && keys.has("arguments");
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile(filePath, source));
  return found;
}

function hasProcInspection(filePath, source) {
  if (/(?:^|[^A-Za-z0-9_])\/proc\//.test(source)) return true;
  let found = false;
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "join" &&
      ts.isStringLiteral(node.arguments[0]) &&
      node.arguments[0].text === "/proc"
    ) {
      found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile(filePath, source));
  return found;
}

function isRuntimeChildProcessImport(statement) {
  if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
    return false;
  }
  if (!/^(?:node:)?child_process$/.test(statement.moduleSpecifier.text)) return false;
  const clause = statement.importClause;
  if (!clause || clause.isTypeOnly) return false;
  if (clause.name) return true;
  const bindings = clause.namedBindings;
  if (!bindings || ts.isNamespaceImport(bindings)) return true;
  return bindings.elements.some((element) => !element.isTypeOnly);
}

function isChildProcessRequire(node) {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "require" &&
    node.arguments.length === 1 &&
    ts.isStringLiteral(node.arguments[0]) &&
    /^(?:node:)?child_process$/.test(node.arguments[0].text)
  );
}

function hasChildProcessBinding(filePath, source) {
  const parsed = sourceFile(filePath, source);
  if (parsed.statements.some(isRuntimeChildProcessImport)) return true;
  let found = false;
  const visit = (node) => {
    if (isChildProcessRequire(node)) found = true;
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return found;
}

function hasProviderCliProcessApi(source) {
  return /\b(?:spawn|exec|execFile|execSync|fork)\s*\(\s*['"](?:codex|claude)(?:\.exe)?['"]|\bBun\.spawn\s*\(\s*\[\s*['"](?:codex|claude)(?:\.exe)?['"]/i.test(
    source,
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
  const isServerSource = /^apps\/server\/src\//.test(filePath);
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
  if (isAttemptMcpAdapter && hasCustomMcpToolRelay(filePath, source))
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
    isServerSource &&
    !SERVER_CHILD_PROCESS_ALLOWLIST.has(filePath) &&
    (
      hasChildProcessBinding(filePath, source) ||
      hasProviderCliProcessApi(source) ||
      /\bprocess\.kill\s*\(/.test(source)
    )
  )
    findings.push("API-owned CLI process supervision");
  if (isAgentOsSource && hasProcInspection(filePath, source))
    findings.push("API runtime Linux peer-process inspection");
  if (
    filePath.startsWith("apps/agent-runner/") &&
    /(?:\b(?:createServer|listen)\s*\(|\.listen\s*\()/i.test(source)
  )
    findings.push("Runner inbound listener or LAN exposure");
  if (
    filePath.startsWith("packages/shared/src/agent-runtime/") &&
    hasRawLaunchCommandField(filePath, source)
  )
    findings.push("raw launch command field");
  if (hasPersistedRunnerControlState(filePath, source))
    findings.push("Runner control-plane persistence");
  if (hasForbiddenVersionOrCapabilityState(filePath, source))
    findings.push("provider/model/session persistence on AgentVersion");
  if (hasPersistedProviderSessionHistoryResume(filePath, source))
    findings.push("provider session/history/resume persistence");
  if (hasDuplicateRuntimeContract(filePath, source))
    findings.push("duplicate runtime train/platform contract");
  if (isServerSource && hasInternalAgentRuntimeRouteOutsidePrefix(source))
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
    path.join(root, "apps/server/src"),
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
