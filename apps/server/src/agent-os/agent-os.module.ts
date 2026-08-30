import { Module } from '@nestjs/common';
import { AgentOsInvocationModule } from './agent-os-invocation.module';

/** Controller-free AgentOS facade for focused internal composition modules. */
@Module({
  imports: [
    AgentOsInvocationModule,
  ],
  exports: [
    AgentOsInvocationModule,
  ],
})
export class AgentOsModule {}
