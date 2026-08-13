import { Inject, Injectable, Optional, type OnModuleInit } from '@nestjs/common';
import {
  AGENT_OS_REPOSITORY_PORT,
  type AgentOsRepositoryPort,
} from '../port/out/repository/agent-os-repository.port';

@Injectable()
export class AgentInlineRunReconciler implements OnModuleInit {
  constructor(
    @Inject(AGENT_OS_REPOSITORY_PORT)
    private readonly repository: AgentOsRepositoryPort,
    @Optional()
    private readonly env: Readonly<NodeJS.ProcessEnv> = process.env,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.env.KIDITEM_AGENT_OS_MCP_CHILD === '1') return;
    const createdBefore = new Date();
    for (let batch = 0; batch < 10; batch += 1) {
      const interrupted = await this.repository.failInterruptedInlineRuns({
        source: 'sourcing_dashboard',
        requestStatuses: ['pending', 'claimed', 'requires_approval'],
        createdBefore,
        errorCode: 'process_interrupted',
        errorMessage: 'Inline Agent OS process was interrupted before completion.',
        limit: 100,
      });
      if (interrupted.length < 100) break;
    }
  }
}
