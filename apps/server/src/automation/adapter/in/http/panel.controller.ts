import { Controller, Get, Sse, Query, Headers, MessageEvent } from '@nestjs/common';
import { Observable, from, concat } from 'rxjs';
import { map } from 'rxjs/operators';
import type { AuthUser } from '../../../../auth/auth.types';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { PanelSseService } from '../../out/panel-event/panel-sse.service';
import { PanelService } from '../../out/panel-event/panel.service';
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
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Headers('last-event-id') lastEventId?: string,
  ): Promise<Observable<MessageEvent>> {
    const afterSeq = lastEventId ? parseInt(lastEventId, 10) : 0;
    const replayed = this.sseService.replayAfter(organizationId, afterSeq);

    let initial$: Observable<MessageEvent>;

    if (replayed.length > 0) {
      initial$ = from(replayed).pipe(
        map((event) => ({ data: event, id: String(event.seq) })),
      );
    } else {
      const items = await this.panelService.snapshot(organizationId, user.id);
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

    const live$ = this.sseService.getStream(organizationId);
    return concat(initial$, live$);
  }

  @Get('backfill')
  async backfill(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Query('afterSeq') afterSeqStr?: string,
  ) {
    const afterSeq = afterSeqStr ? parseInt(afterSeqStr, 10) : 0;
    return this.panelService.backfill(organizationId, afterSeq, user.id);
  }

  @Get('snapshot')
  async snapshot(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.panelService.snapshot(organizationId, user.id);
  }
}
