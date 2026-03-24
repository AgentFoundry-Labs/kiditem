import { Module } from '@nestjs/common';
import { AgentTasksController } from './agent-tasks.controller';
import { AgentTasksService } from './agent-tasks.service';

@Module({
  controllers: [AgentTasksController],
  providers: [AgentTasksService],
})
export class AgentTasksModule {}
