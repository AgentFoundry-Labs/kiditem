import { Module } from '@nestjs/common';
import { WorkflowsController, WorkflowRunsController } from './workflows.controller';
import { AutomationModule } from '../automation/automation.module';

@Module({
  imports: [AutomationModule],
  controllers: [WorkflowsController, WorkflowRunsController],
})
export class WorkflowsModule {}
