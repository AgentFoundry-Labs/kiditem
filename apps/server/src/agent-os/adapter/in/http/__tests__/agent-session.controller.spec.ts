import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../../../../auth/auth.types';
import { AgentSessionController } from '../agent-session.controller';
import {
  CancelAgentSessionTaskDto,
  DecideAgentSessionApprovalDto,
  TaskControlDto,
} from '../dto/agent-session.dto';
import {
  AgentSessionIdSchema,
  AgentSessionTaskIdSchema,
  formatAgentSessionName,
  formatAgentSessionTaskName,
  OrganizationIdSchema,
} from '@kiditem/shared/identifiers';

const user: AuthUser = {
  id: 'user-1', organizationId: 'attacker-org', membershipId: 'membership-1',
  role: 'owner', type: 'human', email: 'operator@test.local',
};
const SESSION_ID = '00000000-0000-4000-8000-000000000001';
const TASK_ID = '00000000-0000-4000-8000-000000000002';
const APPROVAL_ID = '00000000-0000-4000-8000-000000000005';
const session = formatAgentSessionName(
  OrganizationIdSchema.parse('organization-1'),
  AgentSessionIdSchema.parse(SESSION_ID),
);
const task = formatAgentSessionTaskName(
  OrganizationIdSchema.parse('organization-1'),
  AgentSessionIdSchema.parse(SESSION_ID),
  AgentSessionTaskIdSchema.parse(TASK_ID),
);

describe('AgentSessionController', () => {
  it('derives organization and actor from auth for inspection and explicit controls', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true });
    const approval = await pipe.transform({
      decision: 'approved', idempotencyKey: 'decision-1', organizationId: 'attacker-org', actorId: 'attacker',
    }, { type: 'body', metatype: DecideAgentSessionApprovalDto });
    const control = await pipe.transform({
      idempotencyKey: 'retry-1', expectedStatus: 'failed', organizationId: 'attacker-org',
    }, { type: 'body', metatype: TaskControlDto });
    const cancel = await pipe.transform({
      idempotencyKey: 'cancel-1', expectedStatus: 'running', reason: 'operator_cancelled', organizationId: 'attacker-org',
    }, { type: 'body', metatype: CancelAgentSessionTaskDto });
    const runtime = {
      inspect: vi.fn().mockResolvedValue({ task: 'task' }),
      retry: vi.fn().mockResolvedValue({ execution: 'execution' }),
      resume: vi.fn().mockResolvedValue({ execution: 'execution' }),
    };
    const approvals = { decide: vi.fn().mockResolvedValue({ state: 'approved' }) };
    const cancellations = { cancel: vi.fn().mockResolvedValue({ status: 'cancelled' }) };
    const controller = new AgentSessionController(
      runtime as never,
      approvals as never,
      cancellations as never,
    );

    await controller.inspect('organization-1', user, SESSION_ID, TASK_ID);
    await controller.decideApproval('organization-1', user, SESSION_ID, APPROVAL_ID, approval);
    await controller.retry('organization-1', user, SESSION_ID, TASK_ID, control);
    await controller.cancel('organization-1', user, SESSION_ID, TASK_ID, cancel);

    expect(runtime.inspect).toHaveBeenCalledWith({
      organizationId: 'organization-1', actorId: 'user-1', session, task,
    });
    expect(approvals.decide).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'organization-1', actorId: 'user-1', session,
      approvalId: APPROVAL_ID, decision: 'approved', idempotencyKey: 'decision-1',
    }));
    expect(runtime.retry).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'organization-1', actorId: 'user-1', session, task,
      idempotencyKey: 'retry-1', expectedStatus: 'failed',
    }));
    expect(cancellations.cancel).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'organization-1', actorId: 'user-1', session, task,
      idempotencyKey: 'cancel-1', expectedStatus: 'running', reason: 'operator_cancelled',
    }));
    expect(approval).toEqual({ decision: 'approved', idempotencyKey: 'decision-1' });
    expect(control).toEqual({ idempotencyKey: 'retry-1', expectedStatus: 'failed' });
    expect(cancel).toEqual({
      idempotencyKey: 'cancel-1', expectedStatus: 'running', reason: 'operator_cancelled',
    });
  });
});
