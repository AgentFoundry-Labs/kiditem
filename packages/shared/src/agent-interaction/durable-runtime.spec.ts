import { describe, expect, it } from 'vitest';
import {
  AgentApprovalCardSchema,
  AgentApprovalDecisionSchema,
  AgentArtifactCardSchema,
  AgentDelegationEventSchema,
  AgentProgressEventSchema,
  CancelAgentTaskSchema,
  ResumeAgentTaskSchema,
  RetryAgentTaskSchema,
} from './durable-runtime';

const SESSION_ID = '1d3ca687-ea5d-4199-a26c-df90ba387918';
const TASK_ID = 'a49bc6cb-9b0d-4767-846f-e96eb91a14cf';
const EXECUTION_ID = '7b24602d-f206-4dd5-9a11-f5b792ce4363';
const APPROVAL_ID = '87c00f28-a6a5-4e3a-aef0-f6798d3a3aac';
const NOW = '2026-08-14T00:00:00.000Z';

describe('durable AgentOS interaction contracts', () => {
  it('accepts bounded correlated progress and all durable states', () => {
    for (const status of [
      'queued',
      'running',
      'waiting_dependency',
      'waiting_approval',
      'paused',
      'completed',
      'failed',
      'cancelled',
    ] as const) {
      expect(
        AgentProgressEventSchema.parse({
          name: 'kiditem.ui.agent_progress.v1',
          sessionId: SESSION_ID,
          taskId: TASK_ID,
          executionId: EXECUTION_ID,
          status,
          progress: 0.4,
          label: '상품 근거 확인 중',
          updatedAt: NOW,
        }).status,
      ).toBe(status);
    }
  });

  it('rejects browser authority and arbitrary approval endpoints', () => {
    expect(() =>
      AgentApprovalCardSchema.parse({
        name: 'kiditem.ui.agent_approval.v1',
        approvalId: APPROVAL_ID,
        sessionId: SESSION_ID,
        taskId: TASK_ID,
        executionId: EXECUTION_ID,
        capabilityKey: 'supply.submit',
        summary: '발주 제출',
        resourceVersions: [],
        expiresAt: NOW,
        arbitraryEndpoint: '/api/private',
      }),
    ).toThrow();

    expect(() =>
      AgentApprovalDecisionSchema.parse({
        approvalId: APPROVAL_ID,
        sessionId: SESSION_ID,
        taskId: TASK_ID,
        executionId: EXECUTION_ID,
        decision: 'approved',
        idempotencyKey: 'approval:1',
        organizationId: 'forged',
      }),
    ).toThrow();
  });

  it('uses registered navigation action ids for artifacts, never urls', () => {
    expect(
      AgentArtifactCardSchema.parse({
        name: 'kiditem.ui.agent_artifact.v1',
        artifactId: 'df3edfa6-ce18-429b-9ef3-7e6c7fb7f709',
        sessionId: SESSION_ID,
        taskId: TASK_ID,
        executionId: EXECUTION_ID,
        artifactType: 'report',
        label: '소싱 보고서',
        sha256: 'a'.repeat(64),
        navigationActionId: '11111111-1111-4111-8111-111111111111',
        createdAt: NOW,
      }).navigationActionId,
    ).toBe('11111111-1111-4111-8111-111111111111');
    expect(() =>
      AgentArtifactCardSchema.parse({
        name: 'kiditem.ui.agent_artifact.v1',
        artifactId: 'df3edfa6-ce18-429b-9ef3-7e6c7fb7f709',
        sessionId: SESSION_ID,
        taskId: TASK_ID,
        executionId: EXECUTION_ID,
        artifactType: 'report',
        label: '소싱 보고서',
        sha256: 'a'.repeat(64),
        navigationActionId: '11111111-1111-4111-8111-111111111111',
        url: 'https://attacker.invalid',
        createdAt: NOW,
      }),
    ).toThrow();
  });

  it('requires stable correlation and idempotency for retry, resume, cancel, and delegation', () => {
    const base = {
      sessionId: SESSION_ID,
      taskId: TASK_ID,
      idempotencyKey: 'operator-action:1',
    };
    expect(RetryAgentTaskSchema.parse({ ...base, expectedStatus: 'failed' })).toEqual({
      ...base,
      expectedStatus: 'failed',
    });
    expect(ResumeAgentTaskSchema.parse({ ...base, expectedStatus: 'paused' })).toEqual({
      ...base,
      expectedStatus: 'paused',
    });
    expect(CancelAgentTaskSchema.parse({ ...base, expectedStatus: 'running' })).toEqual({
      ...base,
      expectedStatus: 'running',
    });
    expect(
      AgentDelegationEventSchema.parse({
        name: 'kiditem.ui.agent_delegation.v1',
        sessionId: SESSION_ID,
        parentTaskId: TASK_ID,
        childTaskId: '5c8a67e4-c3d4-402c-b60d-d196310dd802',
        fromAgentVersion: {
          id: 'f7735e6a-4f45-44f5-bf2a-c954ea3d3db8',
          agentDefinitionKey: 'operator',
          version: 1,
        },
        toAgentVersion: {
          id: 'e4dced8a-2978-4fc0-81cf-69a5ac638d73',
          agentDefinitionKey: 'sourcing',
          version: 2,
        },
        status: 'created',
        createdAt: NOW,
      }).toAgentVersion.version,
    ).toBe(2);
  });
});
