import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OperationRepositoryAdapter } from './adapter/out/repository/operation.repository.adapter';
import { OperationCheckpointRepositoryAdapter } from './adapter/out/repository/operation-checkpoint.repository.adapter';
import { OPERATION_HANDLER_REGISTRY_PORT } from './application/port/in/operation-handler-registry.port';
import { OPERATION_RUNNER_PORT } from './application/port/in/operation-runner.port';
import { OPERATION_EXACT_RUN_CONTROL_PORT } from './application/port/in/operation-exact-run-control.port';
import { OPERATION_POST_ACCEPTING_HOOK_REGISTRY_PORT } from './application/port/in/operation-post-accepting-hook-registry.port';
import { OPERATION_REPOSITORY_PORT } from './application/port/out/repository/operation.repository.port';
import { OPERATION_CHECKPOINT_REPOSITORY_PORT } from './application/port/out/repository/operation-checkpoint.repository.port';
import { OperationHandlerRegistryService } from './application/service/operation-handler-registry.service';
import { OperationPostAcceptingHookRegistryService } from './application/service/operation-post-accepting-hook-registry.service';
import { BrowserOperationRuntimeService } from './application/service/browser-operation-runtime.service';
import { OperationDispatcherService } from './application/service/operation-dispatcher.service';
import { OperationAttemptExecutorService } from './application/service/operation-attempt-executor.service';
import { OperationRunService } from './application/service/operation-run.service';
import { OperationRunWorkerService } from './application/service/operation-run-worker.service';
import { OperationSchedulerService } from './application/service/operation-scheduler.service';
import { CompositeOperationCoordinatorService } from './application/service/composite-operation-coordinator.service';
import { COMPOSITE_OPERATION_COORDINATOR_PORT } from './application/port/in/composite-operation-coordinator.port';
import { OperationLifecycleGateService } from './application/service/operation-lifecycle-gate.service';
import {
  OperationAttemptVerifierService,
  operationAttemptVerifierProvider,
} from './application/service/operation-attempt-verifier.service';
import { OPERATION_ATTEMPT_VERIFIER_PORT } from './application/port/in/operation-attempt-verifier.port';
import { OperationWorkerLifecycleService } from './application/service/operation-worker-lifecycle.service';

@Module({
  imports: [PrismaModule],
  providers: [
    OperationHandlerRegistryService,
    OperationPostAcceptingHookRegistryService,
    OperationRepositoryAdapter,
    OperationCheckpointRepositoryAdapter,
    OperationRunService,
    BrowserOperationRuntimeService,
    OperationDispatcherService,
    OperationAttemptExecutorService,
    CompositeOperationCoordinatorService,
    { provide: OperationLifecycleGateService, useFactory: () => { const gate = new OperationLifecycleGateService(); gate.open(); return gate; } },
    OperationAttemptVerifierService,
    operationAttemptVerifierProvider,
    {
      provide: OPERATION_HANDLER_REGISTRY_PORT,
      useExisting: OperationHandlerRegistryService,
    },
    { provide: OPERATION_REPOSITORY_PORT, useExisting: OperationRepositoryAdapter },
    {
      provide: OPERATION_CHECKPOINT_REPOSITORY_PORT,
      useExisting: OperationCheckpointRepositoryAdapter,
    },
    { provide: OPERATION_RUNNER_PORT, useExisting: OperationRunService },
    {
      provide: OPERATION_EXACT_RUN_CONTROL_PORT,
      useExisting: OperationRunService,
    },
    {
      provide: OPERATION_POST_ACCEPTING_HOOK_REGISTRY_PORT,
      useExisting: OperationPostAcceptingHookRegistryService,
    },
    {
      provide: COMPOSITE_OPERATION_COORDINATOR_PORT,
      useExisting: CompositeOperationCoordinatorService,
    },
  ],
  exports: [
    OPERATION_HANDLER_REGISTRY_PORT,
    OPERATION_RUNNER_PORT,
    OPERATION_EXACT_RUN_CONTROL_PORT,
    OPERATION_POST_ACCEPTING_HOOK_REGISTRY_PORT,
    OPERATION_REPOSITORY_PORT,
    OPERATION_CHECKPOINT_REPOSITORY_PORT,
    COMPOSITE_OPERATION_COORDINATOR_PORT,
    OPERATION_ATTEMPT_VERIFIER_PORT,
    OperationAttemptVerifierService,
    OperationHandlerRegistryService,
    BrowserOperationRuntimeService,
    OperationRunService,
    OperationAttemptExecutorService,
    OperationLifecycleGateService,
  ],
})
export class OperationsModule {}

/** Worker-only execution lifecycle; API composes OperationsModule core only. */
@Module({
  imports: [OperationsModule],
  providers: [OperationRunWorkerService, OperationSchedulerService, OperationWorkerLifecycleService],
  exports: [OperationRunWorkerService, OperationSchedulerService],
})
export class OperationsWorkerModule {}
