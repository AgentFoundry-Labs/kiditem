#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const AGENT_OS_ROOT = "/apps/server/src/agent-os/";
const INCOMING_ADAPTER = "/agent-os/adapter/in/";
const DIRECT_INPUT_PORT = "/agent-os/application/port/in/";
const GENERIC_AGENT_RUN_COMPATIBILITY_PORTS = new Set([
  "agent-agui-runner.port.ts",
  "agent-runner.port.ts",
]);

function normalizePath(filePath) {
  return `/${filePath.replaceAll("\\", "/").replace(/^\/+/, "")}`;
}

function isArchitectureSmellExempt(normalizedPath) {
  return (
    normalizedPath.includes("/__tests__/") ||
    /\.(?:spec|test)\.ts$/.test(normalizedPath) ||
    normalizedPath.includes("/legacy-run/") ||
    normalizedPath.includes("/generated/")
  );
}

export function analyzeAgentOsHexagonalSources(files) {
  const violations = [];
  const sources = new Map(
    files.map((file) => [normalizePath(file.path), file]),
  );

  for (const file of files) {
    const normalizedPath = normalizePath(file.path);
    if (!normalizedPath.includes(AGENT_OS_ROOT)) continue;

    if (!isArchitectureSmellExempt(normalizedPath) && hasChildProcessImport(file.source)) {
      violations.push(
        `${normalizedPath.slice(1)}: Agent OS/API runtime must not import child_process`,
      );
    }

    if (
      normalizedPath.includes(INCOMING_ADAPTER) &&
      reachesConcreteApplicationService(normalizedPath, sources)
    ) {
      violations.push(
        `${normalizedPath.slice(1)}: incoming adapter must depend on port/in`,
      );
    }

    if (
      normalizedPath.includes(INCOMING_ADAPTER) &&
      hasDirectOutgoingAdapterRuntimeImport(file)
    ) {
      violations.push(
        `${normalizedPath.slice(1)}: incoming adapter must not import adapter/out at runtime`,
      );
    }

    if (normalizedPath.includes(DIRECT_INPUT_PORT)) {
      const inputPortPath = normalizedPath.split(DIRECT_INPUT_PORT)[1];
      if (
        inputPortPath &&
        !inputPortPath.includes("/") &&
        inputPortPath !== "index.ts" &&
        !GENERIC_AGENT_RUN_COMPATIBILITY_PORTS.has(inputPortPath)
      ) {
        violations.push(
          `${normalizedPath.slice(1)}: official input port requires capability folder`,
        );
      }
    }
  }

  return violations;
}

function hasChildProcessImport(source) {
  return /(?:from\s+["'](?:node:)?child_process["']|require\(\s*["'](?:node:)?child_process["']\s*\))/.test(
    source,
  );
}

function hasDirectOutgoingAdapterRuntimeImport(file) {
  const sourceFile = ts.createSourceFile(
    file.path,
    file.source,
    ts.ScriptTarget.Latest,
    true,
  );
  return sourceFile.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      !isTypeOnlyDependency(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text.includes('adapter/out/'),
  );
}

function reachesConcreteApplicationService(entryPath, sources) {
  const visited = new Set();
  const pending = [{ path: entryPath, binding: null }];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    const { path: currentPath, binding } = current;
    const visitKey = `${currentPath}:${binding ?? "*"}`;
    if (visited.has(visitKey)) continue;
    visited.add(visitKey);

    if (currentPath.includes("/agent-os/application/service/")) return true;
    const currentFile = sources.get(currentPath);
    if (!currentFile) continue;
    if (binding && isExportedNestModuleBinding(currentFile, binding)) continue;
    for (const dependency of staticLocalDependencies(currentFile, sources)) {
      pending.push(dependency);
    }
  }
  return false;
}

function isExportedNestModuleBinding(file, binding) {
  const sourceFile = ts.createSourceFile(
    file.path,
    file.source,
    ts.ScriptTarget.Latest,
    true,
  );
  const { moduleBindings, namespaceBindings } = nestModuleDecoratorBindings(
    sourceFile,
  );
  return sourceFile.statements.some(
    (statement) =>
      ts.isClassDeclaration(statement) &&
      isExported(statement) &&
      statement.name?.text === binding &&
      (ts.getDecorators(statement) ?? []).some((decorator) => {
        const expression = decorator.expression;
        if (!ts.isCallExpression(expression)) return false;
        const target = expression.expression;
        return (
          (ts.isIdentifier(target) && moduleBindings.has(target.text)) ||
          (ts.isPropertyAccessExpression(target) &&
            target.name.text === "Module" &&
            ts.isIdentifier(target.expression) &&
            namespaceBindings.has(target.expression.text))
        );
      }),
  );
}

function nestModuleDecoratorBindings(sourceFile) {
  const moduleBindings = new Set();
  const namespaceBindings = new Set();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "@nestjs/common"
    ) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        const importedName = element.propertyName?.text ?? element.name.text;
        if (importedName === "Module") moduleBindings.add(element.name.text);
      }
    }
    if (bindings && ts.isNamespaceImport(bindings)) {
      namespaceBindings.add(bindings.name.text);
    }
  }
  return { moduleBindings, namespaceBindings };
}

function isExported(statement) {
  return !!statement.modifiers?.some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
  );
}

function staticLocalDependencies(file, sources) {
  const sourceFile = ts.createSourceFile(
    file.path,
    file.source,
    ts.ScriptTarget.Latest,
    true,
  );
  const dependencies = [];
  for (const statement of sourceFile.statements) {
    const specifier = moduleSpecifierOf(statement);
    if (!specifier || isTypeOnlyDependency(statement)) continue;
    const resolved = resolveLocalModule(
      normalizePath(file.path),
      specifier,
      sources,
    );
    if (!resolved) continue;
    for (const binding of dependencyBindings(statement)) {
      dependencies.push({ path: resolved, binding });
    }
  }
  return dependencies;
}

function dependencyBindings(statement) {
  if (ts.isImportDeclaration(statement)) {
    const clause = statement.importClause;
    if (!clause) return [null];
    const bindings = clauseBindings(clause.name, clause.namedBindings);
    return bindings.length > 0 ? bindings : [null];
  }
  if (ts.isExportDeclaration(statement)) {
    const clause = statement.exportClause;
    if (!clause || !ts.isNamedExports(clause)) return [null];
    const bindings = clause.elements
      .filter((element) => !element.isTypeOnly)
      .map((element) => element.propertyName?.text ?? element.name.text);
    return bindings.length > 0 ? bindings : [null];
  }
  return [null];
}

function clauseBindings(defaultBinding, namedBindings) {
  if (defaultBinding || !namedBindings || ts.isNamespaceImport(namedBindings)) {
    return [null];
  }
  if (!ts.isNamedImports(namedBindings)) return [null];
  return namedBindings.elements
    .filter((element) => !element.isTypeOnly)
    .map((element) => element.propertyName?.text ?? element.name.text);
}

function moduleSpecifierOf(statement) {
  if (
    (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
    statement.moduleSpecifier &&
    ts.isStringLiteral(statement.moduleSpecifier)
  )
    return statement.moduleSpecifier.text;
  if (
    ts.isImportEqualsDeclaration(statement) &&
    ts.isExternalModuleReference(statement.moduleReference) &&
    statement.moduleReference.expression &&
    ts.isStringLiteral(statement.moduleReference.expression)
  )
    return statement.moduleReference.expression.text;
  return null;
}

function isTypeOnlyDependency(statement) {
  if (
    (ts.isImportDeclaration(statement) && statement.importClause?.isTypeOnly) ||
    (ts.isExportDeclaration(statement) && statement.isTypeOnly)
  ) {
    return true;
  }

  const importClause = ts.isImportDeclaration(statement)
    ? statement.importClause
    : undefined;
  if (importClause?.name) return false;

  const clause = importClause
    ? importClause.namedBindings
    : ts.isExportDeclaration(statement)
      ? statement.exportClause
      : undefined;
  return (
    !!clause &&
    (ts.isNamedImports(clause) || ts.isNamedExports(clause)) &&
    clause.elements.length > 0 &&
    clause.elements.every((element) => element.isTypeOnly)
  );
}

function resolveLocalModule(fromPath, specifier, sources) {
  let basePath;
  if (specifier.startsWith(".")) {
    basePath = path.posix.resolve(path.posix.dirname(fromPath), specifier);
  } else if (specifier.startsWith("@/")) {
    const sourceRoot = fromPath.indexOf("/apps/server/src/");
    if (sourceRoot < 0) return null;
    basePath = `${fromPath.slice(0, sourceRoot)}/apps/server/src/${specifier.slice(2)}`;
  } else {
    return null;
  }

  for (const candidate of moduleCandidates(basePath)) {
    if (sources.has(candidate)) return candidate;
  }
  return null;
}

function moduleCandidates(basePath) {
  const extensions = ["", ".ts", ".tsx", ".mts", ".cts", ".d.ts"];
  return extensions.flatMap((extension) => [
    `${basePath}${extension}`,
    `${basePath}/index${extension}`,
  ]);
}

export function collectAgentOsArchitectureSmells(files) {
  const smells = [];

  for (const file of files) {
    const normalizedPath = normalizePath(file.path);
    if (
      !normalizedPath.includes(AGENT_OS_ROOT) ||
      file.lines <= 700 ||
      isArchitectureSmellExempt(normalizedPath)
    ) {
      continue;
    }
    smells.push(
      `${normalizedPath.slice(1)}: architecture smell (non-blocking): review responsibility and cohesion (${file.lines} lines)`,
    );
  }

  return smells;
}

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function listProductionTypeScriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") return [];
      return listProductionTypeScriptFiles(absolutePath);
    }
    if (
      !entry.isFile() ||
      !entry.name.endsWith(".ts") ||
      /\.(?:spec|test)\.ts$/.test(entry.name)
    ) {
      return [];
    }
    return [absolutePath];
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
  return listProductionTypeScriptFiles(
    path.join(root, "apps", "server", "src"),
  ).map((absolutePath) => {
    const source = readFileSync(absolutePath, "utf8");
    return {
      path: path.relative(root, absolutePath),
      source,
      lines: countLines(source),
    };
  });
}

export const collectAgentOsProductionSources = collectServerProductionSources;

function main() {
  const files = collectServerProductionSources();
  const violations = analyzeAgentOsHexagonalSources(files);
  const smells = collectAgentOsArchitectureSmells(files);
  if (violations.length === 0) {
    console.log("check:agent-os-hexagonal PASS");
    for (const smell of smells) {
      console.warn(`- ${smell}`);
    }
    return;
  }

  console.error("check:agent-os-hexagonal FAIL");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  for (const smell of smells) {
    console.warn(`- ${smell}`);
  }
  process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
