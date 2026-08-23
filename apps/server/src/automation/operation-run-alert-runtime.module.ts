import { Module } from '@nestjs/common';
import { OperationsModule } from '../operations/operations.module';
import { OperationRunAlertRecoveryService } from './application/service/operation-run-alert-recovery.service';
import { OperationAlertRuntimeModule } from './operation-alert-runtime.module';

/** API-only reconciliation of durable OperationRun state into owner alerts. */
@Module({
  imports: [OperationAlertRuntimeModule, OperationsModule],
  providers: [
    OperationRunAlertRecoveryService,
  ],
  exports: [OperationAlertRuntimeModule],
})
export class OperationRunAlertRuntimeModule {}
