import { Module } from '@nestjs/common';
import { PanelController } from './panel.controller';
import { PanelService } from './panel.service';
import { PanelSseService } from './events/panel-sse.service';

@Module({
  // ⚠ EventEmitterModule.forRoot()는 AppModule에서만 (CRITICAL #7 — duplicate emitter 방지)
  controllers: [PanelController],
  providers: [PanelService, PanelSseService],
  exports: [PanelSseService], // 다른 도메인이 emit용으로 주입 가능 (PR2 대비)
})
export class PanelModule {}
