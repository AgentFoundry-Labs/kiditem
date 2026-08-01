import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OperationsController } from './adapter/in/http/operations.controller';
import { OperationSchedulesController } from './adapter/in/http/operation-schedules.controller';
import { BrowserOperationRuntimeController } from './adapter/in/http/browser-operation-runtime.controller';
import { OperationRepositoryAdapter } from './adapter/out/repository/operation.repository.adapter';
import { OPERATION_HANDLER_REGISTRY_PORT } from './application/port/in/operation-handler-registry.port';
import { OPERATION_RUNNER_PORT } from './application/port/in/operation-runner.port';
import { OPERATION_REPOSITORY_PORT } from './application/port/out/repository/operation.repository.port';
import { OperationHandlerRegistryService } from './application/service/operation-handler-registry.service';
import { BrowserOperationRuntimeService } from './application/service/browser-operation-runtime.service';
import { OperationDispatcherService } from './application/service/operation-dispatcher.service';
import { OperationRunService } from './application/service/operation-run.service';
import { OperationRunWorkerService } from './application/service/operation-run-worker.service';
import { OperationSchedulerService } from './application/service/operation-scheduler.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    OperationsController,
    OperationSchedulesController,
    BrowserOperationRuntimeController,
  ],
  providers: [
    OperationHandlerRegistryService,
    OperationRepositoryAdapter,
    OperationRunService,
    BrowserOperationRuntimeService,
    OperationDispatcherService,
    OperationRunWorkerService,
    OperationSchedulerService,
    {
      provide: OPERATION_HANDLER_REGISTRY_PORT,
      useExisting: OperationHandlerRegistryService,
    },
    { provide: OPERATION_REPOSITORY_PORT, useExisting: OperationRepositoryAdapter },
    { provide: OPERATION_RUNNER_PORT, useExisting: OperationRunService },
  ],
  exports: [
    OPERATION_HANDLER_REGISTRY_PORT,
    OPERATION_RUNNER_PORT,
    OperationHandlerRegistryService,
    OperationRunService,
    OperationSchedulerService,
  ],
})
export class OperationsModule {}
