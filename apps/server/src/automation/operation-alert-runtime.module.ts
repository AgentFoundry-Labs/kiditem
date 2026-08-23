import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OperationAlertRepositoryAdapter } from './adapter/out/repository/operation-alert.repository.adapter';
import { OPERATION_ALERT_PORT } from './application/port/in/operation-alert.port';
import { OPERATION_ALERT_REPOSITORY_PORT } from './application/port/out/repository/operation-alert.repository.port';
import { OperationAlertService } from './application/service/operation-alert.service';
import { OperationRunAlertSourceStateAdapter } from './adapter/out/operations/operation-run-alert-source-state.adapter';
import { OPERATION_ALERT_SOURCE_STATE_PORT } from './application/port/out/operations/operation-alert-source-state.port';

@Module({
  imports: [PrismaModule],
  providers: [
    OperationAlertRepositoryAdapter,
    OperationAlertService,
    OperationRunAlertSourceStateAdapter,
    {
      provide: OPERATION_ALERT_REPOSITORY_PORT,
      useExisting: OperationAlertRepositoryAdapter,
    },
    { provide: OPERATION_ALERT_PORT, useExisting: OperationAlertService },
    {
      provide: OPERATION_ALERT_SOURCE_STATE_PORT,
      useExisting: OperationRunAlertSourceStateAdapter,
    },
  ],
  exports: [
    OPERATION_ALERT_PORT,
    OPERATION_ALERT_REPOSITORY_PORT,
    OperationAlertService,
  ],
})
export class OperationAlertRuntimeModule {}
