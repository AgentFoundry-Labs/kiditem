import { Module } from '@nestjs/common';
import { AgentOsWorkerModule } from './agent-os/agent-os-worker.module';
import { AgentRuntimeApplicationModule } from './agent-runtime-application.module';

@Module({ imports: [AgentRuntimeApplicationModule, AgentOsWorkerModule] })
export class AgentWorkerApplicationModule {}
