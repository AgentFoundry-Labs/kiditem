import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import {
  AGENT_RUNTIME_ASSETS_PORT,
  type AgentRuntimeAssetsPort,
} from '../port/out/runtime/agent-runtime-assets.port';
import { listAgentDefinitions } from '../../domain/agent-definition.registry';

@Injectable()
export class AgentRuntimeAssetsStartupValidator
  implements OnApplicationBootstrap
{
  constructor(
    @Inject(AGENT_RUNTIME_ASSETS_PORT)
    private readonly assets: AgentRuntimeAssetsPort,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    for (const definition of listAgentDefinitions()) {
      if (!definition.outputSchemaPath) continue;
      await this.assets.resolve({
        agentType: definition.type,
        promptPath: definition.promptPath,
        skillKeys: definition.defaultSkillKeys,
        outputSchemaPath: definition.outputSchemaPath,
      });
    }
  }
}
