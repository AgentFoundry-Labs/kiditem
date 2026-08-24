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

const SERVER_CHILD_PROCESS_ALLOWLIST = new Set([
  "apps/server/src/ai/adapter/out/wing/playwriter-cli.ts",
  "apps/server/src/orders/coupang-directship/coupang-directship.service.ts",
  "apps/server/src/test-helpers/postgres-global-setup.ts",
]);
const RAW_LAUNCH_AUTHORITY_FIELD_NAMES = new Set([
  "command",
  "executable",
  "shell",
  "args",
  "env",
  "cwd",
  "path",
  "loginhome",
  "organization",
  "organizationid",
  "organizationauthority",
  "user",
  "userid",
  "userauthority",
  "session",
  "sessionid",
  "sessionauthority",
]);
const ACTIVE_SECRET_WORDS = new Set([
  "secret",
  "credential",
  "credentials",
  "password",
  "passphrase",
]);
const ACTIVE_SECRET_COMPOSITES = [
  "accesstoken",
  "bearertoken",
  "oauthtoken",
  "apitoken",
  "apikey",
  "privatekey",
  "connectionstring",
  "connectionurl",
  "connectiondsn",
];
const EPHEMERAL_RUNNER_CONTROL_PREFIXES = [
  "attempt",
  "lease",
  "command",
  "event",
  "poll",
  "token",
  "ack",
  "control",
  "state",
];
const EPHEMERAL_RUNNER_CONTROL_SUFFIX = /^(?:id|seq|payload|batch|ack(?:nowledg(?:e)?ment)?|token|expires(?:at)?|expiry|deadline|ttl(?:ms)?|state|lease|command|event|poll|control)?$/;

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

function propertyNameWords(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

function isActiveSecretOrCredentialName(name) {
  const normalized = normalizedName(name);
  return (
    propertyNameWords(name).some((word) => ACTIVE_SECRET_WORDS.has(word)) ||
    ACTIVE_SECRET_COMPOSITES.some((composite) => normalized.includes(composite))
  );
}

function isRawLaunchFieldName(name) {
  return (
    RAW_LAUNCH_AUTHORITY_FIELD_NAMES.has(normalizedName(name)) ||
    isActiveSecretOrCredentialName(name)
  );
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

function prismaModelBlocks(source) {
  return [...source.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\}/g)].map(
    ([, name, body]) => ({ name, body }),
  );
}

function prismaFieldNames(body) {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim().match(/^([A-Za-z][A-Za-z0-9_]*)\s+/)?.[1])
    .filter(Boolean);
}

function isAgentOsPersistenceModel(filePath, name) {
  return (
    filePath === "prisma/models/agent-work.prisma" &&
    normalizedName(name).startsWith("agent")
  );
}

function isRunnerControlModel(name) {
  const normalized = normalizedName(name);
  return (
    normalized === "agentattempt" ||
    normalized.startsWith("agentruntime") ||
    normalized.startsWith("runner")
  );
}

function isDedicatedRunnerControlModel(name) {
  return /^(?:runner|agentruntime)(?:lease|command|event|poll|token|ack|control|state)/.test(
    normalizedName(name),
  );
}

function isEphemeralRunnerControlName(normalized) {
  return EPHEMERAL_RUNNER_CONTROL_PREFIXES.some((prefix) => {
    if (!normalized.startsWith(prefix)) return false;
    return EPHEMERAL_RUNNER_CONTROL_SUFFIX.test(normalized.slice(prefix.length));
  });
}

function isRunnerControlFieldName(modelName, fieldName) {
  if (!isRunnerControlModel(modelName)) return false;
  const normalized = normalizedName(fieldName);
  const runnerSpecificName = normalized.startsWith("runner")
    ? normalized.slice("runner".length)
    : null;
  return (
    isActiveSecretOrCredentialName(fieldName) ||
    isEphemeralRunnerControlName(normalized) ||
    Boolean(runnerSpecificName && isEphemeralRunnerControlName(runnerSpecificName))
  );
}

function hasPersistedRunnerControlState(filePath, source) {
  if (!/^prisma\/models\/.+\.prisma$/.test(filePath)) return false;
  return prismaModelBlocks(source).some(
    ({ name, body }) =>
      isDedicatedRunnerControlModel(name) ||
      prismaFieldNames(body).some(
        (field) =>
          isRunnerControlFieldName(name, field) ||
          (isAgentOsPersistenceModel(filePath, name) &&
            isActiveSecretOrCredentialName(field)),
      ),
  );
}

function hasPersistedProviderSessionHistoryResume(filePath, source) {
  if (!/^prisma\/models\/.+\.prisma$/.test(filePath)) return false;
  return prismaModelBlocks(source).some(
    ({ name, body }) =>
      isAgentOsPersistenceModel(filePath, name) &&
      prismaFieldNames(body).some((field) =>
        /^(?:provider|codex|claude)(?:session|history|resume)[a-z0-9]*$/.test(
          normalizedName(field),
        ),
      ),
  );
}

function isForbiddenAgentDefinitionStateName(name) {
  const normalized = normalizedName(name);
  return (
    normalized.startsWith("provider") ||
    normalized.startsWith("model") ||
    isActiveSecretOrCredentialName(name)
  );
}

function hasForbiddenAgentVersionState(filePath, source) {
  if (filePath !== "prisma/models/agent-work.prisma") return false;
  return prismaModelBlocks(source).some(
    ({ name, body }) =>
      name === "AgentVersion" &&
      prismaFieldNames(body).some(isForbiddenAgentDefinitionStateName),
  );
}

function hasForbiddenCapabilityDefinitionState(filePath, source) {
  if (!/(?:common|agent-os\/domain\/capability)\/capability-definition\.ts$/.test(filePath)) {
    return false;
  }
  let found = false;
  const visit = (node) => {
    const type = ts.isInterfaceDeclaration(node)
      ? node
      : ts.isTypeAliasDeclaration(node) && ts.isTypeLiteralNode(node.type)
        ? node.type
        : null;
    if (
      type &&
      ((ts.isInterfaceDeclaration(type) && type.name.text === "CapabilityDefinition") ||
        (ts.isTypeLiteralNode(type) &&
          ts.isTypeAliasDeclaration(node) &&
          node.name.text === "CapabilityDefinition"))
    ) {
      const members = ts.isInterfaceDeclaration(type) ? type.members : type.members;
      found ||= members.some(
        (member) =>
          ts.isPropertySignature(member) &&
          member.name &&
          propertyName(member.name) &&
          isForbiddenAgentDefinitionStateName(propertyName(member.name)),
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile(filePath, source));
  return found;
}

function literalUnionValues(node) {
  if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) {
    return [node.literal.text];
  }
  if (ts.isUnionTypeNode(node)) return node.types.flatMap(literalUnionValues);
  return [];
}

function hasDuplicateRuntimeContract(filePath, source) {
  if (filePath.startsWith("packages/shared/src/agent-runtime/")) return false;
  if (
    /\b(?:export\s+)?const\s+ATTEMPT_RUNTIME_TRAIN\b/.test(source) ||
    /\b(?:export\s+)?const\s+(?:RunnerPlatformSchema|AgentCliRuntimeSchema)\b/.test(
      source,
    ) ||
    /\b(?:export\s+)?type\s+(?:AttemptRuntimeType|RunnerPlatform|AgentCliRuntime)\s*=/.test(
      source,
    ) ||
    /z\.enum\s*\(\s*\[[^\]]*['"](?:macos|codex_cli)['"][^\]]*\]\s*\)/.test(source)
  ) {
    return true;
  }
  let duplicate = false;
  const visit = (node) => {
    if (ts.isTypeAliasDeclaration(node)) {
      const values = new Set(literalUnionValues(node.type));
      duplicate ||= 
        (values.has("macos") && values.has("windows")) ||
        (values.has("codex_cli") && values.has("claude_cli"));
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

function hasRawLaunchField(filePath, source) {
  let found = false;
  const visit = (node) => {
    if (ts.isPropertySignature(node)) {
      const name = propertyName(node.name);
      if (name && isRawLaunchFieldName(name)) found = true;
    }
    if (ts.isPropertyAssignment(node)) {
      const name = propertyName(node.name);
      if (name && isRawLaunchFieldName(name) && isSchemaInitializer(node.initializer)) {
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
      !/^\/?(?:api\/)?internal\/agent-runtime(?:\/|$)/.test(route),
  );
}

function hasCustomMcpRelay(filePath, source) {
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

function hasUdsOrStdioRelay(source) {
  const hasStdioMcp = /\b(?:StdioServerTransport|serveStdio)\b/.test(source);
  const hasNodeNetImport = /(?:from|require\()\s*['"](?:node:)?net['"]/.test(source);
  const hasSocketEndpoint = /\b(?:socketPath|unix:|\.sock\b)/i.test(source);
  const hasSocketLifecycle = /\b(?:createServer|createConnection|connect|listen)\s*\(/.test(source);
  const hasProcessStdio = /\bprocess\.(?:stdin|stdout|stderr)\b/.test(source);
  return (
    hasStdioMcp ||
    (hasSocketEndpoint && hasSocketLifecycle) ||
    (hasNodeNetImport && (hasSocketEndpoint || hasProcessStdio))
  );
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

function hasChildProcessBinding(filePath, source) {
  const parsed = sourceFile(filePath, source);
  if (parsed.statements.some(isRuntimeChildProcessImport)) return true;
  let found = false;
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require" &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]) &&
      /^(?:node:)?child_process$/.test(node.arguments[0].text)
    ) {
      found = true;
    }
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
  const isAgentOsSource = /^apps\/server\/src\/agent-os\//.test(filePath);
  const isServerSource = /^apps\/server\/src\//.test(filePath);

  if (filePath === "apps/server/package.json") {
    findings.push(...attemptMcpPackageFindings(source));
  }
  if (isAgentOsSource && /@modelcontextprotocol\/sdk(?:\/|["'])/.test(source)) {
    findings.push("MCP v1 source import");
  }
  if (isAgentOsSource && /@modelcontextprotocol\/core(?:\/|["'])/.test(source)) {
    findings.push("MCP core source import");
  }
  if (isServerSource && hasUdsOrStdioRelay(source)) {
    findings.push("API-owned UDS/stdio relay");
  }
  if (isAgentOsSource && hasCustomMcpRelay(filePath, source)) {
    findings.push("API-owned MCP relay");
  }
  if (
    /^(?:apps\/server\/(?:\.env\.example|Dockerfile)|deploy\/office\/compose\.office\.yml|docker-compose(?:\.[^/]+)?\.ya?ml)$/.test(
      filePath,
    ) &&
    /(?:KIDITEM_ATTEMPT_LOGIN_HOME|CODEX_HOME|CLAUDE_CONFIG_DIR|\b(?:codex|claude)\b[^\n]*(?:login|auth))/i.test(
      source,
    )
  ) {
    findings.push("API login-home/provider-login configuration");
  }
  if (
    filePath === "apps/server/Dockerfile" &&
    /\b(?:codex|claude)\s+--version\b/i.test(source)
  ) {
    findings.push("API image provider CLI assertion");
  }
  if (
    isServerSource &&
    !SERVER_CHILD_PROCESS_ALLOWLIST.has(filePath) &&
    (hasChildProcessBinding(filePath, source) ||
      hasProviderCliProcessApi(source) ||
      /\bprocess\.kill\s*\(/.test(source))
  ) {
    findings.push("API-owned CLI process supervision");
  }
  if (isAgentOsSource && hasProcInspection(filePath, source)) {
    findings.push("API runtime Linux peer-process inspection");
  }
  if (
    filePath.startsWith("apps/agent-runner/") &&
    /(?:\b(?:createServer|listen)\s*\(|\.listen\s*\()/i.test(source)
  ) {
    findings.push("Runner inbound listener or LAN exposure");
  }
  if (
    filePath === "packages/shared/src/agent-runtime/control.ts" &&
    hasRawLaunchField(filePath, source)
  ) {
    findings.push("Runner launch authority/secret field");
  }
  if (hasPersistedRunnerControlState(filePath, source)) {
    findings.push("Runner control-plane persistence");
  }
  if (hasPersistedProviderSessionHistoryResume(filePath, source)) {
    findings.push("provider session/history/resume persistence");
  }
  if (hasForbiddenAgentVersionState(filePath, source)) {
    findings.push("provider/model state on AgentVersion");
  }
  if (hasForbiddenCapabilityDefinitionState(filePath, source)) {
    findings.push("provider/model state on CapabilityDefinition");
  }
  if (hasDuplicateRuntimeContract(filePath, source)) {
    findings.push("duplicate runtime train/platform contract");
  }
  if (isServerSource && hasInternalAgentRuntimeRouteOutsidePrefix(source)) {
    findings.push("Agent runtime route outside internal prefix");
  }
  if (
    filePath === "deploy/office/nginx.conf" &&
    !hasNginxInternalAgentRuntimeDenyBoundary(source)
  ) {
    findings.push("nginx internal Agent runtime deny boundary");
  }
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
    path.join(root, "packages/shared/src/agent-runtime"),
    path.join(root, "prisma/models"),
    path.join(root, "deploy/office/nginx.conf"),
    path.join(root, "deploy/office/compose.office.yml"),
    path.join(root, "docker-compose.yml"),
  ];
}

function main() {
  const mode = process.argv.includes("--enforce") ? "enforce" : "report";
  if (!process.argv.includes("--report") && mode !== "enforce") {
    throw new Error("Use --report or --enforce");
  }
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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
