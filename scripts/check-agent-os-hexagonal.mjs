#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const AGENT_OS_ROOT = "/apps/server/src/agent-os/";
const SOURCING_ROOT = "/apps/server/src/sourcing/";
const CHANNELS_AGENT_ADAPTER_ROOT =
  "/apps/server/src/channels/adapter/in/agent/";
const OWNER_DOMAINS = new Set([
  "advertising",
  "ai",
  "analytics",
  "channels",
  "finance",
  "inventory",
  "orders",
  "products",
  "sourcing",
  "supply",
]);

function normalizePath(filePath) {
  return "/" + filePath.replaceAll("\\", "/").replace(/^\/+/, "");
}

function parseSource(filePath, source) {
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
}

function runtimeImport(statement) {
  if (!ts.isImportDeclaration(statement) || !statement.importClause) {
    return true;
  }
  const clause = statement.importClause;
  if (clause.isTypeOnly) return false;
  if (clause.name) return true;
  const bindings = clause.namedBindings;
  if (!bindings || ts.isNamespaceImport(bindings)) return true;
  return bindings.elements.some((element) => !element.isTypeOnly);
}

function moduleSpecifier(statement) {
  return (
    ts.isImportDeclaration(statement) &&
    ts.isStringLiteral(statement.moduleSpecifier)
      ? statement.moduleSpecifier.text
      : null
  );
}

function resolveSpecifier(fromPath, specifier) {
  if (specifier.startsWith(".")) {
    return path.posix.normalize(
      path.posix.resolve(path.posix.dirname(fromPath), specifier),
    );
  }
  if (specifier.startsWith("@/")) {
    return "/apps/server/src/" + specifier.slice(2);
  }
  return specifier;
}

function importsOf(file) {
  const normalizedPath = normalizePath(file.path);
  const parsed = parseSource(file.path, file.source);
  return parsed.statements.flatMap((statement) => {
    const specifier = moduleSpecifier(statement);
    return specifier
      ? [
          {
            specifier,
            target: resolveSpecifier(normalizedPath, specifier),
            runtime: runtimeImport(statement),
          },
        ]
      : [];
  });
}

function ownerConcreteTarget(target) {
  const match = target.match(/^\/apps\/server\/src\/([^/]+)\//);
  if (!match || !OWNER_DOMAINS.has(match[1])) return false;
  return /\/(?:application\/service|adapter\/(?:in|out))\//.test(target);
}

function agentOsWritesOwnerRows(file) {
  const write = /\b(?:this\.)?(?:prisma|tx|transaction)\.([A-Za-z]\w*)\.(?:create|createMany|delete|deleteMany|update|updateMany|upsert)\s*\(/g;
  let match;
  while ((match = write.exec(file.source))) {
    if (match[1] !== "capabilityInvocation") return true;
  }
  return false;
}

function centralRegistryDefinesMegaOwnerPort(file) {
  if (!/registry/i.test(file.path)) return false;
  const parsed = parseSource(file.path, file.source);
  let found = false;
  const visit = (node) => {
    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
      const name = node.name?.text ?? "";
      if (/owner.*port|port.*owner/i.test(name)) found = true;
      if (
        /port/i.test(name) &&
        /(?:Sourcing|Channels|Products|Supply|Analytics)[A-Za-z]*Port/.test(
          node.getText(parsed),
        )
      ) {
        const ownerPortTypes = new Set(
          [...node.getText(parsed).matchAll(/(?:Sourcing|Channels|Products|Supply|Analytics)[A-Za-z]*Port/g)].map(
            ([value]) => value.replace(/Port$/, ""),
          ),
        );
        if (ownerPortTypes.size > 1) found = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return found;
}

function architectureSmellExempt(filePath) {
  return (
    filePath.includes("/__tests__/") ||
    /\.(?:spec|test)\.ts$/.test(filePath) ||
    filePath.includes("/generated/")
  );
}

export function analyzeAgentOsHexagonalSources(files) {
  const violations = [];

  for (const file of files) {
    const filePath = normalizePath(file.path);
    if (architectureSmellExempt(filePath)) continue;
    const imports = importsOf(file);

    if (filePath.startsWith(AGENT_OS_ROOT)) {
      if (imports.some((entry) => ownerConcreteTarget(entry.target))) {
        violations.push(
          filePath.slice(1) +
            ": Agent OS must not import owner concrete services; it only aggregates owner incoming ports",
        );
      }
      if (agentOsWritesOwnerRows(file)) {
        violations.push(
          filePath.slice(1) + ": Agent OS must not write owner-domain rows",
        );
      }
      if (centralRegistryDefinesMegaOwnerPort(file)) {
        violations.push(
          filePath.slice(1) +
            ": central registry must not define a mega owner-port interface",
        );
      }

      if (filePath.includes("/adapter/in/http/interaction/")) {
        if (
          imports.some(
            (entry) =>
              entry.runtime &&
              entry.target.includes("/agent-os/application/service/"),
          )
        ) {
          violations.push(
            filePath.slice(1) +
              ": incoming adapter must depend on Agent OS port/in",
          );
        }
      }
    }

    if (
      filePath.startsWith(SOURCING_ROOT) &&
      imports.some(
        (entry) =>
          entry.specifier.includes("agent-os/application/") ||
          entry.target.includes("/agent-os/application/"),
      )
    ) {
      violations.push(
        filePath.slice(1) +
          ": Sourcing must not import Agent OS application contracts",
      );
    }

    if (
      filePath.startsWith(CHANNELS_AGENT_ADAPTER_ROOT) &&
      (filePath.endsWith("/channels-capability-composition.adapter.ts") ||
        /\bdefineCapabilityComposition\s*\(/.test(file.source))
    ) {
      const incomingPort = imports.some(
        (entry) =>
          entry.target.includes("/channels/application/port/in/") ||
          entry.specifier.includes("/application/port/in/"),
      );
      const bypassesPort = imports.some(
        (entry) =>
          /\/(?:application\/service|adapter\/out)\//.test(entry.target),
      );
      if (!incomingPort || bypassesPort || agentOsWritesOwnerRows(file)) {
        violations.push(
          filePath.slice(1) +
            ": Channels mutation must terminate at a Channels incoming port",
        );
      }
    }
  }

  return [...new Set(violations)].sort();
}

export function collectAgentOsArchitectureSmells(files) {
  return files
    .filter((file) => {
      const filePath = normalizePath(file.path);
      return (
        filePath.startsWith(AGENT_OS_ROOT) &&
        file.lines > 700 &&
        !architectureSmellExempt(filePath)
      );
    })
    .map(
      (file) =>
        file.path +
        ": architecture smell (non-blocking): review responsibility and cohesion (" +
        file.lines +
        " lines)",
    );
}

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function listProductionTypeScriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__"
        ? []
        : listProductionTypeScriptFiles(absolutePath);
    }
    return entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !/\.(?:spec|test)\.ts$/.test(entry.name)
      ? [absolutePath]
      : [];
  });
}

function countLines(source) {
  if (source.length === 0) return 0;
  return (
    source.split(/\r\n|\r|\n/).length -
    Number(source.endsWith("\n") || source.endsWith("\r"))
  );
}

export function collectServerProductionSources(root = repoRoot()) {
  return listProductionTypeScriptFiles(path.join(root, "apps", "server", "src")).map(
    (absolutePath) => {
      const source = readFileSync(absolutePath, "utf8");
      return {
        path: path.relative(root, absolutePath),
        source,
        lines: countLines(source),
      };
    },
  );
}

export const collectAgentOsProductionSources = collectServerProductionSources;

function main() {
  const files = collectServerProductionSources();
  const violations = analyzeAgentOsHexagonalSources(files);
  const smells = collectAgentOsArchitectureSmells(files);
  if (violations.length === 0) {
    console.log("check:agent-os-hexagonal PASS");
    for (const smell of smells) console.warn("- " + smell);
    return;
  }

  console.error("check:agent-os-hexagonal FAIL");
  for (const violation of violations) console.error("- " + violation);
  for (const smell of smells) console.warn("- " + smell);
  process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
