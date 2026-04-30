import { Injectable } from '@nestjs/common';
import { AgentRegistryService } from '../../../../agent-registry/agent-registry.service';
import type {
  AgentRunnerInput,
  AgentRunnerPort,
  AgentRunnerResult,
} from '../../../application/port/in/agent-runner.port';

@Injectable()
export class AgentRuntimeRunnerAdapter implements AgentRunnerPort {
  constructor(private readonly agentRegistry: AgentRegistryService) {}

  runByType(type: string, input?: AgentRunnerInput): Promise<AgentRunnerResult> {
    return this.agentRegistry.runByType(type, input);
  }
}
