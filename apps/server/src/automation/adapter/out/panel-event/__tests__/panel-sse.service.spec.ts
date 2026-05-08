import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { PanelSseService } from '../panel-sse.service';
import { PANEL_EVENTS } from '../panel-events';
import { firstValueFrom, take } from 'rxjs';

describe('PanelSseService', () => {
  let service: PanelSseService;
  let emitter: EventEmitter2;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [PanelSseService],
    }).compile();
    await moduleRef.init();
    service = moduleRef.get(PanelSseService);
    emitter = moduleRef.get(EventEmitter2);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  const makeItem = (overrides = {}) => ({
    id: 'workflow:abc',
    kind: 'run' as const,
    source: 'workflow' as const,
    sourceId: 'abc',
    status: 'running' as const,
    title: 'test',
    deepLink: '/x',
    actorUserId: null,
    visibility: 'organization' as const,
    createdAt: '2026-04-15T00:00:00Z',
    ...overrides,
  });

  it('emits upsert and filters by organizationId', async () => {
    const sub = service.getStream('co-1');
    const next = firstValueFrom(sub.pipe(take(1)));
    emitter.emit(PANEL_EVENTS.UPSERT, { item: makeItem(), organizationId: 'co-1' });
    const msg = await next;
    expect((msg as any).data).toMatchObject({ type: 'upsert', seq: 1 });
    expect((msg as any).data.item).toMatchObject({ id: 'workflow:abc' });
  });

  it('strips organizationId from payload to client (CRITICAL #8)', async () => {
    const sub = service.getStream('co-1');
    const next = firstValueFrom(sub.pipe(take(1)));
    emitter.emit(PANEL_EVENTS.UPSERT, { item: makeItem(), organizationId: 'co-1' });
    const msg = await next as any;
    expect(msg.data.item).not.toHaveProperty('organizationId');
  });

  it('filters out other organization', async () => {
    const sub = service.getStream('co-1');
    const collected: any[] = [];
    const subscription = sub.subscribe((e) => collected.push(e));
    emitter.emit(PANEL_EVENTS.UPSERT, { item: makeItem({ id: 'other' }), organizationId: 'co-2' });
    emitter.emit(PANEL_EVENTS.UPSERT, { item: makeItem({ id: 'mine' }), organizationId: 'co-1' });
    await new Promise((r) => setTimeout(r, 10));
    subscription.unsubscribe();
    expect(collected).toHaveLength(1);
    expect((collected[0] as any).data.item.id).toBe('mine');
  });

  it('assigns monotonic seq', async () => {
    const sub = service.getStream('co-1');
    const collected: any[] = [];
    const subscription = sub.subscribe((e) => collected.push((e as any).data));
    for (let i = 0; i < 3; i++) {
      emitter.emit(PANEL_EVENTS.UPSERT, { item: makeItem({ id: `i-${i}` }), organizationId: 'co-1' });
    }
    await new Promise((r) => setTimeout(r, 10));
    subscription.unsubscribe();
    expect(collected.map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it('replayAfter returns events from ring buffer', async () => {
    for (let i = 0; i < 5; i++) {
      emitter.emit(PANEL_EVENTS.UPSERT, { item: makeItem({ id: `i-${i}` }), organizationId: 'co-1' });
    }
    await new Promise((r) => setTimeout(r, 5));
    const replayed = service.replayAfter('co-1', 2);
    expect(replayed.map((e) => e.seq)).toEqual([3, 4, 5]);
  });

  it('ring buffer caps at 100 per organization', async () => {
    for (let i = 0; i < 150; i++) {
      emitter.emit(PANEL_EVENTS.UPSERT, { item: makeItem({ id: `i-${i}` }), organizationId: 'co-1' });
    }
    await new Promise((r) => setTimeout(r, 20));
    const all = service.replayAfter('co-1', 0);
    expect(all.length).toBe(100);
  });

  it('dismiss event has itemId only (IMPORTANT #2)', async () => {
    const sub = service.getStream('co-1');
    const next = firstValueFrom(sub.pipe(take(1)));
    emitter.emit(PANEL_EVENTS.DISMISS, { itemId: 'workflow:abc', organizationId: 'co-1' });
    const msg = await next as any;
    expect(msg.data.type).toBe('dismiss');
    expect(msg.data.itemId).toBe('workflow:abc');
    expect(msg.data).not.toHaveProperty('item');
  });

  it('filters user-scoped run events by subscriber user while keeping org-wide runs', async () => {
    const sub = service.getStream('co-1', 'user-a');
    const collected: any[] = [];
    const subscription = sub.subscribe((e) => collected.push((e as any).data));

    emitter.emit(
      PANEL_EVENTS.UPSERT,
      { item: makeItem({ id: 'team', visibility: 'organization', actorUserId: null }), organizationId: 'co-1' },
    );
    emitter.emit(
      PANEL_EVENTS.UPSERT,
      { item: makeItem({ id: 'other-user', visibility: 'user', actorUserId: 'user-b' }), organizationId: 'co-1' },
    );
    emitter.emit(
      PANEL_EVENTS.UPSERT,
      { item: makeItem({ id: 'mine', visibility: 'user', actorUserId: 'user-a' }), organizationId: 'co-1' },
    );

    await new Promise((r) => setTimeout(r, 10));
    subscription.unsubscribe();

    expect(collected.map((e) => e.item.id)).toEqual(['team', 'mine']);
  });

  it('filters user-scoped run replay by subscriber user', async () => {
    emitter.emit(
      PANEL_EVENTS.UPSERT,
      { item: makeItem({ id: 'team', visibility: 'organization', actorUserId: null }), organizationId: 'co-1' },
    );
    emitter.emit(
      PANEL_EVENTS.UPSERT,
      { item: makeItem({ id: 'other-user', visibility: 'user', actorUserId: 'user-b' }), organizationId: 'co-1' },
    );
    emitter.emit(
      PANEL_EVENTS.UPSERT,
      { item: makeItem({ id: 'mine', visibility: 'user', actorUserId: 'user-a' }), organizationId: 'co-1' },
    );
    await new Promise((r) => setTimeout(r, 5));

    const replayed = service.replayAfter('co-1', 0, 'user-a');
    expect(replayed.map((e: any) => e.item.id)).toEqual(['team', 'mine']);
  });
});
