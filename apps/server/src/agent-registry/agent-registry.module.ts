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
// Agent OS modules
import { SafetyModule } from './safety/safety.module';
import { LifecycleModule } from './lifecycle/lifecycle.module';
import { DelegationModule } from './delegation/delegation.module';
import { SkillFilterService } from './safety/skill-filter.service';
import { RetryService } from './lifecycle/retry.service';
import { TranscriptService } from './lifecycle/transcript.service';
import { DelegationService } from './delegation/delegation.service';
import { BusinessSafetyModule } from './business-safety/business-safety.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    SafetyModule,
    LifecycleModule,
    DelegationModule,
    BusinessSafetyModule,
  ],
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
  exports: [AgentRegistryService, HeartbeatService],
})
export class AgentRegistryModule {}
