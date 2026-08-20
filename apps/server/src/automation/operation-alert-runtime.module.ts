import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OperationAlertRepositoryAdapter } from './adapter/out/repository/operation-alert.repository.adapter';
import { OPERATION_ALERT_PORT } from './application/port/in/operation-alert.port';
import { OPERATION_ALERT_REPOSITORY_PORT } from './application/port/out/repository/operation-alert.repository.port';
import { OperationAlertService } from './application/service/operation-alert.service';

@Module({
  imports: [PrismaModule],
  providers: [
    OperationAlertRepositoryAdapter,
    OperationAlertService,
    {
      provide: OPERATION_ALERT_REPOSITORY_PORT,
      useExisting: OperationAlertRepositoryAdapter,
    },
    { provide: OPERATION_ALERT_PORT, useExisting: OperationAlertService },
  ],
  exports: [OPERATION_ALERT_PORT],
})
export class OperationAlertRuntimeModule {}
