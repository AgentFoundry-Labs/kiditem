import { Injectable } from '@nestjs/common';
import { AgentRegistryService } from '../../agent-registry/agent-registry.service';

@Injectable()
export class ImageAiService {
  constructor(private readonly agentRegistry: AgentRegistryService) {}

  async createEditTask(params: {
    image_url: string;
    preset: string;
    user_prompt?: string;
  }) {
    const result = await this.agentRegistry.runByType('image_edit', {
      extra: {
        image_url: params.image_url,
        preset: params.preset,
        user_prompt: params.user_prompt ?? '',
      },
    });

    return { taskId: result.taskId };
  }
}
