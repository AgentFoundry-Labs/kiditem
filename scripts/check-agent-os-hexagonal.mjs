#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AGENT_OS_ROOT = '/apps/server/src/agent-os/';
const INCOMING_ADAPTER = '/agent-os/adapter/in/';
const DIRECT_INPUT_PORT = '/agent-os/application/port/in/';
const CONCRETE_APPLICATION_IMPORT =
  /^\s*import(?:\s+type)?\s+[\s\S]*?\s+from\s+['"][^'"]*application\/service\//m;
const GENERIC_AGENT_RUN_COMPATIBILITY_PORTS = new Set([
  'agent-agui-runner.port.ts',
  'agent-runner.port.ts',
]);

function normalizePath(filePath) {
  return `/${filePath.replaceAll('\\', '/').replace(/^\/+/, '')}`;
}

function isSizeExempt(normalizedPath) {
  return (
    normalizedPath.includes('/__tests__/') ||
    /\.(?:spec|test)\.ts$/.test(normalizedPath) ||
    normalizedPath.includes('/legacy-run/')
  );
}

export function analyzeAgentOsHexagonalSources(files) {
  const violations = [];

  for (const file of files) {
    const normalizedPath = normalizePath(file.path);
    if (!normalizedPath.includes(AGENT_OS_ROOT)) continue;

    if (
      normalizedPath.includes(INCOMING_ADAPTER) &&
      CONCRETE_APPLICATION_IMPORT.test(file.source)
    ) {
      violations.push(
        `${normalizedPath.slice(1)}: incoming adapter must depend on port/in`,
      );
    }

    if (normalizedPath.includes(DIRECT_INPUT_PORT)) {
      const inputPortPath = normalizedPath.split(DIRECT_INPUT_PORT)[1];
      if (
        inputPortPath &&
        !inputPortPath.includes('/') &&
        inputPortPath !== 'index.ts' &&
        !GENERIC_AGENT_RUN_COMPATIBILITY_PORTS.has(inputPortPath)
      ) {
        violations.push(
          `${normalizedPath.slice(1)}: official input port requires capability folder`,
        );
      }
    }

    if (file.lines > 700 && !isSizeExempt(normalizedPath)) {
      violations.push(
        `${normalizedPath.slice(1)}: official AgentOS module exceeds 700 lines`,
      );
    }
  }

  return violations;
}

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function listProductionTypeScriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') return [];
      return listProductionTypeScriptFiles(absolutePath);
    }
    if (
      !entry.isFile() ||
      !entry.name.endsWith('.ts') ||
      /\.(?:spec|test)\.ts$/.test(entry.name)
    ) {
      return [];
    }
    return [absolutePath];
  });
}

function countLines(source) {
  if (source.length === 0) return 0;
  return source.split(/\r\n|\r|\n/).length - Number(source.endsWith('\n') || source.endsWith('\r'));
}

export function collectAgentOsProductionSources(root = repoRoot()) {
  return listProductionTypeScriptFiles(
    path.join(root, 'apps', 'server', 'src', 'agent-os'),
  ).map((absolutePath) => {
    const source = readFileSync(absolutePath, 'utf8');
    return {
      path: path.relative(root, absolutePath),
      source,
      lines: countLines(source),
    };
  });
}

function main() {
  const violations = analyzeAgentOsHexagonalSources(
    collectAgentOsProductionSources(),
  );
  if (violations.length === 0) {
    console.log('check:agent-os-hexagonal PASS');
    return;
  }

  console.error('check:agent-os-hexagonal FAIL');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
