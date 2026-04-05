import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { AgentTasksController } from './agent-tasks.controller';
import { AgentTasksService } from './agent-tasks.service';

@Module({
  controllers: [CompaniesController, AgentTasksController],
  providers: [CompaniesService, AgentTasksService],
})
export class CompaniesModule {}
