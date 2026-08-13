#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ACTIVE_SOURCE_ROOTS = Object.freeze([
  'agents/src',
  'apps/interaction-gateway/src',
  'apps/server/src',
  'apps/web/src',
  'packages/shared/src',
]);

const AGENT_SCHEMA_PATH = 'prisma/models/agents.prisma';
const SOURCE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?|py)$/;

const EXCLUDED_DIRECTORY_NAMES = new Set([
  '.git',
  '.next',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'generated',
  'node_modules',
]);

const RETIRED_EVIDENCE_PATHS = new Set([
  'apps/server/src/agent-os/application/service/__tests__/agent-interaction-identity.service.spec.ts',
  'apps/server/src/agent-os/adapter/out/repository/__tests__/prisma-agent-interaction.repository.pg.integration.spec.ts',
  'packages/shared/src/agent-interaction/index.spec.ts',
]);

const RETIRED_SOURCE_IDENTIFIERS = Object.freeze([
  ["'quick_ask'", /(['"`])quick_ask\1/],
  ['QuickAskScope', /\bQuickAskScope\b/],
  ['AgentInteractionThreadBinding', /\bAgentInteractionThreadBinding\b/],
  ['idleExpiresAt', /\bidleExpiresAt\b/],
  ['withQuickAskLock', /\bwithQuickAskLock\b/],
  ['AgentSessionPromotion', /\bAgentSessionPromotion\b/],
  ['interactionClass:', /\binteractionClass\s*\??\s*:/],
]);

function toRepoPath(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

function listSourceFiles(rootDir, relativeRoot) {
  const absoluteRoot = path.join(rootDir, relativeRoot);
  if (!existsSync(absoluteRoot)) return [];

  const files = [];
  const pending = [relativeRoot];

  while (pending.length > 0) {
    const relativeDir = pending.pop();
    const entries = readdirSync(path.join(rootDir, relativeDir), {
      withFileTypes: true,
    }).sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const relativePath = path.join(relativeDir, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORY_NAMES.has(entry.name)) {
          pending.push(relativePath);
        }
        continue;
      }

      const repoPath = toRepoPath(relativePath);
      if (
        entry.isFile() &&
        SOURCE_FILE_PATTERN.test(entry.name) &&
        !RETIRED_EVIDENCE_PATHS.has(repoPath)
      ) {
        files.push(repoPath);
      }
    }
  }

  return files.sort();
}

function retiredSourceViolations(relativePath, source) {
  const violations = [];

  for (const [identifier, pattern] of RETIRED_SOURCE_IDENTIFIERS) {
    const match = pattern.exec(source);
    if (!match) continue;
    violations.push(
      `${relativePath}:${lineNumberAt(source, match.index)}: retired agent interaction lifecycle identifier ${identifier}`,
    );
  }

  return violations;
}

function agentExecutionBlock(schemaSource) {
  const match = /^\s*model\s+AgentExecution\s*\{([\s\S]*?)^\s*\}/m.exec(
    schemaSource,
  );
  return match?.[1] ?? null;
}

function sessionOwnershipViolations(schemaSource) {
  const block = agentExecutionBlock(schemaSource);
  if (block === null) {
    return [`${AGENT_SCHEMA_PATH}: AgentExecution model is required`];
  }

  const uncommentedBlock = block
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
  const violations = [];

  for (const field of ['sessionId', 'sessionTaskId']) {
    const declaration = new RegExp(`^\\s*${field}\\s+(\\S+)`, 'm').exec(
      uncommentedBlock,
    );
    if (!declaration) {
      violations.push(`${AGENT_SCHEMA_PATH}: AgentExecution.${field} is required`);
      continue;
    }
    if (declaration[1].endsWith('?')) {
      violations.push(
        `${AGENT_SCHEMA_PATH}: AgentExecution.${field} must be non-null`,
      );
    }
  }

  return violations;
}

export function checkAgentInteractionLifecycle(rootDir) {
  const violations = [];

  for (const relativeRoot of ACTIVE_SOURCE_ROOTS) {
    for (const relativePath of listSourceFiles(rootDir, relativeRoot)) {
      const source = readFileSync(path.join(rootDir, relativePath), 'utf8');
      violations.push(...retiredSourceViolations(relativePath, source));
    }
  }

  const schemaPath = path.join(rootDir, AGENT_SCHEMA_PATH);
  if (!existsSync(schemaPath)) {
    violations.push(`${AGENT_SCHEMA_PATH}: schema file is required`);
  } else {
    violations.push(
      ...sessionOwnershipViolations(readFileSync(schemaPath, 'utf8')),
    );
  }

  if (violations.length > 0) {
    throw new Error(
      ['Retired agent interaction lifecycle violations:', ...violations].join(
        '\n',
      ),
    );
  }
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  try {
    checkAgentInteractionLifecycle(process.cwd());
    console.log('check:agent-interaction-lifecycle PASS');
  } catch (error) {
    console.error('check:agent-interaction-lifecycle FAIL');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
