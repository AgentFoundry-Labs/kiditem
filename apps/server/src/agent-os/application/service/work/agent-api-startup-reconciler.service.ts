import type { OnApplicationBootstrap } from '@nestjs/common';
import { AgentAttemptReconciler } from './agent-attempt-reconciler.service';

/** API-only startup hook; worker and MCP roots do not perform live CLI recovery. */
export class AgentApiStartupReconciler implements OnApplicationBootstrap {
  constructor(private readonly attempts: AgentAttemptReconciler) {}

  onApplicationBootstrap(): Promise<unknown> {
    return this.attempts.reconcile();
  }
}
