#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ACTIVE_SOURCE_ROOTS = Object.freeze([
  'agents/src',
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

const RETIRED_INTERACTION_SOURCE_IDENTIFIERS = Object.freeze([
  ["'quick_ask'", /(['"`])quick_ask\1/],
  ['QuickAskScope', /\bQuickAskScope\b/],
  ['AgentInteractionThreadBinding', /\bAgentInteractionThreadBinding\b/],
  ['idleExpiresAt', /\bidleExpiresAt\b/],
  ['withQuickAskLock', /\bwithQuickAskLock\b/],
  ['AgentSessionPromotion', /\bAgentSessionPromotion\b/],
  ['interactionClass:', /\binteractionClass\s*\??\s*:/],
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
  'apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-session-artifact-materialization.transaction.ts',
]);

const OWNED_OPERATION_CREATE_OWNER = /(?:owned-operation|session-deletion|continue-operation-attempt)/;
const EPHEMERAL_SUCCESS_ASSIGNMENT = /\bsuccessPersistence\s*:\s*['"]ephemeral_on_success['"]/g;
const AGENT_SESSION_DELETE_OPERATION_KEY = 'AGENT_SESSION_DELETE_OPERATION_KEY';
const TYPESCRIPT_OR_JAVASCRIPT_SOURCE = /\.[cm]?[jt]sx?$/;

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

function identifierPattern(identifier) {
  return new RegExp(`\\b${identifier}\\b`);
}

function retiredInteractionSourceViolations(relativePath, source) {
  const violations = [];
  for (const [identifier, pattern] of RETIRED_INTERACTION_SOURCE_IDENTIFIERS) {
    const match = firstMatch(source, pattern);
    if (match) {
      violations.push(
        `${relativePath}:${lineNumberAt(source, match.index)}: retired agent interaction lifecycle identifier ${identifier}`,
      );
    }
  }
  return violations;
}

function agentExecutionBlock(schemaSource) {
  const match = /^\s*model\s+AgentExecution\s*\{([\s\S]*?)^\s*\}/m.exec(
    schemaSource,
  );
  return match?.[1] ?? null;
}

function executionSessionOwnershipViolations(schemaSource) {
  const block = agentExecutionBlock(schemaSource);
  if (block === null) {
    return ['prisma/models/agents.prisma: AgentExecution model is required'];
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
      violations.push(`prisma/models/agents.prisma: AgentExecution.${field} is required`);
    } else if (declaration[1].endsWith('?')) {
      violations.push(`prisma/models/agents.prisma: AgentExecution.${field} must be non-null`);
    }
  }
  return violations;
}

function isTypeScriptOrJavaScript(relativePath) {
  return TYPESCRIPT_OR_JAVASCRIPT_SOURCE.test(relativePath);
}

function sourceFileFor(relativePath, source) {
  if (!isTypeScriptOrJavaScript(relativePath)) return null;
  return ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true);
}

function staticLiteralText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

function objectPropertyNameText(name) {
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isComputedPropertyName(name)) return staticLiteralText(name.expression);
  return staticLiteralText(name);
}

function isAgentOsApplicationOrCapability(relativePath) {
  return relativePath.startsWith('apps/server/src/agent-os/application/')
    || relativePath.includes('/capability/');
}

function lineNumberOfNode(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function importedSymbolPosition(sourceFile, symbol) {
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if (element.isTypeOnly) continue;
      const importedName = element.propertyName?.text ?? element.name.text;
      if (importedName === symbol) return element.getStart(sourceFile);
    }
  }
  return null;
}

function firstCalledPropertyPosition(sourceFile, propertyName) {
  let position = null;
  const visit = (node) => {
    if (position !== null) return;
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === propertyName
    ) {
      position = node.getStart(sourceFile);
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return position;
}

function runtimeCredentialBrokerVerificationViolations(relativePath, source) {
  const sourceFile = sourceFileFor(relativePath, source);
  if (!sourceFile) return [];

  const brokerBindings = new Set();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if (!element.isTypeOnly && (element.propertyName?.text ?? element.name.text) === 'RuntimeCredentialBroker') {
        brokerBindings.add(element.name.text);
      }
    }
  }
  if (brokerBindings.size === 0) return [];

  const brokerInstances = new Set();
  const isBrokerConstruction = (node) => ts.isNewExpression(node)
    && ts.isIdentifier(node.expression)
    && brokerBindings.has(node.expression.text);
  const visitBindings = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && isBrokerConstruction(node.initializer)) {
      brokerInstances.add(node.name.text);
    }
    ts.forEachChild(node, visitBindings);
  };
  ts.forEachChild(sourceFile, visitBindings);

  const violations = [];
  const isBrokerExpression = (node) => isBrokerConstruction(node)
    || (ts.isIdentifier(node) && brokerInstances.has(node.text));
  const visitCalls = (node) => {
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'verify'
      && isBrokerExpression(node.expression.expression)
    ) {
      violations.push(
        `${relativePath}:${lineNumberOfNode(sourceFile, node)}: RuntimeCredentialBroker verification is not a local MCP authority`,
      );
    }
    ts.forEachChild(node, visitCalls);
  };
  ts.forEachChild(sourceFile, visitCalls);
  return violations;
}

function isDeletionSchedulerContext(relativePath, sourceFile, node) {
  return /(?:delete|deletion|retention)/i.test(relativePath)
    || /(?:delete|deletion|retention|cleanup)/i.test(node.getText(sourceFile));
}

function astSchedulerPosition(relativePath, sourceFile) {
  let position = null;
  const visit = (node) => {
    if (position !== null) return;
    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'setInterval'
      && isDeletionSchedulerContext(relativePath, sourceFile, node)
    ) {
      position = node.getStart(sourceFile);
      return;
    }
    for (const decorator of ts.getDecorators(node) ?? []) {
      const expression = decorator.expression;
      const target = ts.isCallExpression(expression) ? expression.expression : expression;
      if (
        ts.isIdentifier(target)
        && target.text === 'Interval'
        && isDeletionSchedulerContext(relativePath, sourceFile, node)
      ) {
        position = decorator.getStart(sourceFile);
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return position;
}

function schedulerViolations(relativePath, source) {
  const sourceFile = sourceFileFor(relativePath, source);
  const astPosition = sourceFile && astSchedulerPosition(relativePath, sourceFile);
  if (astPosition !== null) {
    return [
      `${relativePath}:${lineNumberAt(source, astPosition)}: second deletion scheduler`,
    ];
  }
  for (const scheduler of FORBIDDEN_DELETE_SCHEDULERS) {
    const match = firstMatch(source, scheduler);
    if (match) {
      return [
        `${relativePath}:${lineNumberAt(source, match.index)}: second deletion scheduler`,
      ];
    }
  }
  return [];
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
  const sourceFile = sourceFileFor(relativePath, source);
  const isApplicationOrCapability = isAgentOsApplicationOrCapability(relativePath);
  const operationRunner = sourceFile
    ? importedSymbolPosition(sourceFile, 'OPERATION_RUNNER_PORT')
    : firstMatch(source, /\bOPERATION_RUNNER_PORT\b/)?.index ?? null;
  const operationRepository = sourceFile
    ? importedSymbolPosition(sourceFile, 'OPERATION_REPOSITORY_PORT')
    : firstMatch(source, /\bOPERATION_REPOSITORY_PORT\b/)?.index ?? null;
  const createRun = sourceFile
    ? firstCalledPropertyPosition(sourceFile, 'createRun')
    : firstMatch(source, /\.createRun\s*\(/)?.index ?? null;
  if (
    isApplicationOrCapability &&
    createRun !== null &&
    (
      operationRunner !== null ||
      operationRepository !== null ||
      relativePath.includes('/capability/')
    )
  ) {
    violations.push(
      `${relativePath}:${lineNumberAt(source, createRun)}: session-originated OperationRun must use the owned-run transaction port`,
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

function incomingOperationAdapterViolations(relativePath, source) {
  if (!relativePath.startsWith('apps/server/src/agent-os/adapter/in/operation/')) return [];
  const sourceFile = sourceFileFor(relativePath, source);
  if (!sourceFile) return [];
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const moduleSpecifier = staticLiteralText(statement.moduleSpecifier);
    if (moduleSpecifier?.includes('/application/port/out/')) {
      return [
        `${relativePath}:${lineNumberOfNode(sourceFile, statement)}: incoming operation adapter must not import application/port/out`,
      ];
    }
  }
  return [];
}

function ephemeralSuccessViolations(relativePath, source) {
  const violations = [];
  const sourceFile = sourceFileFor(relativePath, source);
  if (!sourceFile) {
    const assignment = firstMatch(source, EPHEMERAL_SUCCESS_ASSIGNMENT);
    if (assignment) {
      violations.push(
        `${relativePath}:${lineNumberAt(source, assignment.index)}: ephemeral success definitions must use ${AGENT_SESSION_DELETE_OPERATION_KEY}`,
      );
    }
    return violations;
  }

  const propertyAssignment = (object, name) => object.properties.find((property) => {
    if (!ts.isPropertyAssignment(property)) return false;
    return objectPropertyNameText(property.name) === name;
  });
  const visit = (node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const successPersistence = propertyAssignment(node, 'successPersistence');
      const isEphemeral = successPersistence
        && staticLiteralText(successPersistence.initializer) === 'ephemeral_on_success';
      if (isEphemeral) {
        const key = propertyAssignment(node, 'key');
        const ownsDefinition = key
          && ts.isIdentifier(key.initializer)
          && key.initializer.text === AGENT_SESSION_DELETE_OPERATION_KEY;
        if (!ownsDefinition) {
          violations.push(
            `${relativePath}:${lineNumberOfNode(sourceFile, successPersistence)}: ephemeral success definitions must use ${AGENT_SESSION_DELETE_OPERATION_KEY}`,
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
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
    violations.push(...retiredInteractionSourceViolations(relativePath, source));
    violations.push(...schedulerViolations(relativePath, source));
    violations.push(...ownershipViolations(relativePath, source));
    violations.push(...incomingOperationAdapterViolations(relativePath, source));
    violations.push(...ephemeralSuccessViolations(relativePath, source));
    violations.push(...runtimeCredentialBrokerVerificationViolations(relativePath, source));
  }

  const agentSchemaPath = path.join(rootDir, 'prisma/models/agents.prisma');
  if (!existsSync(agentSchemaPath)) {
    violations.push('prisma/models/agents.prisma: schema file is required');
  } else {
    violations.push(
      ...executionSessionOwnershipViolations(readFileSync(agentSchemaPath, 'utf8')),
    );
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
