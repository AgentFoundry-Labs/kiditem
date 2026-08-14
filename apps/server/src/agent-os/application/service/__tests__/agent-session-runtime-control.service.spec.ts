import { describe, expect, it, vi } from 'vitest';
import {
  AgentExecutionIdSchema,
  AgentSessionIdSchema,
  AgentSessionTaskIdSchema,
  formatAgentExecutionName,
  formatAgentSessionName,
  formatAgentSessionTaskName,
  OrganizationIdSchema,
} from '@kiditem/shared/identifiers';
import { AgentSessionRuntimeControlService } from '../agent-session-runtime-control.service';

const ORGANIZATION_ID = 'org-1';
const SESSION_ID = '00000000-0000-4000-8000-000000000001';
const TASK_ID = '00000000-0000-4000-8000-000000000002';
const EXECUTION_ID = '00000000-0000-4000-8000-000000000003';
const ATTEMPT_ID = '00000000-0000-4000-8000-000000000004';
const organization = OrganizationIdSchema.parse(ORGANIZATION_ID);
const session = formatAgentSessionName(
  organization,
  AgentSessionIdSchema.parse(SESSION_ID),
);
const task = formatAgentSessionTaskName(
  organization,
  AgentSessionIdSchema.parse(SESSION_ID),
  AgentSessionTaskIdSchema.parse(TASK_ID),
);
const execution = formatAgentExecutionName(
  organization,
  AgentSessionIdSchema.parse(SESSION_ID),
  AgentExecutionIdSchema.parse(EXECUTION_ID),
);

describe('AgentSessionRuntimeControlService', () => {
  it('persists a validated durable progress event before publishing its pointer', async () => {
    const order: string[] = [];
    const interactions = {
      appendExecutionEvent: vi.fn(async (input) => {
        order.push('append');
        return {
          id: 'event-1',
          organizationId: ORGANIZATION_ID,
          sessionId: SESSION_ID,
          executionId: EXECUTION_ID,
          aguiRunId: null,
          externalEventId: input.externalEventId,
          sequence: 7n,
          eventType: input.eventType,
          schemaVersion: input.schemaVersion,
          payload: input.payload,
          createdAt: new Date('2026-08-14T00:00:00.000Z'),
        };
      }),
    };
    const publisher = {
      publish: vi.fn(async () => {
        order.push('publish');
      }),
    };
    const service = new AgentSessionRuntimeControlService(
      interactions as never,
      publisher as never,
      () => new Date('2026-08-14T00:00:00.000Z'),
    );

    await service.record({
      organizationId: ORGANIZATION_ID,
      session,
      task,
      execution,
      attemptId: ATTEMPT_ID,
      ordinal: 3,
      event: { kind: 'progress', progress: 0.4, label: '근거를 확인하는 중' },
    });

    expect(interactions.appendExecutionEvent).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      sessionId: SESSION_ID,
      executionId: EXECUTION_ID,
      externalEventId: `${ATTEMPT_ID}:runtime:3:progress`,
      eventType: 'state_snapshot',
      schemaVersion: 1,
      payload: {
        snapshotType: 'agent_progress',
        snapshotVersion: 1,
        data: {
          name: 'kiditem.ui.agent_progress.v1',
          session,
          task,
          execution,
          status: 'running',
          progress: 0.4,
          label: '근거를 확인하는 중',
          updatedAt: '2026-08-14T00:00:00.000Z',
        },
      },
    });
    expect(publisher.publish).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      sessionId: SESSION_ID,
      eventId: 'event-1',
      sequence: 7n,
    });
    expect(order).toEqual(['append', 'publish']);
  });

  it('does not publish an event that failed canonical persistence', async () => {
    const interactions = {
      appendExecutionEvent: vi.fn().mockRejectedValue(new Error('db unavailable')),
    };
    const publisher = { publish: vi.fn() };
    const service = new AgentSessionRuntimeControlService(
      interactions as never,
      publisher as never,
      () => new Date('2026-08-14T00:00:00.000Z'),
    );

    await expect(service.record({
      organizationId: ORGANIZATION_ID,
      session,
      task,
      execution,
      attemptId: ATTEMPT_ID,
      ordinal: 4,
      event: { kind: 'terminal', status: 'failed', errorCode: 'runtime_error' },
    })).rejects.toThrow('db unavailable');
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('uses one stable terminal identity for a runtime attempt', async () => {
    const interactions = {
      appendExecutionEvent: vi.fn(async (input) => ({
        id: 'event-terminal',
        organizationId: ORGANIZATION_ID,
        sessionId: SESSION_ID,
        executionId: EXECUTION_ID,
        aguiRunId: null,
        externalEventId: input.externalEventId,
        sequence: 8n,
        eventType: input.eventType,
        schemaVersion: input.schemaVersion,
        payload: input.payload,
        createdAt: new Date('2026-08-14T00:00:00.000Z'),
      })),
    };
    const service = new AgentSessionRuntimeControlService(
      interactions as never,
      { publish: vi.fn() } as never,
      () => new Date('2026-08-14T00:00:00.000Z'),
    );

    await service.record({
      organizationId: ORGANIZATION_ID,
      session,
      task,
      execution,
      attemptId: ATTEMPT_ID,
      ordinal: 99,
      event: { kind: 'terminal', status: 'cancelled' },
    });

    expect(interactions.appendExecutionEvent).toHaveBeenCalledWith(expect.objectContaining({
      externalEventId: `${ATTEMPT_ID}:runtime:terminal`,
    }));
  });
});
