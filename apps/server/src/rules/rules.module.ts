import { Module } from '@nestjs/common';
import { RulesController } from './controllers/rules.controller';
import { AlertsController } from './controllers/alerts.controller';
import { RulesService } from './services/rules.service';
import { AlertsService } from './services/alerts.service';

// Design Ref: §5 — RulesSchedulerService 삭제, heartbeat timer로 통합
// EventEmitter2 is injected globally — do NOT import EventEmitterModule.forRoot() here.

@Module({
  controllers: [RulesController, AlertsController],
  providers: [RulesService, AlertsService],
})
export class RulesModule {}
