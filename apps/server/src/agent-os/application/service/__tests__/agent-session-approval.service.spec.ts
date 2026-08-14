import { describe, expect, it, vi } from 'vitest';
import {
  AgentExecutionIdSchema,
  AgentExecutionAttemptIdSchema,
  AgentSessionIdSchema,
  AgentSessionTaskIdSchema,
  formatAgentExecutionName,
  formatAgentExecutionAttemptName,
  formatAgentSessionName,
  formatAgentSessionTaskName,
  OrganizationIdSchema,
} from '@kiditem/shared/identifiers';
import { AgentSessionApprovalService } from '../agent-session-approval.service';

const ORGANIZATION_ID = 'org-1';
const SESSION_ID = '00000000-0000-4000-8000-000000000001';
const TASK_ID = '00000000-0000-4000-8000-000000000002';
const EXECUTION_ID = '00000000-0000-4000-8000-000000000003';
const ATTEMPT_ID = '00000000-0000-4000-8000-000000000004';
const APPROVAL_ID = '00000000-0000-4000-8000-000000000005';
const OPERATION_RUN_ID = '00000000-0000-4000-8000-000000000006';
const organization = OrganizationIdSchema.parse(ORGANIZATION_ID);
const session = formatAgentSessionName(organization, AgentSessionIdSchema.parse(SESSION_ID));
const task = formatAgentSessionTaskName(organization, AgentSessionIdSchema.parse(SESSION_ID), AgentSessionTaskIdSchema.parse(TASK_ID));
const execution = formatAgentExecutionName(organization, AgentSessionIdSchema.parse(SESSION_ID), AgentExecutionIdSchema.parse(EXECUTION_ID));
const attempt = formatAgentExecutionAttemptName(
  organization,
  AgentSessionIdSchema.parse(SESSION_ID),
  AgentExecutionIdSchema.parse(EXECUTION_ID),
  AgentExecutionAttemptIdSchema.parse(ATTEMPT_ID),
);

function approval(overrides: Record<string, unknown> = {}) {
  return {
    id: APPROVAL_ID,
    organizationId: ORGANIZATION_ID,
    sessionId: SESSION_ID,
    taskId: TASK_ID,
    executionId: EXECUTION_ID,
    attemptId: ATTEMPT_ID,
    operationRunId: OPERATION_RUN_ID,
    capabilityKey: 'supply.submitPurchaseOrder',
    argumentsHash: 'a'.repeat(64),
    resourceSnapshot: [{ kind: 'purchase_order', id: 'po-1', version: '4' }],
    state: 'pending',
    decisionIdempotencyKey: null,
    expiresAt: new Date('2026-08-14T00:10:00.000Z'),
    requestedByUserId: 'user-1',
    runtimeType: 'hermes_http',
    externalRunId: 'external-1',
    encryptedHandleRef: 'vault://handle-1',
    runtimeGeneration: 7,
    ...overrides,
  };
}

function harness(overrides: { storedApproval?: Record<string, unknown>; current?: boolean } = {}) {
  const controls = {
    isExecutionCapabilityAllowed: vi.fn().mockResolvedValue(true),
    requestApproval: vi.fn().mockResolvedValue({ id: APPROVAL_ID, state: 'pending', decisionIdempotencyKey: null }),
    loadApproval: vi.fn().mockResolvedValue(approval(overrides.storedApproval)),
    decideApproval: vi.fn().mockResolvedValue({ id: APPROVAL_ID, state: 'approved', decisionIdempotencyKey: 'decision-1', changed: true }),
    expireApproval: vi.fn().mockResolvedValue({ id: APPROVAL_ID, state: 'expired', decisionIdempotencyKey: null, changed: true }),
  };
  const runtimeControl = {
    persist: vi.fn().mockResolvedValue({
      event: { id: 'event-1', sequence: 9n },
      pointer: { organizationId: ORGANIZATION_ID, sessionId: SESSION_ID, eventId: 'event-1', sequence: 9n },
    }),
  };
  const resources = { areCurrent: vi.fn().mockResolvedValue(overrides.current ?? true) };
  const runtime = { interrupt: vi.fn().mockResolvedValue(undefined) };
  const runtimes = { requireCompatible: vi.fn().mockReturnValue(runtime) };
  const operations = { resume: vi.fn().mockResolvedValue({ id: OPERATION_RUN_ID, status: 'queued' }), cancel: vi.fn() };
  const service = new AgentSessionApprovalService(
    controls as never,
    runtimeControl as never,
    resources as never,
    runtimes as never,
    operations as never,
    () => new Date('2026-08-14T00:00:00.000Z'),
  );
  return { service, controls, runtimeControl, resources, runtime, runtimes, operations };
}

describe('AgentSessionApprovalService', () => {
  it('persists the exact approval context and canonical interrupt before publication', async () => {
    const { service, controls, runtimeControl } = harness();

    await expect(service.request({
      organizationId: ORGANIZATION_ID,
      session,
      task,
      execution,
      attempt,
      capabilityKey: 'supply.submitPurchaseOrder',
      arguments: { purchaseOrderId: 'po-1' },
      summary: '발주서를 제출합니다.',
      resourceVersions: [{ kind: 'purchase_order', id: 'po-1', version: '4' }],
      expiresAt: '2026-08-14T00:10:00.000Z',
      idempotencyKey: 'approval:po-1',
    })).resolves.toMatchObject({ approvalId: APPROVAL_ID });

    expect(controls.requestApproval).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      sessionId: SESSION_ID,
      taskId: TASK_ID,
      executionId: EXECUTION_ID,
      attemptId: ATTEMPT_ID,
      capabilityKey: 'supply.submitPurchaseOrder',
      idempotencyKey: 'approval:po-1',
    }));
    expect(runtimeControl.persist).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      sessionId: SESSION_ID,
      executionId: EXECUTION_ID,
      eventType: 'state_snapshot',
    }));
    expect(runtimeControl.persist).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'hitl_request',
      payload: expect.objectContaining({
        requestId: APPROVAL_ID,
        approval: expect.objectContaining({
          approvalId: APPROVAL_ID,
          session,
          task,
          execution,
        }),
      }),
    }));
  });

  it('rejects a runtime approval request outside the immutable execution capability set', async () => {
    const { service, controls, runtimeControl } = harness();
    controls.isExecutionCapabilityAllowed.mockResolvedValue(false);

    await expect(service.request({
      organizationId: ORGANIZATION_ID,
      session,
      task,
      execution,
      attempt,
      capabilityKey: 'supply.submitPurchaseOrder',
      arguments: { purchaseOrderId: 'po-1' },
      summary: '발주서를 제출합니다.',
      resourceVersions: [],
      expiresAt: '2026-08-14T00:10:00.000Z',
      idempotencyKey: 'approval:forbidden',
    })).rejects.toMatchObject({ code: 'APPROVAL_CAPABILITY_FORBIDDEN' });
    expect(controls.requestApproval).not.toHaveBeenCalled();
    expect(runtimeControl.persist).not.toHaveBeenCalled();
  });

  it.each([
    ['changed arguments', { argumentsHash: 'b'.repeat(64) }, {}],
    ['expired approval', {}, { storedApproval: { expiresAt: new Date('2026-08-13T23:59:59.000Z') } }],
    ['changed resource version', {}, { current: false }],
    ['stale actor', {}, { storedApproval: { requestedByUserId: 'user-2' } }],
  ])('rejects %s without resuming the runtime', async (_label, decision, options) => {
    const { service, controls, runtime, operations } = harness(options);
    await expect(service.decide({
      organizationId: ORGANIZATION_ID,
      session,
      approvalId: APPROVAL_ID,
      actorId: 'user-1',
      decision: 'approved',
      argumentsHash: 'a'.repeat(64),
      idempotencyKey: 'decision-1',
      ...decision,
    })).rejects.toMatchObject({ code: expect.any(String) });
    expect(controls.decideApproval).not.toHaveBeenCalled();
    expect(runtime.interrupt).not.toHaveBeenCalled();
    expect(operations.resume).not.toHaveBeenCalled();
  });

  it('resumes one exact approved handle and never resumes a rejected approval', async () => {
    const accepted = harness();
    await accepted.service.decide({
      organizationId: ORGANIZATION_ID, session, approvalId: APPROVAL_ID, actorId: 'user-1',
      decision: 'approved', argumentsHash: 'a'.repeat(64), idempotencyKey: 'decision-1',
    });
    expect(accepted.runtime.interrupt).toHaveBeenCalledWith(expect.objectContaining({
      runtimeType: 'hermes_http', executionId: EXECUTION_ID, attemptId: ATTEMPT_ID,
      generation: 7,
    }), { interruptId: APPROVAL_ID, payload: { decision: 'approved' } });
    expect(accepted.operations.resume).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID, runId: OPERATION_RUN_ID, requestedByUserId: 'user-1',
    }));

    const rejected = harness();
    rejected.controls.decideApproval.mockResolvedValue({ id: APPROVAL_ID, state: 'rejected', decisionIdempotencyKey: 'decision-2', changed: true });
    await rejected.service.decide({
      organizationId: ORGANIZATION_ID, session, approvalId: APPROVAL_ID, actorId: 'user-1',
      decision: 'rejected', argumentsHash: 'a'.repeat(64), idempotencyKey: 'decision-2',
    });
    expect(rejected.runtime.interrupt).not.toHaveBeenCalled();
    expect(rejected.operations.resume).not.toHaveBeenCalled();
    expect(rejected.operations.cancel).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID, runId: OPERATION_RUN_ID,
    }));
  });

  it('rejects approval when the exact execution can no longer invoke that capability', async () => {
    const denied = harness();
    denied.controls.isExecutionCapabilityAllowed.mockResolvedValue(false);

    await expect(denied.service.decide({
      organizationId: ORGANIZATION_ID,
      session,
      approvalId: APPROVAL_ID,
      actorId: 'user-1',
      decision: 'approved',
      argumentsHash: 'a'.repeat(64),
      idempotencyKey: 'decision:authority-lost',
    })).rejects.toMatchObject({ code: 'APPROVAL_CONTEXT_CHANGED' });

    expect(denied.controls.decideApproval).not.toHaveBeenCalled();
    expect(denied.runtime.interrupt).not.toHaveBeenCalled();
    expect(denied.operations.resume).not.toHaveBeenCalled();
  });

  it('expires the approval and cancels the durable Operation without resuming its runtime', async () => {
    const expired = harness({ storedApproval: {
      expiresAt: new Date('2026-08-13T23:59:59.000Z'),
    } });

    await expect(expired.service.decide({
      organizationId: ORGANIZATION_ID,
      session,
      approvalId: APPROVAL_ID,
      actorId: 'user-1',
      decision: 'approved',
      argumentsHash: 'a'.repeat(64),
      idempotencyKey: 'decision:expired',
    })).rejects.toMatchObject({ code: 'APPROVAL_EXPIRED' });

    expect(expired.controls.expireApproval).toHaveBeenCalledWith(expect.objectContaining({
      approvalId: APPROVAL_ID,
      expectedState: 'pending',
    }));
    expect(expired.operations.cancel).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      runId: OPERATION_RUN_ID,
      requestedByUserId: 'user-1',
      reason: 'approval_expired',
    }));
    expect(expired.runtime.interrupt).not.toHaveBeenCalled();
    expect(expired.operations.resume).not.toHaveBeenCalled();
  });

  it('replays the exact approved side effects after a prior post-decision interruption', async () => {
    const recovered = harness({ storedApproval: {
      state: 'approved',
      decisionIdempotencyKey: 'decision-recover',
    } });
    await expect(recovered.service.decide({
      organizationId: ORGANIZATION_ID,
      session,
      approvalId: APPROVAL_ID,
      actorId: 'user-1',
      decision: 'approved',
      argumentsHash: 'a'.repeat(64),
      idempotencyKey: 'decision-recover',
    })).resolves.toEqual({ state: 'approved' });
    expect(recovered.controls.decideApproval).not.toHaveBeenCalled();
    expect(recovered.runtime.interrupt).toHaveBeenCalledWith(expect.objectContaining({
      generation: 7,
    }), expect.objectContaining({ interruptId: APPROVAL_ID }));
    expect(recovered.operations.resume).toHaveBeenCalledWith(expect.objectContaining({
      runId: OPERATION_RUN_ID,
    }));
  });
});
