import { Module } from '@nestjs/common';
import { AgentRegistryModule } from '../agent-registry/agent-registry.module';
import { WorkflowsController, WorkflowRunsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { WorkflowRunnerService } from './workflow-runner.service';

@Module({
  imports: [AgentRegistryModule],
  controllers: [WorkflowsController, WorkflowRunsController],
  providers: [WorkflowsService, WorkflowRunnerService],
})
export class WorkflowsModule {}
