import { Module } from '@nestjs/common';
import { OperationsWorkerModule } from '../operations/operations.module';

@Module({
  imports: [OperationsWorkerModule],
  exports: [OperationsWorkerModule],
})
export class AgentOsWorkerModule {}
