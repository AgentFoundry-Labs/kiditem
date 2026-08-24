#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export function productionFiles(directory) {
  if (!existsSync(directory)) return [];
  if (statSync(directory).isFile()) {
    return /(?:\.(?:ts|tsx|mjs|prisma|json|conf|ya?ml|md)|\.env\.example|\.example)$/.test(
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
      /(?:\.(?:ts|tsx|mjs|prisma|json|conf|ya?ml|md)|\.env\.example|\.example)$/.test(
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
const SUPERSEDED_AGENT_OS_RUNTIME_SURFACES = new Set([
  "apps/server/src/agent-os/adapter/in/mcp/attempt-mcp-proxy.ts",
  "apps/server/src/agent-os/adapter/in/mcp/attempt-mcp-socket-server.spec.ts",
  "apps/server/src/agent-os/adapter/in/mcp/attempt-mcp-socket-server.ts",
  "apps/server/src/agent-os/adapter/in/mcp/attempt-mcp-stdio-to-uds.spec.ts",
  "apps/server/src/agent-os/adapter/in/mcp/attempt-mcp-stdio-to-uds.ts",
  "apps/server/src/agent-os/adapter/in/mcp/attempt-mcp-broker.service.ts",
  "apps/server/src/agent-os/adapter/in/mcp/attempt-mcp-broker.spec.ts",
  "apps/server/src/agent-os/adapter/out/runtime/attempt/agent-attempt-executor.service.ts",
  "apps/server/src/agent-os/adapter/out/runtime/attempt/agent-attempt-process-registry.ts",
  "apps/server/src/agent-os/adapter/out/runtime/attempt/agent-attempt-runtime.spec.ts",
  "apps/server/src/agent-os/adapter/out/runtime/attempt/attempt-filesystem.service.ts",
  "apps/server/src/agent-os/adapter/out/runtime/attempt/attempt-filesystem.service.spec.ts",
  "apps/server/src/agent-os/adapter/out/runtime/attempt/attempt-live-control.registry.ts",
  "apps/server/src/agent-os/adapter/out/runtime/attempt/codex-attempt.adapter.ts",
  "apps/server/src/agent-os/adapter/out/runtime/attempt/claude-attempt.adapter.ts",
  "apps/server/src/agent-os/adapter/out/runtime/attempt/codex-app-server-session.ts",
  "apps/server/src/agent-os/adapter/out/runtime/attempt/codex-app-server-session.spec.ts",
  "apps/server/src/agent-os/adapter/out/runtime/attempt/codex-attempt-isolation-canary.ts",
  "apps/server/src/agent-os/adapter/out/runtime/attempt/codex-attempt-isolation-canary.spec.ts",
  "apps/server/src/agent-os/adapter/out/runtime/attempt/agent-result-output-schema.ts",
  "apps/server/src/agent-os/application/service/work/agent-runtime-directory-reconciler.service.ts",
]);
const SUPERSEDED_AGENT_MCP_APPLICATION_ROOT =
  "apps/server/src/agent-mcp-application.module.ts";
const CURRENT_HOST_RUNNER_DOCUMENTS = new Set([
  "AGENTS.md",
  "apps/server/src/agent-os/AGENTS.md",
  "docs/ARCHITECTURE.md",
  "docs/TESTING.md",
  "docs/runbooks/deployment-architecture.md",
  "docs/runbooks/environment-variables.md",
  "docs/runbooks/interaction-platform.md",
  "docs/runbooks/office-deploy.md",
  "docs/runbooks/agent-os-clean-cutover.md",
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
  "refreshtoken",
  "connectionstring",
  "connectionurl",
  "connectiondsn",
];
const EPHEMERAL_RUNNER_CONTROL_FIELD_PREFIX =
  /^(?:runner|lease|command|event|process|poll|ack(?:nowledg)?|control|attempttoken|(?:provider|codex|claude)(?:session|history|resume))/;

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
  return normalizedName(name).startsWith("runner");
}

function isEphemeralRunnerControlName(normalized) {
  return EPHEMERAL_RUNNER_CONTROL_FIELD_PREFIX.test(normalized);
}

function persistedAgentOsStateFindings(filePath, source) {
  if (!/^prisma\/models\/.+\.prisma$/.test(filePath)) {
    return { hasActiveSecretOrCredential: false, hasEphemeralRunnerControl: false };
  }

  let hasActiveSecretOrCredential = false;
  let hasEphemeralRunnerControl = false;
  for (const { name, body } of prismaModelBlocks(source)) {
    if (isDedicatedRunnerControlModel(name)) hasEphemeralRunnerControl = true;
    for (const field of prismaFieldNames(body)) {
      if (
        isAgentOsPersistenceModel(filePath, name) &&
        isActiveSecretOrCredentialName(field)
      ) {
        hasActiveSecretOrCredential = true;
      }
      if (
        isRunnerControlModel(name) &&
        isEphemeralRunnerControlName(normalizedName(field))
      ) {
        hasEphemeralRunnerControl = true;
      }
    }
  }
  return { hasActiveSecretOrCredential, hasEphemeralRunnerControl };
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

function isServerRunnerHttpIngressSurface(filePath) {
  return filePath.startsWith(
    "apps/server/src/agent-os/adapter/in/http/runtime/",
  );
}

function isRunnerControlClientIngressSurface(filePath) {
  return filePath === "apps/agent-runner/src/control/runner-control.client.ts";
}

function isRunnerIngressSurface(filePath) {
  return (
    isServerRunnerHttpIngressSurface(filePath) ||
    isRunnerControlClientIngressSurface(filePath)
  );
}

function isZodObjectDeclaration(node) {
  if (!ts.isVariableDeclaration(node) || !node.initializer) return false;
  let found = false;
  const visit = (child) => {
    if (
      ts.isCallExpression(child) &&
      ts.isPropertyAccessExpression(child.expression) &&
      ts.isIdentifier(child.expression.expression) &&
      child.expression.expression.text === "z" &&
      child.expression.name.text === "object"
    ) {
      found = true;
    }
    ts.forEachChild(child, visit);
  };
  visit(node.initializer);
  return found;
}

function isRunnerIngressDeclaration(node) {
  return (
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    isZodObjectDeclaration(node)
  );
}

function hasForbiddenIngressFieldInDeclaration(node) {
  let found = false;
  const visit = (child) => {
    if (ts.isPropertySignature(child) || ts.isPropertyDeclaration(child)) {
      const name = propertyName(child.name);
      if (name && isRawLaunchFieldName(name)) found = true;
    }
    if (ts.isPropertyAssignment(child)) {
      const name = propertyName(child.name);
      if (name && isRawLaunchFieldName(name)) found = true;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function hasDuplicateRunnerIngressContract(filePath, source) {
  if (!isRunnerIngressSurface(filePath)) return false;
  let found = false;
  const visit = (node) => {
    if (isRunnerIngressDeclaration(node) && hasForbiddenIngressFieldInDeclaration(node)) {
      found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile(filePath, source));
  return found;
}

function decoratorsFor(node) {
  return node.modifiers?.filter(ts.isDecorator) ?? [];
}

function decoratorName(decorator) {
  const expression = decorator.expression;
  if (!ts.isCallExpression(expression)) return null;
  if (ts.isIdentifier(expression.expression)) return expression.expression.text;
  if (ts.isPropertyAccessExpression(expression.expression)) return expression.expression.name.text;
  return null;
}

function staticDecoratorRoute(decorator) {
  const expression = decorator.expression;
  if (!ts.isCallExpression(expression)) return { dynamic: true, route: null };
  if (expression.arguments.length === 0) return { dynamic: false, route: "" };
  const [argument] = expression.arguments;
  if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) {
    return { dynamic: false, route: argument.text };
  }
  return { dynamic: true, route: null };
}

function hasInternalAgentRuntimeRouteHint(value) {
  return /(?:^|\/)internal\/agent-runtime(?:\/|$)/i.test(value);
}

function isRunnerControlControllerName(value) {
  return /(?:runner|agentruntime)controller$/i.test(value);
}

function isCanonicalRunnerBasePath(value) {
  return /^\/?internal\/agent-runtime(?:\/|$)/.test(value);
}

function effectiveNestRoute(base, method) {
  const normalizedBase = base.replace(/^\/+|\/+$/g, "");
  const normalizedMethod = method.replace(/^\/+|\/+$/g, "");
  return `/${[normalizedBase, normalizedMethod].filter(Boolean).join("/")}`;
}

function hasInternalAgentRuntimeRouteOutsidePrefix(source) {
  let found = false;
  const visit = (node) => {
    if (!ts.isClassDeclaration(node)) {
      ts.forEachChild(node, visit);
      return;
    }

    const controller = decoratorsFor(node).find(
      (decorator) => decoratorName(decorator) === "Controller",
    );
    if (!controller) {
      ts.forEachChild(node, visit);
      return;
    }
    const methods = node.members.flatMap((member) =>
      decoratorsFor(member)
        .filter((decorator) => /^(?:All|Delete|Get|Patch|Post|Put)$/.test(decoratorName(decorator) ?? ""))
        .map(staticDecoratorRoute),
    );
    const controllerRoute = controller ? staticDecoratorRoute(controller) : null;
    const className = node.name?.text ?? "";
    const hasStaticRunnerRoute = [controllerRoute, ...methods].some(
      (route) =>
        route &&
        !route.dynamic &&
        hasInternalAgentRuntimeRouteHint(route.route),
    );
    const isRunnerRouteContext =
      isRunnerControlControllerName(className) || hasStaticRunnerRoute;

    if (isRunnerRouteContext) {
      if (
        !controllerRoute ||
        controllerRoute.dynamic ||
        methods.some((route) => route.dynamic) ||
        !isCanonicalRunnerBasePath(controllerRoute.route)
      ) {
        found = true;
      } else {
        found ||= methods.some(
          (method) => !/^\/internal\/agent-runtime(?:\/|$)/.test(
            effectiveNestRoute(controllerRoute.route, method.route),
          ),
        );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile("runner-route.ts", source));
  return found;
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
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]) &&
      /^(?:node:)?child_process$/.test(node.arguments[0].text) &&
      ((ts.isIdentifier(node.expression) && node.expression.text === "require") ||
        node.expression.kind === ts.SyntaxKind.ImportKeyword)
    ) {
      found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return found;
}

const CHILD_PROCESS_PROVIDER_METHODS = new Set([
  "spawn",
  "exec",
  "execFile",
  "execSync",
  "fork",
]);

function isChildProcessModuleSpecifier(node) {
  return (
    ts.isStringLiteral(node) &&
    /^(?:node:)?child_process$/.test(node.text)
  );
}

function isChildProcessLoaderCall(node) {
  return (
    ts.isCallExpression(node) &&
    node.arguments.length === 1 &&
    isChildProcessModuleSpecifier(node.arguments[0]) &&
    ((ts.isIdentifier(node.expression) && node.expression.text === "require") ||
      node.expression.kind === ts.SyntaxKind.ImportKeyword)
  );
}

function unwrapAwaitExpression(node) {
  return ts.isAwaitExpression(node) ? node.expression : node;
}

function collectChildProcessBindings(parsed) {
  const functions = new Set();
  const namespaces = new Set();
  const bindVariable = (name, initializer) => {
    if (!isChildProcessLoaderCall(unwrapAwaitExpression(initializer))) return;
    if (ts.isIdentifier(name)) {
      namespaces.add(name.text);
      return;
    }
    if (!ts.isObjectBindingPattern(name)) return;
    for (const element of name.elements) {
      if (!ts.isIdentifier(element.name)) continue;
      const importedName = propertyName(element.propertyName ?? element.name);
      if (importedName && CHILD_PROCESS_PROVIDER_METHODS.has(importedName)) {
        functions.add(element.name.text);
      }
    }
  };
  const visit = (node) => {
    if (
      ts.isImportDeclaration(node) &&
      isChildProcessModuleSpecifier(node.moduleSpecifier) &&
      node.importClause &&
      !node.importClause.isTypeOnly
    ) {
      const clause = node.importClause;
      if (clause.name) namespaces.add(clause.name.text);
      if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        namespaces.add(clause.namedBindings.name.text);
      }
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          if (element.isTypeOnly) continue;
          const importedName = propertyName(element.propertyName ?? element.name);
          if (importedName && CHILD_PROCESS_PROVIDER_METHODS.has(importedName)) {
            functions.add(element.name.text);
          }
        }
      }
    }
    if (ts.isVariableDeclaration(node) && node.initializer) {
      bindVariable(node.name, node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return { functions, namespaces };
}

function isProviderCliLiteral(node) {
  return (
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
    /^(?:codex|claude)(?:\.exe)?$/i.test(node.text)
  );
}

function isChildProcessProviderCall(node, bindings) {
  const expression = node.expression;
  if (ts.isIdentifier(expression)) return bindings.functions.has(expression.text);
  if (!ts.isPropertyAccessExpression(expression)) return false;
  if (!CHILD_PROCESS_PROVIDER_METHODS.has(expression.name.text)) return false;
  return (
    (ts.isIdentifier(expression.expression) &&
      bindings.namespaces.has(expression.expression.text)) ||
    isChildProcessLoaderCall(expression.expression)
  );
}

function isBunProviderSpawn(node) {
  if (
    !ts.isPropertyAccessExpression(node.expression) ||
    !ts.isIdentifier(node.expression.expression) ||
    node.expression.expression.text !== "Bun" ||
    node.expression.name.text !== "spawn"
  ) {
    return false;
  }
  const [command] = node.arguments;
  return (
    ts.isArrayLiteralExpression(command) &&
    command.elements.length > 0 &&
    isProviderCliLiteral(command.elements[0])
  );
}

function isProcessKillCall(node) {
  return (
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "process" &&
    node.expression.name.text === "kill"
  );
}

function hasProviderCliProcessOrKill(source) {
  const parsed = sourceFile("provider-process.ts", source);
  const bindings = collectChildProcessBindings(parsed);
  let found = false;
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      found ||=
        isProcessKillCall(node) ||
        (isChildProcessProviderCall(node, bindings) &&
          node.arguments.length > 0 &&
          isProviderCliLiteral(node.arguments[0])) ||
        isBunProviderSpawn(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return found;
}

function hasNginxInternalAgentRuntimeDenyBoundary(source) {
  const location = /location\s+\^~\s+\/internal\/\s*\{/g;
  let match;
  while ((match = location.exec(source))) {
    const openBrace = source.indexOf("{", match.index);
    let depth = 0;
    for (let index = openBrace; index < source.length; index += 1) {
      if (source[index] === "{") depth += 1;
      if (source[index] === "}") depth -= 1;
      if (depth === 0) {
        if (/\breturn\s+404\s*;/.test(source.slice(openBrace, index + 1))) return true;
        break;
      }
    }
  }
  return false;
}

function hasSupersededComposeCliHome(source) {
  return /\b(?:KIDITEM_ATTEMPT_LOGIN_HOME|kiditem-cli-home)\b/i.test(source);
}

function hasApiImageProviderCliInstallation(source) {
  return /(?:@openai\/codex|@anthropic-ai\/claude-code)/i.test(source);
}

function hasStaleCurrentHostRunnerDocumentation(filePath, source) {
  if (!CURRENT_HOST_RUNNER_DOCUMENTS.has(filePath)) return false;
  if (/\b(?:KIDITEM_ATTEMPT_LOGIN_HOME|kiditem-cli-home)\b/i.test(source)) {
    return true;
  }
  if (/\b4401\b/.test(source)) return true;
  if (/\bprivate MCP socket\b/i.test(source)) return true;
  const normalized = source.replace(/\s+/g, " ");
  return [
    /\b(?:API|Nest(?:JS)?)\s+(?:process|service|container|root)\s+that\s+(?:may\s+)?(?:spawn|start|run|execute|supervise)\s+(?:a\s+)?(?:Codex|Claude|CLI)\b/i,
    /\b(?:API|Nest(?:JS)?)(?:\s+(?:process|service|container|root))?\s+owns?\s+(?:an?\s+|the\s+)?(?:Codex|Claude|CLI)\b/i,
    /\b(?:API|Nest(?:JS)?)[^.]{0,100}\bonly process root permitted to start\s+(?:a\s+)?(?:Codex|Claude|CLI)\b/i,
    /\b(?:API|Nest(?:JS)?)\s+(?:process|service|container|root)[^.]{0,100}\b(?:owns?|runs?|executes?|supervises?)\b[^.]{0,80}\b(?:live\s+)?CLI(?:\/MCP)?\s+process/i,
  ].some((pattern) => pattern.test(normalized));
}

function hasSupersededDirectMcpStatement(filePath, source) {
  return (
    /^apps\/server\/src\/agent-os\//.test(filePath) &&
    /\b(?:private\s+MCP\s+socket|(?:incoming|MCP)\s+socket\s+adapter|socket\s+adapter)\b/i.test(
      source,
    )
  );
}

function supersededRuntimeSurfaceFinding(filePath) {
  if (filePath === SUPERSEDED_AGENT_MCP_APPLICATION_ROOT) {
    return "superseded Agent MCP application root";
  }
  return SUPERSEDED_AGENT_OS_RUNTIME_SURFACES.has(filePath)
    ? "superseded Agent OS runtime surface"
    : null;
}

export function collectSupersededRuntimeInventoryFindings(root) {
  return supersededRuntimeInventoryPaths()
    .filter((relativePath) => existsSync(path.join(root, relativePath)))
    .map((relativePath) => `${relativePath}: ${supersededRuntimeSurfaceFinding(relativePath)}`)
    .sort();
}

export function supersededRuntimeInventoryPaths() {
  return [
    ...SUPERSEDED_AGENT_OS_RUNTIME_SURFACES,
    SUPERSEDED_AGENT_MCP_APPLICATION_ROOT,
  ].sort();
}

function findingsFor({ path: filePath, source }) {
  const findings = [];
  const isAgentOsSource = /^apps\/server\/src\/agent-os\//.test(filePath);
  const isServerSource = /^apps\/server\/src\//.test(filePath);
  const supersededRuntimeSurface = supersededRuntimeSurfaceFinding(filePath);

  if (supersededRuntimeSurface) findings.push(supersededRuntimeSurface);

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
  if (isServerSource && hasCustomMcpRelay(filePath, source)) {
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
    isServerSource &&
    /\b(?:KIDITEM_ATTEMPT_LOGIN_HOME|KIDITEM_ATTEMPT_CLI_VERSION)\b/.test(source)
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
    filePath === "apps/server/Dockerfile" &&
    hasApiImageProviderCliInstallation(source)
  ) {
    findings.push("API image provider CLI installation");
  }
  if (
    filePath === "deploy/office/compose.office.yml" &&
    hasSupersededComposeCliHome(source)
  ) {
    findings.push("superseded Compose CLI-home volume");
  }
  if (isServerSource) {
    const hasProviderCliProcess = hasProviderCliProcessOrKill(source);
    if (
      hasProviderCliProcess ||
      (!SERVER_CHILD_PROCESS_ALLOWLIST.has(filePath) &&
        hasChildProcessBinding(filePath, source))
    ) {
      findings.push("API-owned CLI process supervision");
    }
  }
  if (isServerSource && hasProcInspection(filePath, source)) {
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
  const persistedState = persistedAgentOsStateFindings(filePath, source);
  if (persistedState.hasActiveSecretOrCredential) {
    findings.push("active secret/credential persistence");
  }
  if (persistedState.hasEphemeralRunnerControl) {
    findings.push("ephemeral Runner control-state persistence");
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
  if (hasDuplicateRunnerIngressContract(filePath, source)) {
    findings.push("duplicate Runner control ingress contract");
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
  if (hasStaleCurrentHostRunnerDocumentation(filePath, source)) {
    findings.push("stale current Host Runner documentation");
  }
  if (hasSupersededDirectMcpStatement(filePath, source)) {
    findings.push("superseded direct-MCP statement");
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
    path.join(root, "AGENTS.md"),
    path.join(root, "apps/server/src/agent-os/AGENTS.md"),
    path.join(root, "docs/ARCHITECTURE.md"),
    path.join(root, "docs/TESTING.md"),
    path.join(root, "docs/runbooks/deployment-architecture.md"),
    path.join(root, "docs/runbooks/environment-variables.md"),
    path.join(root, "docs/runbooks/interaction-platform.md"),
    path.join(root, "docs/runbooks/office-deploy.md"),
    path.join(root, "docs/runbooks/agent-os-clean-cutover.md"),
  ];
}

function main() {
  const mode = process.argv.includes("--enforce") ? "enforce" : "report";
  if (!process.argv.includes("--report") && mode !== "enforce") {
    throw new Error("Use --report or --enforce");
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const findings = [...new Set([
    ...collectAgentOsContractionFindings(
      contractionRoots(root)
        .flatMap(productionFiles)
        .map((file) => ({
          path: path.relative(root, file),
          source: readFileSync(file, "utf8"),
        })),
    ),
    ...collectSupersededRuntimeInventoryFindings(root),
  ])].sort();
  console.log(
    `check:agent-os-contraction ${mode.toUpperCase()} (${findings.length} findings)`,
  );
  for (const finding of findings) console.log(`- ${finding}`);
  if (mode === "enforce" && findings.length > 0) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
