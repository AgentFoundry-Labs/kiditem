import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReadinessService } from './readiness.service';
import { AgentAttemptReadinessService } from '../agent-os/adapter/out/runtime/attempt/agent-attempt-readiness.service';

@Module({
  imports: [PrismaModule],
  providers: [ReadinessService, AgentAttemptReadinessService],
  exports: [ReadinessService, AgentAttemptReadinessService],
})
export class ReadinessStateModule {}
