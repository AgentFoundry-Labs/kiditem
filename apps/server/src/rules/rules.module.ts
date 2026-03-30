import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';
import { RulesSchedulerService } from './rules-scheduler.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [RulesController],
  providers: [RulesService, RulesSchedulerService],
})
export class RulesModule {}
