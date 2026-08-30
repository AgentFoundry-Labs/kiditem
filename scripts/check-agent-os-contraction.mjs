#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const IGNORED_DIRECTORIES = new Set([
  "__tests__",
  "coverage",
  "dist",
  "node_modules",
  ".next",
]);
const PRODUCTION_FILE_NAME =
  /^(?:Dockerfile(?:\..+)?|.+\.(?:cjs|conf|cs|csproj|json|mjs|prisma|ps1|ts|tsx|ya?ml))$/;
const TEST_FILE_NAME = /\.(?:spec|test)\.(?:cjs|mjs|ts|tsx)$/;
const RETIRED_APPLICATIONS = [
  "apps/agent-runner",
  "apps/interaction-gateway",
];
const RETIRED_MODELS = new Set([
  "AgentVersion",
  "AgentSession",
  "AgentTask",
  "AgentAttempt",
  "AgentCapabilityInvocation",
  "AgentCapabilityApproval",
  "CapabilityApproval",
]);
const AGENT_WORK_PRISMA = "prisma/models/agent-work.prisma";
const AGENT_REGISTRY =
  "apps/server/src/agent-os/domain/agent-definition.registry.ts";
const DOMAIN_REGISTRY =
  "apps/server/src/agent-os/domain/catalog/domain-definition.registry.ts";
const MCP_WIRE =
  "apps/server/src/agent-os/adapter/in/mcp/capability-mcp-wire-contract.ts";
const CAPABILITY_SOURCE =
  /^apps\/server\/src\/[^/]+\/domain\/capability\/[^/]+\.capabilities\.ts$/;
const PROVIDER_CLI_PACKAGES = new Set([
  "@anthropic-ai/claude-code",
  "@openai/codex",
]);
const PROVIDER_CLI_METHODS = new Set([
  "exec",
  "execFile",
  "execSync",
  "fork",
  "spawn",
]);

export function productionFiles(directory) {
  if (!existsSync(directory)) return [];
  if (statSync(directory).isFile()) {
    const name = path.basename(directory);
    return PRODUCTION_FILE_NAME.test(name) && !TEST_FILE_NAME.test(name)
      ? [directory]
      : [];
  }
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return IGNORED_DIRECTORIES.has(entry.name) ? [] : productionFiles(absolutePath);
    }
    return entry.isFile() &&
      PRODUCTION_FILE_NAME.test(entry.name) &&
      !TEST_FILE_NAME.test(entry.name)
      ? [absolutePath]
      : [];
  });
}

function parseSource(filePath, source) {
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
}

function normalizedName(value) {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
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

function unwrap(node) {
  let current = node;
  while (
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function variableArray(filePath, source, name) {
  const parsed = parseSource(filePath, source);
  let result = null;
  const visit = (node) => {
    if (
      !result &&
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer
    ) {
      const initializer = unwrap(node.initializer);
      if (ts.isArrayLiteralExpression(initializer)) result = initializer;
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return result;
}

function stringValues(array) {
  if (!array) return [];
  return array.elements.flatMap((element) => {
    const value = unwrap(element);
    return ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)
      ? [value.text]
      : [];
  });
}

function modelBlocks(source) {
  return [...source.matchAll(/\bmodel\s+([A-Za-z]\w*)\s*\{([\s\S]*?)\}/g)].map(
    ([, name, body]) => ({ name, body }),
  );
}

function fieldNames(body) {
  return [...body.matchAll(/^\s*([A-Za-z]\w*)\s+\S+/gm)].map(
    ([, name]) => name,
  );
}

function secretField(name) {
  const normalized = normalizedName(name);
  return (
    normalized === "bearer" ||
    normalized.includes("secret") ||
    normalized.includes("credential") ||
    normalized.includes("password") ||
    normalized.includes("passphrase") ||
    normalized.includes("privatekey") ||
    normalized.includes("accesstoken") ||
    normalized.includes("bearertoken") ||
    normalized.includes("refreshtoken") ||
    normalized.includes("apikey")
  );
}

function ephemeralGatewayField(name) {
  const normalized = normalizedName(name);
  return (
    normalized.includes("provider") ||
    normalized.includes("runtime") ||
    normalized === "model" ||
    normalized.includes("modelname") ||
    normalized.includes("reportedmodel") ||
    normalized.includes("effort") ||
    normalized.includes("history") ||
    normalized.includes("conversation") ||
    normalized.includes("transcript") ||
    normalized.includes("executionbinding") ||
    normalized.includes("executiontoken") ||
    normalized.includes("gatewaycommand") ||
    normalized.includes("controlcommand") ||
    normalized.includes("commandid") ||
    normalized.includes("controlstate") ||
    normalized.includes("activeturn")
  );
}

function ephemeralGatewayModel(name) {
  const normalized = normalizedName(name);
  return (
    normalized.includes("gateway") ||
    normalized.includes("conversation") ||
    normalized.includes("transcript") ||
    normalized.includes("executionbinding") ||
    normalized.includes("activeturn") ||
    normalized.includes("providersession")
  );
}

function prismaFindings(files) {
  const prismaFiles = files.filter(
    (file) =>
      file.path.startsWith("prisma/models/") && file.path.endsWith(".prisma"),
  );
  const models = prismaFiles.flatMap((file) =>
    modelBlocks(file.source).map((model) => ({ ...model, file })),
  );
  const hasAgentOsSchema = models.some(
    (model) =>
      model.file.path === AGENT_WORK_PRISMA ||
      model.name === "CapabilityInvocation" ||
      RETIRED_MODELS.has(model.name),
  );
  if (!hasAgentOsSchema) return [];

  const findings = [];
  const invocations = models.filter(
    (model) => model.name === "CapabilityInvocation",
  );
  const agentWork = models.filter(
    (model) => model.file.path === AGENT_WORK_PRISMA,
  );
  if (
    invocations.length !== 1 ||
    agentWork.length !== 1 ||
    agentWork[0]?.name !== "CapabilityInvocation"
  ) {
    findings.push(
      "prisma/models: Agent OS Prisma graph must contain exactly one CapabilityInvocation model (found " +
        invocations.length +
        ")",
    );
  }

  for (const model of models) {
    if (RETIRED_MODELS.has(model.name)) {
      findings.push(
        model.file.path +
          ": retired Agent OS persistence model " +
          model.name,
      );
    }
    const agentOsModel =
      model.file.path === AGENT_WORK_PRISMA ||
      model.name === "CapabilityInvocation" ||
      RETIRED_MODELS.has(model.name);
    if (!agentOsModel) {
      if (ephemeralGatewayModel(model.name)) {
        findings.push(model.file.path + ": ephemeral Host Gateway control state");
      }
      continue;
    }
    const fields = fieldNames(model.body);
    if (fields.some(secretField)) {
      findings.push(model.file.path + ": active credentials or secrets");
    }
    if (fields.some(ephemeralGatewayField)) {
      findings.push(
        model.file.path + ": ephemeral Host Gateway control state",
      );
    }
  }
  return findings;
}

function agentCatalogFindings(file) {
  const definitions = variableArray(file.path, file.source, "AGENT_DEFINITIONS");
  const count = definitions
    ? definitions.elements.filter((element) =>
        ts.isObjectLiteralExpression(unwrap(element)),
      ).length
    : 0;
  return count === 5
    ? []
    : [
        file.path +
          ": Agent registry must define exactly five Agents (found " +
          count +
          ")",
      ];
}

function domainCatalogFindings(file) {
  const count = stringValues(
    variableArray(file.path, file.source, "DOMAIN_KEYS"),
  ).length;
  return count === 14
    ? []
    : [
        file.path +
          ": Domain registry must define exactly fourteen domains (found " +
          count +
          ")",
      ];
}

function capabilityDefinitions(file) {
  const parsed = parseSource(file.path, file.source);
  const definitions = [];
  const visit = (node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const keyProperty = node.properties.find(
        (property) => ts.isPropertyAssignment(property) && propertyName(property.name) === "key",
      );
      const value = keyProperty && ts.isPropertyAssignment(keyProperty)
        ? unwrap(keyProperty.initializer)
        : null;
      if (
        value &&
        (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) &&
        /^[a-z_]+\.[a-z0-9_]+$/i.test(value.text)
      ) {
        const summaryProperty = node.properties.find(
          (property) => ts.isPropertyAssignment(property) && propertyName(property.name) === "resultSummary",
        );
        const summaryValue = summaryProperty && ts.isPropertyAssignment(summaryProperty)
          ? unwrap(summaryProperty.initializer)
          : null;
        definitions.push({
          key: value.text,
          resultSummary: summaryValue && (
            ts.isStringLiteral(summaryValue) || ts.isNoSubstitutionTemplateLiteral(summaryValue)
          )
            ? summaryValue.text
            : null,
          hasResultSummary: Boolean(summaryProperty),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return definitions;
}

function capabilityKeys(file) {
  return capabilityDefinitions(file).map((definition) => definition.key);
}

function capabilityCatalogFindings(files) {
  const capabilityFiles = files.filter((file) => CAPABILITY_SOURCE.test(file.path));
  if (capabilityFiles.length === 0) return [];
  const keys = capabilityFiles.flatMap(capabilityKeys);
  const sourcingCount = keys.filter((key) => key.startsWith("sourcing.")).length;
  const findings = [];
  if (keys.length !== 17) {
    findings.push(
      "apps/server/src: Capability catalog must define exactly seventeen definitions (found " +
        keys.length +
        ")",
    );
  }
  if (sourcingCount !== 10) {
    findings.push(
      "apps/server/src: Sourcing capability catalog must define exactly ten definitions (found " +
        sourcingCount +
        ")",
    );
  }
  for (const file of capabilityFiles) {
    for (const definition of capabilityDefinitions(file)) {
      if (!definition.hasResultSummary) {
        findings.push(`${file.path}: ${definition.key}: missing resultSummary`);
        continue;
      }
      if (
        !definition.resultSummary
        || !definition.resultSummary.trim()
        || definition.resultSummary.trim().length > 1_000
        || !/[가-힣]/.test(definition.resultSummary)
      ) {
        findings.push(`${file.path}: ${definition.key}: resultSummary must be bounded Korean copy`);
      }
    }
  }
  return findings;
}

function mcpCatalogFindings(file) {
  const toolCount = stringValues(
    variableArray(file.path, file.source, "CAPABILITY_MCP_TOOL_NAMES"),
  ).length;
  const protocol = file.source.match(
    /\bMCP_PROTOCOL_VERSION\s*=\s*["']([^"']+)["']/,
  )?.[1];
  const findings = [];
  if (toolCount !== 5) {
    findings.push(
      file.path +
        ": MCP surface must define exactly five MCP tools (found " +
        toolCount +
        ")",
    );
  }
  if (protocol !== "2026-07-28") {
    findings.push(
      file.path +
        ": MCP protocol must be 2026-07-28 (found " +
        (protocol ?? "missing") +
        ")",
    );
  }
  return findings;
}

function agentOsSource(filePath) {
  return filePath.startsWith("apps/server/src/agent-os/");
}

function retiredLifecycleName(filePath, source) {
  return (
    (agentOsSource(filePath) || filePath.startsWith("packages/shared/src/")) &&
    /\b(?:AgentVersion|AgentSession|AgentTask|AgentAttempt|AgentCapabilityInvocation|AgentCapabilityApproval)\w*\b/.test(
      source,
    )
  );
}

function sourceHas(pattern, filePath, source) {
  return pattern.test(filePath + "\n" + source);
}

/**
 * The clean cutover excludes worker-style mutation dispatch. The bounded
 * API-owned CapabilityInvocation dispatcher is an explicit exception: it has
 * no queue claim, lease, retry loop, or provider-turn authority.
 */
function retiredMutationDispatcher(filePath, source) {
  const approvedDispatcherPath =
    "apps/server/src/agent-os/application/service/capability-mutation-dispatcher.service.ts";
  const approvedConsumerPaths = new Set([
    approvedDispatcherPath,
    "apps/server/src/agent-os/application/service/capability-invocation.service.ts",
    "apps/server/src/agent-os/application/service/capability-approval.service.ts",
    "apps/server/src/agent-os/agent-os-invocation.module.ts",
  ]);
  const withoutExactApprovedReferences = approvedConsumerPaths.has(filePath)
    ? source
      .replaceAll(/\bCapabilityMutationDispatcher(?:Port)?\b/g, "")
      .replaceAll(
        /(['"])(?:[^'"]*\/)?capability-mutation-dispatcher\.service\1/g,
        "",
      )
    : source;
  const checkedPath = filePath === approvedDispatcherPath ? "" : filePath;
  return /(?:mutation[-_ ]?dispatcher|MutationDispatcher|dispatchMutation)/i.test(
    checkedPath + "\n" + withoutExactApprovedReferences,
  );
}

function hasProviderCliPackage(source) {
  try {
    const manifest = JSON.parse(source);
    return [
      manifest.dependencies,
      manifest.devDependencies,
      manifest.optionalDependencies,
      manifest.peerDependencies,
    ].some((dependencies) =>
      Object.keys(dependencies ?? {}).some((name) =>
        PROVIDER_CLI_PACKAGES.has(name),
      ),
    );
  } catch {
    return false;
  }
}

function providerCliLiteral(node) {
  return (
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
    /^(?:codex|claude)(?:\.exe)?$/i.test(node.text)
  );
}

function childProcessBindings(parsed) {
  const functions = new Set();
  const namespaces = new Set();
  const visit = (node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      /^(?:node:)?child_process$/.test(node.moduleSpecifier.text) &&
      node.importClause &&
      !node.importClause.isTypeOnly
    ) {
      const bindings = node.importClause.namedBindings;
      if (node.importClause.name) namespaces.add(node.importClause.name.text);
      if (bindings && ts.isNamespaceImport(bindings)) {
        namespaces.add(bindings.name.text);
      }
      if (bindings && ts.isNamedImports(bindings)) {
        for (const item of bindings.elements) {
          if (item.isTypeOnly) continue;
          const imported = propertyName(item.propertyName ?? item.name);
          if (imported && PROVIDER_CLI_METHODS.has(imported)) {
            functions.add(item.name.text);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return { functions, namespaces };
}

function hasProviderCliSpawn(filePath, source) {
  const parsed = parseSource(filePath, source);
  const bindings = childProcessBindings(parsed);
  let found = false;
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const expression = node.expression;
      const imported =
        ts.isIdentifier(expression) && bindings.functions.has(expression.text);
      const namespace =
        ts.isPropertyAccessExpression(expression) &&
        PROVIDER_CLI_METHODS.has(expression.name.text) &&
        ts.isIdentifier(expression.expression) &&
        bindings.namespaces.has(expression.expression.text);
      if ((imported || namespace) && providerCliLiteral(node.arguments[0])) {
        found = true;
      }
      if (
        ts.isPropertyAccessExpression(expression) &&
        ts.isIdentifier(expression.expression) &&
        expression.expression.text === "Bun" &&
        expression.name.text === "spawn" &&
        ts.isArrayLiteralExpression(node.arguments[0]) &&
        providerCliLiteral(node.arguments[0].elements[0])
      ) {
        found = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return found;
}

function imageSurface(filePath) {
  return (
    filePath === "apps/server/Dockerfile" ||
    /^deploy\/docker\/[^/]*Dockerfile$/i.test(filePath)
  );
}

function publicInternalRuntimeRoute(filePath, source) {
  return (
    filePath.startsWith("apps/server/src/") &&
    /(?:["']\/?(?:api|public)\/internal\/agent-runtime|["']\/?internal\/agent-runtime(?:-public|\/public))/.test(
      source,
    )
  );
}

function nginxDeniesInternalRoutes(source) {
  const locations = /location\s+\^~\s+\/internal\/\s*\{/g;
  let match;
  while ((match = locations.exec(source))) {
    const start = source.indexOf("{", match.index);
    let depth = 0;
    for (let index = start; index < source.length; index += 1) {
      if (source[index] === "{") depth += 1;
      if (source[index] === "}") depth -= 1;
      if (depth === 0) {
        if (/\breturn\s+404\s*;/.test(source.slice(start, index + 1))) {
          return true;
        }
        break;
      }
    }
  }
  return false;
}

function findingsFor(file) {
  const { path: filePath, source } = file;
  const findings = [];
  if (
    RETIRED_APPLICATIONS.some(
      (retired) => filePath === retired || filePath.startsWith(retired + "/"),
    )
  ) {
    findings.push("retired Agent runtime application");
  }
  if (retiredLifecycleName(filePath, source)) {
    findings.push("retired Agent OS lifecycle name");
  }
  if (
    agentOsSource(filePath) &&
    sourceHas(
      /(?:publish[-_]?agent[-_]?(?:version|definition)|agent[-_]?(?:version|definition)[-_]?publication)/i,
      filePath,
      source,
    )
  ) {
    findings.push("retired Agent OS publication surface");
  }
  if (
    /^apps\/server\/src\/agent-os\/adapter\/in\/http\//.test(filePath) &&
    /(?:task|attempt)/i.test(filePath + "\n" + source)
  ) {
    findings.push("retired Task/Attempt route");
  }
  if (
    /(?:^|\/)seed[-_]?agent(?:[-_]?os)?\.(?:[cm]?js|ts)$/i.test(filePath) ||
    /\bseedAgent(?:Os|Version|Definition)\b/.test(source)
  ) {
    findings.push("retired Agent OS seed surface");
  }
  if (
    agentOsSource(filePath) &&
    sourceHas(
      /(?:Capability|Execution|Agent)[-_]?Grant|grant(?:Capability|Execution|Agent)/,
      filePath,
      source,
    )
  ) {
    findings.push("retired capability grant surface");
  }
  if (
    agentOsSource(filePath) &&
    /\b(?:Continue(?:Attempt|Task|Invocation)?|needs_continue|continue_attempt|continue[A-Z]\w*)\b/.test(
      source,
    )
  ) {
    findings.push("retired Continue surface");
  }
  if (
    agentOsSource(filePath) &&
    retiredMutationDispatcher(filePath, source)
  ) {
    findings.push("retired mutation dispatcher");
  }
  if (
    agentOsSource(filePath) &&
    sourceHas(
      /(?:approval[-_ ]?sweeper|ApprovalSweeper|sweep(?:Pending)?Approvals)/i,
      filePath,
      source,
    )
  ) {
    findings.push("retired approval sweeper");
  }
  if (
    agentOsSource(filePath) &&
    sourceHas(
      /(?:pending[-_ ]?invocation[-_ ]?(?:recovery|recover)|recover(?:Pending)?Invocation|resume(?:Pending)?Invocation)/i,
      filePath,
      source,
    )
  ) {
    findings.push("pending Invocation recovery");
  }
  if (filePath !== "scripts/check-agent-os-contraction.mjs" && /\b4401\b/.test(source)) {
    findings.push("retired runtime port 4401");
  }
  if (filePath === "apps/server/package.json" && hasProviderCliPackage(source)) {
    findings.push("API/worker provider CLI package");
  }
  if (
    filePath.startsWith("apps/server/src/") &&
    hasProviderCliSpawn(filePath, source)
  ) {
    findings.push("API/worker provider CLI spawn");
  }
  if (
    imageSurface(filePath) &&
    /(?:@openai\/codex|@anthropic-ai\/claude-code|\b(?:codex|claude)(?:\.exe)?\s+(?:--version|login|exec))/i.test(
      source,
    )
  ) {
    findings.push("API/worker image contains a provider CLI");
  }
  if (publicInternalRuntimeRoute(filePath, source)) {
    findings.push("public internal runtime route");
  }
  if (
    filePath === "deploy/office/nginx.conf" &&
    !nginxDeniesInternalRoutes(source)
  ) {
    findings.push("public internal runtime route");
  }
  return findings.map((finding) => filePath + ": " + finding);
}

export function collectAgentOsContractionFindings(files) {
  const findings = files.flatMap(findingsFor);
  findings.push(...prismaFindings(files));

  const agents = files.find((file) => file.path === AGENT_REGISTRY);
  if (agents) findings.push(...agentCatalogFindings(agents));

  const domains = files.find((file) => file.path === DOMAIN_REGISTRY);
  if (domains) findings.push(...domainCatalogFindings(domains));

  findings.push(...capabilityCatalogFindings(files));

  const mcp = files.find((file) => file.path === MCP_WIRE);
  if (mcp) findings.push(...mcpCatalogFindings(mcp));

  return [...new Set(findings)].sort();
}

export function contractionRoots(root) {
  return [
    path.join(root, "apps"),
    path.join(root, "apps/server/package.json"),
    path.join(root, "apps/server/Dockerfile"),
    path.join(root, "packages/shared/src"),
    path.join(root, "prisma/models"),
    path.join(root, "scripts"),
    path.join(root, "deploy"),
    path.join(root, ".github/workflows"),
    path.join(root, "package.json"),
  ];
}

export function collectContractionInventoryFindings(root) {
  return RETIRED_APPLICATIONS.filter((relativePath) =>
    existsSync(path.join(root, relativePath)),
  ).map((relativePath) => relativePath + ": retired Agent runtime application");
}

function main() {
  const mode = process.argv.includes("--enforce") ? "enforce" : "report";
  if (!process.argv.includes("--report") && mode !== "enforce") {
    throw new Error("Use --report or --enforce");
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const absoluteFiles = [...new Set(contractionRoots(root).flatMap(productionFiles))];
  const files = absoluteFiles.map((absolutePath) => ({
    path: path.relative(root, absolutePath),
    source: readFileSync(absolutePath, "utf8"),
  }));
  const findings = [
    ...new Set([
      ...collectAgentOsContractionFindings(files),
      ...collectContractionInventoryFindings(root),
    ]),
  ].sort();

  console.log(
    "check:agent-os-contraction " +
      mode.toUpperCase() +
      " (" +
      findings.length +
      " findings)",
  );
  for (const finding of findings) console.log("- " + finding);
  if (mode === "enforce" && findings.length > 0) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
