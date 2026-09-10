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
const NON_PUBLIC_IDENTIFIER_FIELDS = Object.freeze([
  'executionId',
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
  const nonPublicIdentifierPattern = new RegExp(
    `\\b(${NON_PUBLIC_IDENTIFIER_FIELDS.join('|')})\\s*:\\s*z\\.`,
    'g',
  );
  for (const match of source.matchAll(nonPublicIdentifierPattern)) {
    violations.push(
      `${relativePath}:${lineNumberAt(source, match.index)}: non-public identifier ${match[1]} in a public contract; use a canonical resource name or digest`,
    );
  }
  const genericId = /\bexport\s+(?:type|interface)\s+Id\b/g;
  for (const match of source.matchAll(genericId)) {
    violations.push(
      `${relativePath}:${lineNumberAt(source, match.index)}: generic exported Id alias is forbidden`,
    );
  }
  const requestIdReuse =
    /\b(?:idempotencyKey|id|executionId|requestKey)\s*:\s*(?:input\.)?requestId\b/g;
  for (const match of source.matchAll(requestIdReuse)) {
    violations.push(
      `${relativePath}:${lineNumberAt(source, match.index)}: request ID reused as idempotency or resource identity`,
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
