import { Module } from '@nestjs/common';
import { BrowserOperationRuntimeController } from './adapter/in/http/browser-operation-runtime.controller';
import { OperationSchedulesController } from './adapter/in/http/operation-schedules.controller';
import { OperationsController } from './adapter/in/http/operations.controller';
import { OperationSchedulerService } from './application/service/operation-scheduler.service';
import { OperationsModule } from './operations.module';

/** HTTP-only Operations composition. Worker and owner adapters import OperationsModule. */
@Module({
  imports: [OperationsModule],
  providers: [OperationSchedulerService],
  controllers: [
    OperationsController,
    OperationSchedulesController,
    BrowserOperationRuntimeController,
  ],
})
export class OperationsHttpModule {}
