import { describe, expect, it } from 'vitest';
import type { OperationRunRecord } from '../../../../application/port/out/repository/operation.repository.port';
import { mapOperationRunToPanelItem } from '../operation-panel.mapper';

function run(status: OperationRunRecord['status']): OperationRunRecord {
  const now = new Date('2026-08-01T00:00:00.000Z');
  return {
    id: '11111111-1111-1111-1111-111111111111',
    organizationId: '22222222-2222-2222-2222-222222222222',
    operationKey: 'inventory.refresh_sellpia_snapshot',
    definitionVersion: 1,
    title: '셀피아 재고 스냅샷 갱신',
    ownerDomain: 'inventory',
    engineType: 'browser',
    status,
    triggerSource: 'dashboard',
    requestedByUserId: null,
    parentRunId: null,
    scheduleId: null,
    nativeRunType: null,
    nativeRunId: null,
    idempotencyKey: null,
    input: {},
    result: null,
    progress: null,
    maxAttempts: 1,
    attempts: 0,
    claimedBy: null,
    attemptToken: null,
    claimedAt: null,
    leaseExpiresAt: null,
    scheduledFor: null,
    errorCode: null,
    errorMessage: null,
    requestedBy: null,
    startedAt: null,
    finishedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe('mapOperationRunToPanelItem', () => {
  it('maps browser waiting work to the same visible running state', () => {
    expect(mapOperationRunToPanelItem(run('waiting_runtime'))).toMatchObject({
      kind: 'run',
      source: 'operation',
      status: 'running',
      phase: 'waiting_runtime',
      subtitle: '실행 중',
    });
  });

  it('preserves operator attention as phase without changing the panel wire status', () => {
    expect(mapOperationRunToPanelItem(run('attention_required'))).toMatchObject({
      status: 'pending',
      phase: 'attention_required',
      subtitle: '확인 필요',
    });
  });
});
