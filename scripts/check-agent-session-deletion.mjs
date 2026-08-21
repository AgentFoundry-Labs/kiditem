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

const PRISMA_SOURCE_PATHS = Object.freeze(['prisma/models/agents.prisma']);
const SOURCE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?|py|prisma)$/;

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

const RETIRED = Object.freeze([
  'AgentInteractionRetentionPolicy',
  'AgentSessionLifecycleRequest',
  'AgentSessionTombstone',
  'AgentSessionLegalAuditProjection',
  'AgentSessionArtifactObject',
  'AgentSessionArtifactObjectRetentionHold',
  'AgentSessionArtifactObjectTombstone',
  'legalHoldAt',
  'legalHoldReason',
  'retentionDueAt',
  'retentionClass',
  'independentLegalBasisCode',
  'independentRetentionDueAt',
  'INTERACTION_LIFECYCLE_HMAC_KEY',
]);

const FORBIDDEN_ARTIFACT_FIELDS = Object.freeze([
  'storageReference',
  'storageObjectId',
]);

const FORBIDDEN_DELETE_SCHEDULERS = Object.freeze([
  /AgentSessionDeletion(Job|Processor|Scheduler)/,
  /setInterval\([^)]*(delete|deletion|retention)/is,
  /@Interval\([^)]*(delete|deletion|retention)/is,
]);

const SESSION_MUTATION_TRANSACTION_ADAPTERS = Object.freeze([
  'apps/server/src/agent-os/adapter/out/transaction/interaction/prisma-agent-conversation-event.transaction.ts',
  'apps/server/src/agent-os/adapter/out/transaction/interaction/prisma-agent-run-authorization.transaction.ts',
  'apps/server/src/agent-os/adapter/out/transaction/interaction/prisma-agent-execution-usage.transaction.ts',
  'apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-delegation.transaction.ts',
  'apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-approval-continuation.transaction.ts',
  'apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-attempt-operation.transaction.ts',
  'apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-session-transition.transaction.ts',
]);

const OWNED_OPERATION_CREATE_OWNER = /(?:owned-operation|session-deletion|continue-operation-attempt)/;
const EPHEMERAL_SUCCESS_ASSIGNMENT = /\bsuccessPersistence\s*:\s*['"]ephemeral_on_success['"]/g;
const AGENT_SESSION_DELETE_OPERATION_KEY = 'AGENT_SESSION_DELETE_OPERATION_KEY';

function toRepoPath(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

function isTestOrFixture(relativePath) {
  return (
    relativePath.split('/').some((part) =>
      ['__tests__', 'fixtures', 'fixture'].includes(part),
    ) || /(?:\.spec|\.test)\.[cm]?[jt]sx?$/.test(relativePath)
  );
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

      const repoPath = toRepoPath(relativePath);
      if (
        entry.isFile() &&
        SOURCE_FILE_PATTERN.test(entry.name) &&
        !isTestOrFixture(repoPath)
      ) {
        files.push(repoPath);
      }
    }
  }

  return files.sort();
}

function productionSourcePaths(rootDir) {
  const sourcePaths = ACTIVE_SOURCE_ROOTS.flatMap((relativeRoot) =>
    listSourceFiles(rootDir, relativeRoot),
  );
  for (const relativePath of PRISMA_SOURCE_PATHS) {
    if (existsSync(path.join(rootDir, relativePath))) sourcePaths.push(relativePath);
  }
  return [...new Set(sourcePaths)].sort();
}

function firstMatch(source, pattern) {
  pattern.lastIndex = 0;
  return pattern.exec(source);
}

function allMatches(source, pattern) {
  pattern.lastIndex = 0;
  const matches = [];
  let match = pattern.exec(source);
  while (match) {
    matches.push(match);
    match = pattern.exec(source);
  }
  return matches;
}

function identifierPattern(identifier) {
  return new RegExp(`\\b${identifier}\\b`);
}

function forEachCodeCharacter(source, start, end, visit) {
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  let escaped = false;
  for (let cursor = start; cursor < end; cursor += 1) {
    const character = source[cursor];
    const next = source[cursor + 1];
    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false;
        cursor += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '/' && next === '/') {
      lineComment = true;
      cursor += 1;
      continue;
    }
    if (character === '/' && next === '*') {
      blockComment = true;
      cursor += 1;
      continue;
    }
    if (character === '\'' || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    visit(cursor, character);
  }
}

function objectLiteralContaining(source, index) {
  const starts = [];
  forEachCodeCharacter(source, 0, index, (cursor, character) => {
    if (character === '{') starts.push(cursor);
    if (character === '}') starts.pop();
  });
  const start = starts.at(-1);
  if (start === undefined) return null;

  let nestedObjects = 0;
  let end = null;
  forEachCodeCharacter(source, start, source.length, (cursor, character) => {
    if (end !== null) return;
    if (character === '{') nestedObjects += 1;
    if (character !== '}') return;
    nestedObjects -= 1;
    if (nestedObjects === 0) end = cursor;
  });
  return end === null ? null : source.slice(start, end + 1);
}

function requireLifecycleLock(rootDir) {
  const violations = [];
  for (const relativePath of SESSION_MUTATION_TRANSACTION_ADAPTERS) {
    const absolutePath = path.join(rootDir, relativePath);
    if (!existsSync(absolutePath)) {
      violations.push(
        `${relativePath}: session mutation transaction adapter is required`,
      );
      continue;
    }

    const source = readFileSync(absolutePath, 'utf8');
    if (
      !/lockWritableAgentSession/.test(source) ||
      !/from\s+['"][^'"]*lock-writable-agent-session['"]/.test(source)
    ) {
      violations.push(
        `${relativePath}: session mutation transaction adapter must import canonical lifecycle-lock helper`,
      );
    }
  }
  return violations;
}

function ownershipViolations(relativePath, source) {
  const violations = [];
  const isAgentOsApplicationOrCapability =
    relativePath.startsWith('apps/server/src/agent-os/application/') ||
    relativePath.includes('/capability/');
  const operationRunner = firstMatch(source, /\bOPERATION_RUNNER_PORT\b/);
  if (isAgentOsApplicationOrCapability && operationRunner) {
    violations.push(
      `${relativePath}:${lineNumberAt(source, operationRunner.index)}: session-originated OperationRun must use the owned-run transaction port`,
    );
  }

  const directCreate = firstMatch(source, /\btx\.operationRun\.create\s*\(/);
  if (
    relativePath.startsWith('apps/server/src/agent-os/') &&
    directCreate &&
    !OWNED_OPERATION_CREATE_OWNER.test(relativePath)
  ) {
    violations.push(
      `${relativePath}:${lineNumberAt(source, directCreate.index)}: direct session OperationRun creation must be owned-run, deletion, or continuation transaction code`,
    );
  }
  return violations;
}

function ephemeralSuccessViolations(relativePath, source) {
  const violations = [];
  for (const assignment of allMatches(source, EPHEMERAL_SUCCESS_ASSIGNMENT)) {
    const containingObject = objectLiteralContaining(source, assignment.index);
    const ownsDefinition = containingObject
      && new RegExp(
        `\\bkey\\s*:\\s*${AGENT_SESSION_DELETE_OPERATION_KEY}\\b`,
      ).test(containingObject);
    if (!ownsDefinition) {
      violations.push(
        `${relativePath}:${lineNumberAt(source, assignment.index)}: ephemeral success definitions must use ${AGENT_SESSION_DELETE_OPERATION_KEY}`,
      );
    }
  }
  return violations;
}

export function checkAgentSessionDeletion(rootDir) {
  const violations = [];
  for (const relativePath of productionSourcePaths(rootDir)) {
    const source = readFileSync(path.join(rootDir, relativePath), 'utf8');
    for (const identifier of [...RETIRED, ...FORBIDDEN_ARTIFACT_FIELDS]) {
      const match = firstMatch(source, identifierPattern(identifier));
      if (!match) continue;
      violations.push(
        `${relativePath}:${lineNumberAt(source, match.index)}: retired AgentSession deletion identifier ${identifier}`,
      );
    }
    for (const scheduler of FORBIDDEN_DELETE_SCHEDULERS) {
      const match = firstMatch(source, scheduler);
      if (!match) continue;
      violations.push(
        `${relativePath}:${lineNumberAt(source, match.index)}: second deletion scheduler`,
      );
    }
    violations.push(...ownershipViolations(relativePath, source));
    violations.push(...ephemeralSuccessViolations(relativePath, source));
  }

  violations.push(...requireLifecycleLock(rootDir));
  if (violations.length > 0) {
    throw new Error(['AgentSession deletion violations:', ...violations].join('\n'));
  }
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  try {
    checkAgentSessionDeletion(process.cwd());
    console.log('check:agent-session-deletion PASS');
  } catch (error) {
    console.error('check:agent-session-deletion FAIL');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
