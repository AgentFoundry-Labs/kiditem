import { Module } from '@nestjs/common';
import { ActionTaskController } from './action-task.controller';
import { ActionTaskService } from './action-task.service';

@Module({
  controllers: [ActionTaskController],
  providers: [ActionTaskService],
})
export class ActionTaskModule {}
