import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

function model(source: string, name: string): string {
  const match = source.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  expect(match, `model ${name} must exist`).not.toBeNull();
  return match![1];
}

describe('AgentSession complete-deletion Prisma schema contract', () => {
  it('fences the current deletion run to the session organization and requester', () => {
    const session = model(read('prisma/models/agents.prisma'), 'AgentSession');

    expect(session).toMatch(/deletionRequestedAt\s+DateTime\?\s+@map\("deletion_requested_at"\)\s+@db\.Timestamptz/);
    expect(session).toMatch(/deletionRequestedByUserId\s+String\?\s+@map\("deletion_requested_by_user_id"\)\s+@db\.Uuid/);
    expect(session).toMatch(/deletionOperationRunId\s+String\?\s+@map\("deletion_operation_run_id"\)\s+@db\.Uuid/);
    expect(session).toMatch(/deletionFailureCode\s+String\?\s+@map\("deletion_failure_code"\)/);
    expect(session).toMatch(/deletionRequester\s+User\?\s+@relation\("AgentSessionDeletionRequestedBy", fields: \[deletionRequestedByUserId\], references: \[id\], onDelete: Restrict\)/);
    expect(session).toMatch(/deletionOperationRun\s+OperationRun\?\s+@relation\("AgentSessionCurrentDeletionRun", fields: \[deletionOperationRunId, organizationId\], references: \[id, organizationId\], onDelete: Restrict\)/);
    expect(session).toMatch(/operationRunOwnerships\s+AgentSessionOperationRunOwnership\[\]\s+@relation\("AgentSessionOperationRunOwnerships"\)/);
    expect(session).toContain('@@index([deletionOperationRunId, organizationId])');
  });

  it('stores runtime-start credentials separately from provider runtime generation', () => {
    const attempt = model(read('prisma/models/agents.prisma'), 'AgentExecutionAttempt');

    expect(attempt).toMatch(/runtimeStartIntentId\s+String\?\s+@map\("runtime_start_intent_id"\)\s+@db\.Uuid/);
    expect(attempt).toMatch(/runtimeCredentialGeneration\s+Int\s+@default\(0\)\s+@map\("runtime_credential_generation"\)/);
    expect(attempt).toMatch(/runtimeGeneration\s+Int\s+@default\(0\)\s+@map\("runtime_generation"\)/);
  });

  it('keeps immutable deletion-operation bindings independent of the session and user graphs', () => {
    const binding = model(read('prisma/models/agents.prisma'), 'AgentSessionDeletionOperationBinding');

    expect(binding).toMatch(/organizationId\s+String\s+@map\("organization_id"\)\s+@db\.Uuid/);
    expect(binding).toMatch(/sessionId\s+String\s+@map\("session_id"\)\s+@db\.Uuid/);
    expect(binding).toMatch(/sessionCreatorUserId\s+String\s+@map\("session_creator_user_id"\)\s+@db\.Uuid/);
    expect(binding).toMatch(/deletionRequestedByUserId\s+String\s+@map\("deletion_requested_by_user_id"\)\s+@db\.Uuid/);
    expect(binding).toMatch(/retryGeneration\s+Int\s+@default\(1\)\s+@map\("retry_generation"\)/);
    expect(binding).toMatch(/operationRunId\s+String\s+@map\("operation_run_id"\)\s+@db\.Uuid/);
    expect(binding).toMatch(/predecessorOperationRunId\s+String\?\s+@map\("predecessor_operation_run_id"\)\s+@db\.Uuid/);
    expect(binding).toMatch(/organization\s+Organization\s+@relation\("AgentSessionDeletionBindingOrganization", fields: \[organizationId\], references: \[id\], onDelete: Restrict\)/);
    expect(binding).toMatch(/operationRun\s+OperationRun\s+@relation\("AgentSessionDeletionBindingRun", fields: \[operationRunId, organizationId\], references: \[id, organizationId\], onDelete: Restrict\)/);
    expect(binding).toMatch(/predecessorOperationRun\s+OperationRun\?\s+@relation\("AgentSessionDeletionBindingPredecessor", fields: \[predecessorOperationRunId, organizationId\], references: \[id, organizationId\], onDelete: Restrict\)/);
    expect(binding).toContain('@@unique([operationRunId, organizationId], map: "agent_session_deletion_binding_run_org_key")');
    expect(binding).toContain('@@index([organizationId, sessionId, retryGeneration, createdAt])');
    expect(binding).toContain('@@index([predecessorOperationRunId, organizationId])');
    expect(binding).toContain('@@map("agent_session_deletion_operation_bindings")');
    expect(binding).not.toMatch(/\bAgentSession\b/);
    expect(binding).not.toMatch(/\bUser\b/);
  });

  it('makes each operation run have one organization-fenced session ownership edge', () => {
    const ownership = model(read('prisma/models/agents.prisma'), 'AgentSessionOperationRunOwnership');

    expect(ownership).toMatch(/session\s+AgentSession\s+@relation\("AgentSessionOperationRunOwnerships", fields: \[sessionId, organizationId\], references: \[id, organizationId\], onDelete: Restrict\)/);
    expect(ownership).toMatch(/operationRun\s+OperationRun\s+@relation\("AgentSessionOperationRunOwnership", fields: \[operationRunId, organizationId\], references: \[id, organizationId\], onDelete: Restrict\)/);
    expect(ownership).toContain('@@unique([operationRunId, organizationId], map: "agent_session_operation_run_ownership_run_org_key")');
    expect(ownership).toContain('@@index([sessionId, organizationId])');
    expect(ownership).toContain('@@map("agent_session_operation_run_ownerships")');
  });

  it('declares the named reverse relations on Organization, User, and OperationRun', () => {
    const coreSchema = read('prisma/models/core.prisma');
    const systemSchema = read('prisma/models/system.prisma');

    expect(model(coreSchema, 'Organization')).toMatch(/agentSessionDeletionOperationBindings\s+AgentSessionDeletionOperationBinding\[\]\s+@relation\("AgentSessionDeletionBindingOrganization"\)/);
    expect(model(coreSchema, 'User')).toMatch(/requestedAgentSessionDeletions\s+AgentSession\[\]\s+@relation\("AgentSessionDeletionRequestedBy"\)/);
    const operationRun = model(systemSchema, 'OperationRun');
    expect(operationRun).toMatch(/agentSessionCurrentDeletionRuns\s+AgentSession\[\]\s+@relation\("AgentSessionCurrentDeletionRun"\)/);
    expect(operationRun).toMatch(/agentSessionDeletionOperationBindings\s+AgentSessionDeletionOperationBinding\?\s+@relation\("AgentSessionDeletionBindingRun"\)/);
    expect(operationRun).toMatch(/agentSessionDeletionOperationBindingPredecessors\s+AgentSessionDeletionOperationBinding\[\]\s+@relation\("AgentSessionDeletionBindingPredecessor"\)/);
    expect(operationRun).toMatch(/agentSessionOperationRunOwnership\s+AgentSessionOperationRunOwnership\?\s+@relation\("AgentSessionOperationRunOwnership"\)/);
  });

  it('keeps only deletion bindings, ownership, and fenced materialization state', () => {
    const agents = read('prisma/models/agents.prisma');
    const artifact = model(agents, 'AgentSessionArtifact');
    const materialization = model(agents, 'AgentSessionArtifactMaterialization');

    expect(artifact).toMatch(/materializationOperationRunId\s+String\s+@map\("materialization_operation_run_id"\)\s+@db\.Uuid/);
    expect(artifact).toMatch(/materializationOperationRun\s+OperationRun\s+@relation\("AgentSessionArtifactMaterializationRun", fields: \[materializationOperationRunId, organizationId\], references: \[id, organizationId\], onDelete: Restrict\)/);
    expect(artifact).toMatch(/materialization\s+AgentSessionArtifactMaterialization\?/);
    expect(materialization).toMatch(/providerUploadId\s+String\?\s+@map\("provider_upload_id"\)\s+@db\.Text/);
    expect(materialization).toMatch(/artifact\s+AgentSessionArtifact.*onDelete: Cascade/);
    expect(materialization).toMatch(/operationRun\s+OperationRun.*onDelete: Restrict/);
    for (const forbiddenTransientField of [
      'job',
      'lease',
      'retry',
      'storageKey',
      'objectKey',
      'storageReference',
    ]) expect(materialization).not.toContain(forbiddenTransientField);
    expect(agents).toContain('model AgentSessionDeletionOperationBinding');
    expect(agents).toContain('model AgentSessionOperationRunOwnership');
  });

  it('removes every unreleased retention, legal, tombstone, and shared-object contract', () => {
    const source = [
      read('prisma/models/agents.prisma'),
      read('prisma/models/core.prisma'),
      read('prisma/models/system.prisma'),
    ].join('\n');
    for (const retired of [
      'AgentInteractionRetentionPolicy',
      'AgentSessionLifecycleRequest',
      'AgentSessionTombstone',
      'AgentSessionLegalAuditProjection',
      'AgentSessionArtifactObject',
      'storageObjectId',
      'storageReference',
      'retentionClass',
      'independentLegalBasisCode',
      'independentRetentionDueAt',
      'legalHoldAt',
      'legalHoldReason',
      'retentionDueAt',
    ]) expect(source).not.toContain(retired);
  });
});
