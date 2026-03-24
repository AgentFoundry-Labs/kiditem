import { Module } from '@nestjs/common';
import { WorkflowsController, WorkflowRunsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { WorkflowRunnerService } from './workflow-runner.service';

@Module({
  controllers: [WorkflowsController, WorkflowRunsController],
  providers: [WorkflowsService, WorkflowRunnerService],
})
export class WorkflowsModule {}
