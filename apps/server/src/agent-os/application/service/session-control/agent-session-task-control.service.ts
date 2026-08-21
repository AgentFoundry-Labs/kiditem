import { Injectable } from '@nestjs/common';
import type { AgentSessionTaskControlPort } from '../../port/in/session-control/agent-session-task-control.port';
import { AgentSessionCancellationService } from './agent-session-cancellation.service';
import { AgentSessionExecutionService } from './agent-session-execution.service';

/** Composes execution and cancellation into the single HTTP task-control use case. */
@Injectable()
export class AgentSessionTaskControlService implements AgentSessionTaskControlPort {
  constructor(
    private readonly execution: AgentSessionExecutionService,
    private readonly cancellation: AgentSessionCancellationService,
  ) {}

  inspect(input: Parameters<AgentSessionExecutionService['inspect']>[0]) {
    return this.execution.inspect(input);
  }

  retry(input: Parameters<AgentSessionExecutionService['retry']>[0]) {
    return this.execution.retry(input);
  }

  resume(input: Parameters<AgentSessionExecutionService['resume']>[0]) {
    return this.execution.resume(input);
  }

  cancel(input: Parameters<AgentSessionCancellationService['cancel']>[0]) {
    return this.cancellation.cancel(input);
  }
}
