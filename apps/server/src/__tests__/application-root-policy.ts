import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const RETIRED_LIFECYCLE_IDENTIFIERS = [
  'cancelSourcingRunsForServerLifecycle',
  'operation_worker_shutdown',
] as const;

const ROOT_MODULES = [
  'agent-worker-application.module.ts',
  'agent-mcp-application.module.ts',
] as const;

function productionTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolute = join(directory, entry);
    if (statSync(absolute).isDirectory()) {
      if (entry === '__tests__') return [];
      return productionTypeScriptFiles(absolute);
    }
    return entry.endsWith('.ts') && !entry.endsWith('.spec.ts')
      ? [absolute]
      : [];
  });
}

function importSpecifiers(source: string): string[] {
  const specifiers = [];
  const importPattern = /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]|(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = importPattern.exec(source))) {
    const specifier = match[1] ?? match[2];
    if (specifier) specifiers.push(specifier);
  }
  return specifiers;
}

function resolveRelativeImport(
  sourceFile: string,
  specifier: string,
): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(sourceFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function sourceGraph(serverSrc: string) {
  const sources = new Map(
    productionTypeScriptFiles(serverSrc).map((file) => [
      file,
      readFileSync(file, 'utf8'),
    ]),
  );
  const graph = new Map<string, string[]>();
  for (const [file, source] of sources) {
    const dependencies = importSpecifiers(source)
      .map((specifier) => resolveRelativeImport(file, specifier))
      .filter((dependency): dependency is string => dependency !== null)
      .filter((dependency) => sources.has(dependency));
    graph.set(file, dependencies);
  }
  return { sources, graph };
}

function pathTo(
  graph: Map<string, string[]>,
  start: string,
  target: string,
): string[] | null {
  const pending = [[start]];
  const seen = new Set<string>();
  while (pending.length > 0) {
    const path = pending.shift();
    if (!path) continue;
    const current = path.at(-1);
    if (!current || seen.has(current)) continue;
    if (current === target) return path;
    seen.add(current);
    for (const dependency of graph.get(current) ?? []) {
      pending.push([...path, dependency]);
    }
  }
  return null;
}

export function inspectStaticApplicationRootPolicy(serverSrc: string): string[] {
  const { sources, graph } = sourceGraph(serverSrc);
  const violations = [];

  for (const [file, source] of sources) {
    const displayPath = relative(serverSrc, file);
    if (importSpecifiers(source).some((specifier) => /(?:^|\/)app\.module$/.test(specifier))) {
      violations.push(`${displayPath} imports retired AppModule`);
    }
    for (const identifier of RETIRED_LIFECYCLE_IDENTIFIERS) {
      if (source.includes(identifier)) {
        violations.push(`${displayPath} retains ${identifier}`);
      }
    }
  }

  const operationsModule = join(serverSrc, 'operations', 'operations.module.ts');
  for (const rootName of ROOT_MODULES) {
    const root = join(serverSrc, rootName);
    const path = pathTo(graph, root, operationsModule);
    if (path) {
      violations.push(
        `${rootName} reaches OperationsModule through ${path
          .map((file) => relative(serverSrc, file))
          .join(' -> ')}`,
      );
    }
  }

  return violations.sort();
}
