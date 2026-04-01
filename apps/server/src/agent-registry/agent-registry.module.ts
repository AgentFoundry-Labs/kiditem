import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AgentRegistryController } from './agent-registry.controller';
import { AgentRegistryService } from './agent-registry.service';
import { HeartbeatService } from './heartbeat/heartbeat.service';
import { WakeupService } from './wakeup/wakeup.service';
import { SkillsService } from './skills/skills.service';
import { AgentSseService } from './events/agent-sse.service';
import { AdStrategyController } from './domains/ad-strategy/ad-strategy.controller';
import { AdStrategyService } from './domains/ad-strategy/ad-strategy.service';
import { ManagerController } from './domains/manager/manager.controller';
import { ManagerService } from './domains/manager/manager.service';
import { ManagerWorkflowService } from './domains/manager/manager-workflow.service';

@Module({
  imports: [ScheduleModule.forRoot(), EventEmitterModule.forRoot()],
  controllers: [AgentRegistryController, AdStrategyController, ManagerController],
  providers: [
    AgentRegistryService,
    HeartbeatService,
    WakeupService,
    SkillsService,
    AgentSseService,
    AdStrategyService,
    ManagerService,
    ManagerWorkflowService,
  ],
  exports: [AgentRegistryService],
})
export class AgentRegistryModule {}
