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
