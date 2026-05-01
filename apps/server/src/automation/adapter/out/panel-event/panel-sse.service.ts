import { Injectable, MessageEvent, OnModuleDestroy } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Subject, Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import type { PanelEvent, PanelItem } from '@kiditem/shared/panel';
import {
  PANEL_EVENTS,
  PanelUpsertInternal,
  PanelDismissInternal,
} from './panel-events';

const RING_BUFFER_SIZE = 100;

interface BufferedEvent {
  event: PanelEvent;
  organizationId: string;
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
    // organizationId는 payload에 있는 internal routing 용도 — item에는 포함 안 됨 (wire schema는 organizationId 없음)
    const event: PanelEvent = {
      type: 'upsert',
      seq,
      item: { ...payload.item, seq, updatedAt: timestamp } as PanelItem,
    };
    this.push(payload.organizationId, event);
  }

  @OnEvent(PANEL_EVENTS.DISMISS)
  handleDismiss(payload: PanelDismissInternal) {
    const seq = ++this.seqCounter;
    const event: PanelEvent = {
      type: 'dismiss',
      seq,
      itemId: payload.itemId,
    };
    this.push(payload.organizationId, event);
  }

  private push(organizationId: string, event: PanelEvent) {
    const buffered: BufferedEvent = { event, organizationId };
    this.subject.next(buffered);
    const arr = this.ringBuffer.get(organizationId) ?? [];
    arr.push(buffered);
    if (arr.length > RING_BUFFER_SIZE) arr.shift();
    this.ringBuffer.set(organizationId, arr);
  }

  /**
   * 구독자의 organizationId와 일치하는 이벤트만 통과.
   * MessageEvent는 @nestjs/common (NOT DOM MessageEvent).
   * 현재 seqCounter를 getter로 노출 (controller가 snapshot resetClient 판단 시 사용).
   */
  getStream(subscriberOrganizationId: string): Observable<MessageEvent> {
    return this.subject.asObservable().pipe(
      filter((b) => b.organizationId === subscriberOrganizationId),
      map((b) => ({ data: b.event, id: String(b.event.seq) })),
    );
  }

  replayAfter(organizationId: string, afterSeq: number): PanelEvent[] {
    const arr = this.ringBuffer.get(organizationId) ?? [];
    return arr.filter((b) => b.event.seq > afterSeq).map((b) => b.event) satisfies PanelEvent[];
  }

  onModuleDestroy() {
    this.subject.complete();
  }

  get currentSeq(): number {
    return this.seqCounter;
  }
}
