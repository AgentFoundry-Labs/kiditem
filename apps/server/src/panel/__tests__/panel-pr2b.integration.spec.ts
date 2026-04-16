/**
 * PR2b integration test — Panel SSE pipeline 4-source + alert + company isolation (Task 26)
 *
 * Extends PR2a to cover:
 *   1. 4-source single-stream — workflow + agent + image + alert all arrive, alert has kind: 'alert'
 *   2. My/team split data flow — actorUserId values propagate correctly (null vs user vs other)
 *   3. Concurrent rules eval no-contamination — co-A and co-B alert items stay isolated
 *   4. Partial-emit failure — first valid item arrives even when second emits with bad companyId filter
 *   5. Actor-null for alert items — alert actorUserId is always null through the bus
 *
 * Mock boundary: PrismaService only.
 * Real: EventEmitter2 (global bus), PanelSseService, all adapters.
 *
 * Deterministic: rxjs lastValueFrom + take(N) + toArray — no sleep().
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { lastValueFrom } from 'rxjs';
import { take, toArray } from 'rxjs/operators';

import { PanelSseService } from '../events/panel-sse.service';
import { PANEL_EVENTS, PanelUpsertInternal } from '../events/panel-events';
import { PrismaService } from '../../prisma/prisma.service';

// ── helpers ────────────────────────────────────────────────────────────────

function baseRunItem(overrides: Partial<PanelUpsertInternal['item']> = {}): PanelUpsertInternal['item'] {
  return {
    id: 'workflow:run-1',
    kind: 'run',
    source: 'workflow',
    sourceId: 'run-1',
    status: 'running',
    title: 'Test workflow',
    deepLink: '/workflows/run-1',
    actorUserId: null,
    visibility: 'company',
    createdAt: '2026-04-16T00:00:00.000Z',
    ...overrides,
  } as PanelUpsertInternal['item'];
}

function alertPayload(
  overrides: Partial<{
    companyId: string;
    id: string;
    severity: string;
    type: string;
    title: string;
    message: string | null;
    productId: string | null;
    isRead: boolean;
    actorUserId: string | null;
    createdAt: string;
  }> = {},
): PanelUpsertInternal {
  const { companyId = 'co-1', ...itemOverrides } = overrides;
  return {
    companyId,
    item: {
      kind: 'alert',
      id: 'alert-1',
      severity: 'warning',
      type: 'low_ctr',
      title: '클릭률 낮음',
      message: '최근 7일 CTR 0.3%',
      productId: null,
      isRead: false,
      actorUserId: null,
      createdAt: '2026-04-16T00:00:00.000Z',
      ...itemOverrides,
    } as PanelUpsertInternal['item'],
  };
}

function workflowPayload(overrides: Partial<PanelUpsertInternal['item']> = {}): PanelUpsertInternal {
  return {
    companyId: 'co-1',
    item: baseRunItem({ id: 'workflow:run-1', source: 'workflow', sourceId: 'run-1', ...overrides }),
  };
}

function agentPayload(overrides: Partial<PanelUpsertInternal['item']> = {}): PanelUpsertInternal {
  return {
    companyId: 'co-1',
    item: baseRunItem({
      id: 'agent:run-1',
      source: 'agent',
      sourceId: 'run-1',
      title: 'Ad strategy agent',
      deepLink: '/agents/agent-1/runs/run-1',
      ...overrides,
    }),
  };
}

function imagePayload(overrides: Partial<PanelUpsertInternal['item']> = {}): PanelUpsertInternal {
  return {
    companyId: 'co-1',
    item: baseRunItem({
      id: 'image:gen-1',
      source: 'image',
      sourceId: 'gen-1',
      title: '아동 레깅스',
      deepLink: '/products/prod-1/thumbnails',
      ...overrides,
    }),
  };
}

async function buildModule(): Promise<TestingModule> {
  const prisma = {
    workflowRun: { findMany: () => Promise.resolve([]) },
  };
  const module = await Test.createTestingModule({
    imports: [EventEmitterModule.forRoot()],
    providers: [
      PanelSseService,
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();
  await module.init();
  return module;
}

// ── tests ──────────────────────────────────────────────────────────────────

describe('Panel PR2b integration — 4 source + alert + concurrent company isolation (Task 26)', () => {
  let moduleRef: TestingModule;
  let sseService: PanelSseService;
  let emitter: EventEmitter2;

  beforeEach(async () => {
    moduleRef = await buildModule();
    sseService = moduleRef.get(PanelSseService);
    emitter = moduleRef.get(EventEmitter2);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  // ── Scenario 1: 4-source single-stream ──────────────────────────────────

  it('Scenario 1: workflow + agent + image + alert all arrive on one stream; alert has kind: alert', async () => {
    const stream$ = sseService.getStream('co-1').pipe(take(4), toArray());
    const collectPromise = lastValueFrom(stream$);

    emitter.emit(PANEL_EVENTS.UPSERT, workflowPayload());
    emitter.emit(PANEL_EVENTS.UPSERT, agentPayload());
    emitter.emit(PANEL_EVENTS.UPSERT, imagePayload());
    emitter.emit(PANEL_EVENTS.UPSERT, alertPayload());

    const events = await collectPromise;
    expect(events).toHaveLength(4);

    const panelEvents = events.map((e) => (e as any).data);

    // All are upsert type
    panelEvents.forEach((e: any) => expect(e.type).toBe('upsert'));

    // All 4 kinds present
    const kinds = panelEvents.map((e: any) => e.item.kind ?? e.item.source);
    expect(panelEvents.find((e: any) => e.item.kind === 'run' && e.item.source === 'workflow')).toBeDefined();
    expect(panelEvents.find((e: any) => e.item.kind === 'run' && e.item.source === 'agent')).toBeDefined();
    expect(panelEvents.find((e: any) => e.item.kind === 'run' && e.item.source === 'image')).toBeDefined();
    expect(panelEvents.find((e: any) => e.item.kind === 'alert')).toBeDefined();

    // Alert item has kind: 'alert'
    const alertEvent = panelEvents.find((e: any) => e.item.kind === 'alert');
    expect(alertEvent.item.severity).toBe('warning');
    expect(alertEvent.item.type).toBe('low_ctr');

    // Monotonically increasing seq
    const seqs = panelEvents.map((e: any) => e.seq);
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i - 1]).toBeLessThan(seqs[i]);
    }
  });

  // ── Scenario 2: My/team split data flow ─────────────────────────────────

  it('Scenario 2: actorUserId values propagate correctly — null, user, other-user', async () => {
    const stream$ = sseService.getStream('co-1').pipe(take(3), toArray());
    const collectPromise = lastValueFrom(stream$);

    // null actor (team-bucket)
    emitter.emit(PANEL_EVENTS.UPSERT, workflowPayload({ actorUserId: null, id: 'workflow:run-a' }));

    // matching user actor (my-bucket)
    emitter.emit(
      PANEL_EVENTS.UPSERT,
      workflowPayload({ actorUserId: 'user-123', id: 'workflow:run-b' }),
    );

    // different user actor (other user's item)
    emitter.emit(
      PANEL_EVENTS.UPSERT,
      workflowPayload({ actorUserId: 'user-456', id: 'workflow:run-c' }),
    );

    const events = await collectPromise;
    const panelEvents = events.map((e) => (e as any).data);

    expect(panelEvents).toHaveLength(3);

    const actorIds = panelEvents.map((e: any) => e.item.actorUserId);
    expect(actorIds).toContain(null);
    expect(actorIds).toContain('user-123');
    expect(actorIds).toContain('user-456');

    // Verify each item's actorUserId is preserved exactly
    const nullItem = panelEvents.find((e: any) => e.item.id === 'workflow:run-a');
    expect(nullItem.item.actorUserId).toBeNull();

    const userItem = panelEvents.find((e: any) => e.item.id === 'workflow:run-b');
    expect(userItem.item.actorUserId).toBe('user-123');

    const otherItem = panelEvents.find((e: any) => e.item.id === 'workflow:run-c');
    expect(otherItem.item.actorUserId).toBe('user-456');
  });

  // ── Scenario 3: Concurrent rules eval no-contamination ──────────────────

  it('Scenario 3: co-A and co-B alert items — zero cross-company leak', async () => {
    // Set up separate streams for co-A and co-B
    const streamA$ = sseService.getStream('co-A').pipe(take(2), toArray());
    const streamB$ = sseService.getStream('co-B').pipe(take(2), toArray());

    const collectA = lastValueFrom(streamA$);
    const collectB = lastValueFrom(streamB$);

    // Interleave emits from co-A and co-B
    emitter.emit(
      PANEL_EVENTS.UPSERT,
      alertPayload({ companyId: 'co-A', id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', title: 'co-A alert 1' }),
    );
    emitter.emit(
      PANEL_EVENTS.UPSERT,
      alertPayload({ companyId: 'co-B', id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', title: 'co-B alert 1' }),
    );
    emitter.emit(
      PANEL_EVENTS.UPSERT,
      alertPayload({ companyId: 'co-A', id: 'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', title: 'co-A alert 2' }),
    );
    emitter.emit(
      PANEL_EVENTS.UPSERT,
      alertPayload({ companyId: 'co-B', id: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', title: 'co-B alert 2' }),
    );

    const eventsA = await collectA;
    const eventsB = await collectB;

    const panelEventsA = eventsA.map((e) => (e as any).data);
    const panelEventsB = eventsB.map((e) => (e as any).data);

    // co-A stream only has co-A alerts
    expect(panelEventsA).toHaveLength(2);
    panelEventsA.forEach((e: any) => {
      expect(e.item.title).toMatch(/^co-A/);
    });

    // co-B stream only has co-B alerts
    expect(panelEventsB).toHaveLength(2);
    panelEventsB.forEach((e: any) => {
      expect(e.item.title).toMatch(/^co-B/);
    });

    // Zero cross-company leak: no co-B items in co-A stream and vice versa
    const coAIds = panelEventsA.map((e: any) => e.item.id);
    const coBIds = panelEventsB.map((e: any) => e.item.id);
    coAIds.forEach((id: string) => expect(coBIds).not.toContain(id));
    coBIds.forEach((id: string) => expect(coAIds).not.toContain(id));
  });

  // ── Scenario 4: Partial-emit failure — first valid item arrives ──────────

  it('Scenario 4: valid alert arrives even when second emit has mismatched companyId', async () => {
    // Subscribe to co-1 and expect exactly 1 event (the valid one)
    const stream$ = sseService.getStream('co-1').pipe(take(1), toArray());
    const collectPromise = lastValueFrom(stream$);

    // Valid co-1 emit
    emitter.emit(PANEL_EVENTS.UPSERT, alertPayload({ companyId: 'co-1', title: 'valid alert' }));

    // "Bad" emit: companyId is co-2 — subscriber for co-1 should NOT receive this
    emitter.emit(
      PANEL_EVENTS.UPSERT,
      alertPayload({ companyId: 'co-2', title: 'wrong company alert' }),
    );

    const events = await collectPromise;
    const panelEvents = events.map((e) => (e as any).data);

    // First valid item arrived
    expect(panelEvents).toHaveLength(1);
    expect(panelEvents[0].item.title).toBe('valid alert');
    expect(panelEvents[0].item.kind).toBe('alert');
    expect(panelEvents[0].type).toBe('upsert');
  });

  // ── Scenario 5: Actor-null for alert items ───────────────────────────────

  it('Scenario 5: alert items always propagate actorUserId: null through the stream', async () => {
    const stream$ = sseService.getStream('co-1').pipe(take(2), toArray());
    const collectPromise = lastValueFrom(stream$);

    // Alert item with explicit null actor (the always-null invariant)
    emitter.emit(
      PANEL_EVENTS.UPSERT,
      alertPayload({ actorUserId: null, title: 'null-actor alert' }),
    );

    // Run item with non-null actor for contrast
    emitter.emit(
      PANEL_EVENTS.UPSERT,
      workflowPayload({ actorUserId: 'user-abc', id: 'workflow:run-contrast' }),
    );

    const events = await collectPromise;
    const panelEvents = events.map((e) => (e as any).data);

    const alertEvent = panelEvents.find((e: any) => e.item.kind === 'alert');
    const runEvent = panelEvents.find((e: any) => e.item.kind === 'run');

    // Alert: always null actor → '팀' bucket on the UI
    expect(alertEvent).toBeDefined();
    expect(alertEvent.item.actorUserId).toBeNull();

    // Run: actor preserved as-is
    expect(runEvent).toBeDefined();
    expect(runEvent.item.actorUserId).toBe('user-abc');
  });
});
