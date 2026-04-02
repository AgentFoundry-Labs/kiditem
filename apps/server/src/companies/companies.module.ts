import { Module } from '@nestjs/common';
import { AgentRegistryModule } from '../agent-registry/agent-registry.module';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { AgentTasksController } from './agent-tasks.controller';
import { AgentTasksService } from './agent-tasks.service';

@Module({
  imports: [AgentRegistryModule],
  controllers: [CompaniesController, AgentTasksController],
  providers: [CompaniesService, AgentTasksService],
})
export class CompaniesModule {}
