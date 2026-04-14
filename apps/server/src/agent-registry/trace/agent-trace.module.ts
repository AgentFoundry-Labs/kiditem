import { Module } from '@nestjs/common';
import { AgentTraceController } from './agent-trace.controller';
import { AgentTraceService } from './agent-trace.service';

/**
 * AgentTraceModule — task/trace 조회 전용 서브모듈 (non-global).
 * AgentRegistryModule 에서 import. PrismaService 는 PrismaModule (@Global) 에서 주입.
 */
@Module({
  controllers: [AgentTraceController],
  providers: [AgentTraceService],
  exports: [AgentTraceService],
})
export class AgentTraceModule {}
