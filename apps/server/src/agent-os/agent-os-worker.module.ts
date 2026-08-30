import { Module } from '@nestjs/common';
import { OperationOwnerWorkerModule } from '../operations/operation-owner-worker.module';
import { OperationsWorkerModule } from '../operations/operations.module';

@Module({
  imports: [OperationsWorkerModule, OperationOwnerWorkerModule],
  exports: [OperationsWorkerModule],
})
export class AgentOsWorkerModule {}
