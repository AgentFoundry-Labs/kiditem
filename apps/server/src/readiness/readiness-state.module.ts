import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AgentRuntimeApplicationModule } from '../agent-runtime-application.module';
import { ReadinessService } from './readiness.service';

@Module({
  imports: [PrismaModule, AgentRuntimeApplicationModule],
  providers: [ReadinessService],
  exports: [ReadinessService],
})
export class ReadinessStateModule {}
