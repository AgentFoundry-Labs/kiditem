import { Module } from '@nestjs/common';
import { AgentRuntimeApplicationModule } from './agent-runtime-application.module';

@Module({
  imports: [AgentRuntimeApplicationModule],
})
export class AgentMcpApplicationModule {}
