import { Injectable, MessageEvent, OnModuleDestroy } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Subject, Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import type { PanelEvent, PanelItem } from '@kiditem/shared';
import {
  PANEL_EVENTS,
  PanelUpsertInternal,
  PanelDismissInternal,
} from './panel-events';

const RING_BUFFER_SIZE = 100;

interface BufferedEvent {
  event: PanelEvent;
  companyId: string;
}

@Injectable()
export class PanelSseService implements OnModuleDestroy {
  private readonly subject = new Subject<BufferedEvent>();
  private seqCounter = 0;
  private readonly ringBuffer = new Map<string, BufferedEvent[]>();

  @OnEvent(PANEL_EVENTS.UPSERT)
  handleUpsert(payload: PanelUpsertInternal) {
    const seq = ++this.seqCounter;
    const timestamp = new Date().toISOString();
    // companyId는 payload에 있는 internal routing 용도 — item에는 포함 안 됨 (wire schema는 companyId 없음)
    const event: PanelEvent = {
      type: 'upsert',
      seq,
      item: { ...payload.item, seq, updatedAt: timestamp } as PanelItem,
    };
    this.push(payload.companyId, event);
  }

  @OnEvent(PANEL_EVENTS.DISMISS)
  handleDismiss(payload: PanelDismissInternal) {
    const seq = ++this.seqCounter;
    const event: PanelEvent = {
      type: 'dismiss',
      seq,
      itemId: payload.itemId,
    };
    this.push(payload.companyId, event);
  }

  private push(companyId: string, event: PanelEvent) {
    const buffered: BufferedEvent = { event, companyId };
    this.subject.next(buffered);
    const arr = this.ringBuffer.get(companyId) ?? [];
    arr.push(buffered);
    if (arr.length > RING_BUFFER_SIZE) arr.shift();
    this.ringBuffer.set(companyId, arr);
  }

  /**
   * 구독자의 companyId와 일치하는 이벤트만 통과.
   * MessageEvent는 @nestjs/common (NOT DOM MessageEvent).
   * 현재 seqCounter를 getter로 노출 (controller가 snapshot resetClient 판단 시 사용).
   */
  getStream(subscriberCompanyId: string): Observable<MessageEvent> {
    return this.subject.asObservable().pipe(
      filter((b) => b.companyId === subscriberCompanyId),
      map((b) => ({ data: b.event, id: String(b.event.seq) })),
    );
  }

  replayAfter(companyId: string, afterSeq: number): PanelEvent[] {
    const arr = this.ringBuffer.get(companyId) ?? [];
    return arr.filter((b) => b.event.seq > afterSeq).map((b) => b.event) satisfies PanelEvent[];
  }

  onModuleDestroy() {
    this.subject.complete();
  }

  get currentSeq(): number {
    return this.seqCounter;
  }
}
