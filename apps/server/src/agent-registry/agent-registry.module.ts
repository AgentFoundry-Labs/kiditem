import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
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
// Agent OS modules
import { SafetyModule } from './safety/safety.module';
import { LifecycleModule } from './lifecycle/lifecycle.module';
import { DelegationModule } from './delegation/delegation.module';
import { SkillFilterService } from './safety/skill-filter.service';
import { RetryService } from './lifecycle/retry.service';
import { TranscriptService } from './lifecycle/transcript.service';
import { DelegationService } from './delegation/delegation.service';
import { BusinessSafetyModule } from './business-safety/business-safety.module';
import { ContextManagerModule } from './context-manager/context-manager.module';
import { AgentTraceModule } from './trace/agent-trace.module';
import { AgentCostAnalyticsService } from '../automation/application/service/agent-cost-analytics.service';
import { AgentCrudService } from '../automation/application/service/agent-crud.service';
import { AgentLifecycleService } from '../automation/application/service/agent-lifecycle.service';
import { AgentRunService } from '../automation/application/service/agent-run.service';

@Global()
@Module({
  imports: [
    ScheduleModule.forRoot(),
    // EventEmitterModule is NOT imported here — AppModule is the single forRoot() site.
    // Injecting EventEmitter2 directly works via the global bus registered in AppModule.
    SafetyModule,
    LifecycleModule,
    DelegationModule,
    BusinessSafetyModule,
    ContextManagerModule,
    AgentTraceModule,
  ],
  controllers: [AgentRegistryController, AdStrategyController, ManagerController],
  providers: [
    AgentRegistryService,
    AgentCrudService,
    AgentRunService,
    AgentLifecycleService,
    AgentCostAnalyticsService,
    HeartbeatService,
    WakeupService,
    SkillsService,
    AgentSseService,
    AdStrategyService,
    ManagerService,
  ],
  exports: [AgentRegistryService, HeartbeatService],
})
export class AgentRegistryModule {}
