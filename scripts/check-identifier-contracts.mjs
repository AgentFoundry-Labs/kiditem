#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_CONTRACT_ROOTS = Object.freeze([
  'packages/shared/src/identifiers',
  'packages/shared/src/agent-interaction',
  'apps/server/src/agent-os/domain/operation',
  'apps/server/src/agent-os/adapter/in/http/dto',
]);

const OPERATIONS_SOURCE_ROOT = 'apps/server/src/operations';
const INTERACTION_REPOSITORY_PATH =
  'apps/server/src/agent-os/adapter/out/repository/prisma-agent-interaction.repository.ts';
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
  '__tests__',
]);
const RAW_PUBLIC_IDENTIFIER_FIELDS = Object.freeze([
  'agentVersionId',
  'executionId',
  'policySnapshotId',
  'sessionId',
  'sessionTaskId',
  'taskId',
]);
const SESSION_GRAPH_MODELS = Object.freeze([
  'AgentSession',
  'AgentConversationEvent',
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
        if (!EXCLUDED_DIRECTORY_NAMES.has(entry.name)) pending.push(relativePath);
        continue;
      }
      if (!entry.isFile() || !SOURCE_FILE_PATTERN.test(entry.name)) continue;
      files.push(toRepoPath(relativePath));
    }
  }
  return files.sort();
}

function publicContractViolations(relativePath, source) {
  const violations = [];
  const rawFieldPattern = new RegExp(
    `\\b(${RAW_PUBLIC_IDENTIFIER_FIELDS.join('|')})\\s*:\\s*z\\.`,
    'g',
  );
  for (const match of source.matchAll(rawFieldPattern)) {
    violations.push(
      `${relativePath}:${lineNumberAt(source, match.index)}: raw storage identifier ${match[1]} in a public contract; use a canonical resource name or digest`,
    );
  }
  const genericId = /\bexport\s+(?:type|interface)\s+Id\b/g;
  for (const match of source.matchAll(genericId)) {
    violations.push(
      `${relativePath}:${lineNumberAt(source, match.index)}: generic exported Id alias is forbidden`,
    );
  }
  const uncheckedNameCast =
    /\bas\s+(?:AgentSessionName|AgentConversationEventName|OperationRunName)\b/g;
  for (const match of source.matchAll(uncheckedNameCast)) {
    violations.push(
      `${relativePath}:${lineNumberAt(source, match.index)}: unchecked resource-name cast is forbidden; parse the name`,
    );
  }
  const requestIdReuse =
    /\b(?:idempotencyKey|id|sessionId|taskId|executionId)\s*:\s*(?:input\.)?requestId\b/g;
  for (const match of source.matchAll(requestIdReuse)) {
    violations.push(
      `${relativePath}:${lineNumberAt(source, match.index)}: request ID reused as idempotency or resource identity`,
    );
  }
  return violations;
}

function interactionOrderingViolations(relativePath, source) {
  const violations = [];
  const timestampSort = /\.sort\s*\(\s*\([^)]*\)\s*=>[\s\S]{0,240}?(?:createdAt|updatedAt)/g;
  for (const match of source.matchAll(timestampSort)) {
    violations.push(
      `${relativePath}:${lineNumberAt(source, match.index)}: timestamp sorting cannot define canonical conversation order; use sequence`,
    );
  }
  const idSort = /\.sort\s*\(\s*\([^)]*\)\s*=>[\s\S]{0,240}?\.id\b/g;
  for (const match of source.matchAll(idSort)) {
    violations.push(
      `${relativePath}:${lineNumberAt(source, match.index)}: UUID sorting cannot define canonical conversation order; use sequence`,
    );
  }
  return violations;
}

function schemaModelBlock(schemaSource, model) {
  const expression = new RegExp(`^\\s*model\\s+${model}\\s*\\{([\\s\\S]*?)^\\s*\\}`, 'm');
  return expression.exec(schemaSource)?.[1] ?? null;
}

function schemaViolations(schemaSource) {
  const violations = [];
  for (const model of SESSION_GRAPH_MODELS) {
    const block = schemaModelBlock(schemaSource, model);
    if (!block) continue;
    const name = /^\s*name\s+\S+/m.exec(block);
    if (!name) continue;
    violations.push(
      `${AGENT_SCHEMA_PATH}:${lineNumberAt(schemaSource, schemaSource.indexOf(name[0]))}: ${model} has a redundant persisted resource name`,
    );
  }
  return violations;
}

function operationsViolations(relativePath, source) {
  const match = /\bimport(?:\s+type)?\s*\{[^}]*\bAgentCapabilityRegistry\b[^}]*\}\s*from\b/g.exec(source);
  if (!match) return [];
  return [
    `${relativePath}:${lineNumberAt(source, match.index)}: Operations handler imports AgentCapabilityRegistry`,
  ];
}

export function checkIdentifierContracts(rootDir) {
  const violations = [];
  for (const sourceRoot of PUBLIC_CONTRACT_ROOTS) {
    for (const relativePath of listSourceFiles(rootDir, sourceRoot)) {
      const source = readFileSync(path.join(rootDir, relativePath), 'utf8');
      violations.push(...publicContractViolations(relativePath, source));
    }
  }

  const interactionRepository = path.join(rootDir, INTERACTION_REPOSITORY_PATH);
  if (existsSync(interactionRepository)) {
    violations.push(
      ...interactionOrderingViolations(
        INTERACTION_REPOSITORY_PATH,
        readFileSync(interactionRepository, 'utf8'),
      ),
    );
  }

  const schemaPath = path.join(rootDir, AGENT_SCHEMA_PATH);
  if (existsSync(schemaPath)) {
    violations.push(...schemaViolations(readFileSync(schemaPath, 'utf8')));
  }

  for (const relativePath of listSourceFiles(rootDir, OPERATIONS_SOURCE_ROOT)) {
    const source = readFileSync(path.join(rootDir, relativePath), 'utf8');
    violations.push(...operationsViolations(relativePath, source));
  }

  if (violations.length > 0) {
    throw new Error(['Identifier contract violations:', ...violations].join('\n'));
  }
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  try {
    checkIdentifierContracts(process.cwd());
    console.log('check:identifier-contracts PASS');
  } catch (error) {
    console.error('check:identifier-contracts FAIL');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
