import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AgentRegistryController } from './agent-registry.controller';
import { AgentRegistryService } from './agent-registry.service';
import { HeartbeatService } from './heartbeat/heartbeat.service';
import { WakeupService } from './wakeup/wakeup.service';
import { SkillsService } from './skills/skills.service';
import { AdStrategyController } from './domains/ad-strategy/ad-strategy.controller';
import { AdStrategyService } from './domains/ad-strategy/ad-strategy.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [AgentRegistryController, AdStrategyController],
  providers: [
    AgentRegistryService,
    HeartbeatService,
    WakeupService,
    SkillsService,
    AdStrategyService,
  ],
  exports: [AgentRegistryService],
})
export class AgentRegistryModule {}
