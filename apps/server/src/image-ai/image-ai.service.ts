import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ImageAiService {
  constructor(private readonly prisma: PrismaService) {}

  async createEditTask(params: {
    image_url: string;
    preset: string;
    user_prompt?: string;
  }) {
    const task = await this.prisma.agentTask.create({
      data: {
        agentType: 'image_edit',
        input: {
          image_url: params.image_url,
          preset: params.preset,
          user_prompt: params.user_prompt ?? '',
        } as any,
      },
    });

    await this.prisma.$executeRawUnsafe(
      `SELECT pg_notify('new_agent_task', $1)`,
      task.id,
    );

    return { taskId: task.id };
  }
}
