import { Inject, Injectable } from '@nestjs/common';
import {
  AGENT_SESSION_CANCELLATION_PORT,
  type AgentSessionCancellationPort,
} from '../../../../agent-os/application/port/in/session-control/agent-session-cancellation.port';
import type { OperationCancellationAgentSessionTaskPort } from '../../../application/port/out/cross-domain/agent-session-task-cancellation.port';

@Injectable()
export class AgentSessionTaskCancellationAdapter
  implements OperationCancellationAgentSessionTaskPort
{
  constructor(
    @Inject(AGENT_SESSION_CANCELLATION_PORT)
    private readonly sessions: AgentSessionCancellationPort,
  ) {}

  async cancel(input: Parameters<OperationCancellationAgentSessionTaskPort['cancel']>[0]) {
    if (!input.actorUserId) {
      throw new Error('operation cancellation requires an authenticated actor');
    }
    return this.sessions.cancel({
      organizationId: input.organizationId,
      actorId: input.actorUserId,
      session: input.session,
      task: input.task,
      idempotencyKey: input.idempotencyKey,
      expectedStatus: input.expectedStatus,
      reason: input.reason,
    });
  }
}
