import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { PanelController } from '../../../in/http/panel.controller';
import { PanelService } from '../panel.service';
import { PanelSseService } from '../panel-sse.service';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { PANEL_EVENTS } from '../panel-events';
import { firstValueFrom, take } from 'rxjs';

describe('Panel integration', () => {
  let moduleRef: TestingModule;
  let controller: PanelController;
  let sseService: PanelSseService;
  let emitter: EventEmitter2;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      workflowRun: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        PanelService,
        PanelSseService,
        PanelController,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    await moduleRef.init();  // same reason as Task 4 — @OnEvent handlers register at lifecycle
    controller = moduleRef.get(PanelController);
    sseService = moduleRef.get(PanelSseService);
    emitter = moduleRef.get(EventEmitter2);
  });

  afterEach(async () => {
    await moduleRef.close();  // clean teardown
  });

  const makeItem = (overrides = {}) => ({
    id: 'workflow:abc',
    kind: 'run' as const,
    source: 'workflow' as const,
    sourceId: 'abc',
    status: 'running' as const,
    title: 't',
    deepLink: '/x',
    actorUserId: null,
    visibility: 'organization' as const,
    createdAt: '2026-04-15T00:00:00Z',
    ...overrides,
  });

  it('initial connect without replay sends snapshot event with resetClient', async () => {
    prisma.workflowRun.findMany.mockResolvedValue([]);
    const stream$ = await controller.stream('co-1', { id: 'user-1' } as any, undefined);
    const first = await firstValueFrom(stream$.pipe(take(1)));
    const event = (first as any).data;
    expect(event.type).toBe('snapshot');
    expect(event.resetClient).toBe(true);
  });

  it('initial connect ignores ring-buffer replay when Last-Event-ID is absent', async () => {
    emitter.emit(PANEL_EVENTS.UPSERT, { item: makeItem({ id: 'stale-running' }), organizationId: 'co-1' });
    await new Promise((r) => setTimeout(r, 10));

    const stream$ = await controller.stream('co-1', { id: 'user-1' } as any, undefined);
    const first = await firstValueFrom(stream$.pipe(take(1)));
    const event = (first as any).data;

    expect(event.type).toBe('snapshot');
    expect(event.resetClient).toBe(true);
  });

  it('upsert event flows from emitter to stream, organizationId stripped', async () => {
    const stream$ = await controller.stream('co-1', { id: 'user-1' } as any, undefined);
    const collected: any[] = [];
    const sub = stream$.subscribe((e) => collected.push((e as any).data));
    await new Promise((r) => setTimeout(r, 10));
    emitter.emit(PANEL_EVENTS.UPSERT, { item: makeItem(), organizationId: 'co-1' });
    await new Promise((r) => setTimeout(r, 10));
    sub.unsubscribe();
    const upsert = collected.find((e) => e.type === 'upsert');
    expect(upsert).toBeDefined();
    expect(upsert.item.id).toBe('workflow:abc');
    expect(upsert.item).not.toHaveProperty('organizationId');
  });

  it('other organization events are filtered', async () => {
    const stream$ = await controller.stream('co-1', { id: 'user-1' } as any, undefined);
    const collected: any[] = [];
    const sub = stream$.subscribe((e) => collected.push((e as any).data));
    await new Promise((r) => setTimeout(r, 10));
    emitter.emit(PANEL_EVENTS.UPSERT, { item: makeItem({ id: 'other' }), organizationId: 'co-2' });
    emitter.emit(PANEL_EVENTS.UPSERT, { item: makeItem({ id: 'mine' }), organizationId: 'co-1' });
    await new Promise((r) => setTimeout(r, 10));
    sub.unsubscribe();
    const upserts = collected.filter((e) => e.type === 'upsert');
    expect(upserts).toHaveLength(1);
    expect(upserts[0].item.id).toBe('mine');
  });

  it('visibility filter hides other users user-scoped items (snapshot)', async () => {
    prisma.workflowRun.findMany.mockResolvedValue([
      { id: 'r1', status: 'running', template: { name: 'Mine' }, steps: [], triggeredByUserId: 'user-a', createdAt: new Date() },
      { id: 'r2', status: 'running', template: { name: 'Others' }, steps: [], triggeredByUserId: 'user-b', createdAt: new Date() },
    ]);
    const snapshot = await controller.snapshot('co-1', { id: 'user-a' } as any);
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].id).toBe('workflow:r1');
  });

  it('Last-Event-ID triggers ring buffer replay without snapshot', async () => {
    for (let i = 0; i < 3; i++) {
      emitter.emit(PANEL_EVENTS.UPSERT, { item: makeItem({ id: `r-${i}` }), organizationId: 'co-1' });
    }
    await new Promise((r) => setTimeout(r, 10));
    const stream$ = await controller.stream('co-1', { id: 'user-1' } as any, '1');
    const collected: any[] = [];
    const sub = stream$.subscribe((e) => collected.push((e as any).data));
    await new Promise((r) => setTimeout(r, 10));
    sub.unsubscribe();
    expect(collected.filter((e) => e.type === 'snapshot')).toHaveLength(0);
    const replayed = collected.filter((e) => e.type === 'upsert');
    expect(replayed.length).toBeGreaterThanOrEqual(2);
  });

  it('Last-Event-ID replay applies the same user visibility filter as snapshot', async () => {
    emitter.emit(
      PANEL_EVENTS.UPSERT,
      {
        item: makeItem({ id: 'other-user', visibility: 'user', actorUserId: 'user-b' }),
        organizationId: 'co-1',
      },
    );
    emitter.emit(
      PANEL_EVENTS.UPSERT,
      {
        item: makeItem({ id: 'mine', visibility: 'user', actorUserId: 'user-a' }),
        organizationId: 'co-1',
      },
    );
    await new Promise((r) => setTimeout(r, 10));

    const stream$ = await controller.stream('co-1', { id: 'user-a' } as any, '0');
    const collected: any[] = [];
    const sub = stream$.subscribe((e) => collected.push((e as any).data));
    await new Promise((r) => setTimeout(r, 10));
    sub.unsubscribe();

    expect(collected.filter((e) => e.type === 'snapshot')).toHaveLength(0);
    expect(collected.filter((e) => e.type === 'upsert').map((e) => e.item.id)).toEqual(['mine']);
  });
});
