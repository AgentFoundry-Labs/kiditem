import { Controller, Get, Sse, Query, Headers, MessageEvent } from '@nestjs/common';
import { Observable, from, concat } from 'rxjs';
import { map } from 'rxjs/operators';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentCompany } from '../auth/decorators/current-company.decorator';
import { PanelSseService } from './events/panel-sse.service';
import { PanelService } from './panel.service';
import type { PanelEvent, PanelItem } from '@kiditem/shared/panel';

@Controller('panel')
export class PanelController {
  constructor(
    private readonly sseService: PanelSseService,
    private readonly panelService: PanelService,
  ) {}

  /**
   * SSE stream.
   * - Last-Event-ID 있으면 ring buffer replay 후 live
   * - Buffer miss(또는 Last-Event-ID 없음): snapshot 먼저 전송 (resetClient=true) 후 live
   *
   * CRITICAL #9: 서버 재시작 시 seqCounter=0 → snapshot 필수 선행.
   */
  @Sse('stream')
  async stream(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthUser,
    @Headers('last-event-id') lastEventId?: string,
  ): Promise<Observable<MessageEvent>> {
    const afterSeq = lastEventId ? parseInt(lastEventId, 10) : 0;
    const replayed = this.sseService.replayAfter(companyId, afterSeq);

    let initial$: Observable<MessageEvent>;

    if (replayed.length > 0) {
      initial$ = from(replayed).pipe(
        map((event) => ({ data: event, id: String(event.seq) })),
      );
    } else {
      const items = await this.panelService.snapshot(companyId, user.id);
      const seq = this.sseService.currentSeq;
      const now = new Date().toISOString();
      const snapshotEvent: PanelEvent = {
        type: 'snapshot',
        seq,
        items: items.map((item) => ({
          ...item,
          seq,
          updatedAt: now,
        } as PanelItem)),
        resetClient: true,
      };
      initial$ = from([{ data: snapshotEvent, id: String(seq) } as MessageEvent]);
    }

    const live$ = this.sseService.getStream(companyId);
    return concat(initial$, live$);
  }

  @Get('backfill')
  async backfill(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthUser,
    @Query('afterSeq') afterSeqStr?: string,
  ) {
    const afterSeq = afterSeqStr ? parseInt(afterSeqStr, 10) : 0;
    return this.panelService.backfill(companyId, afterSeq, user.id);
  }

  @Get('snapshot')
  async snapshot(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.panelService.snapshot(companyId, user.id);
  }
}
