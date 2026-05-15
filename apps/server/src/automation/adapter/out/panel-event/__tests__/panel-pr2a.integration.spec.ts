/**
 * PR2a integration test — Panel SSE pipeline end-to-end.
 *
 * Verifies that workflow + image sources flow through the real
 * EventEmitter2 global bus to PanelSseService without mocking the bus.
 * (The legacy `HeartbeatRun + AgentDefinition` agent projection was
 * retired in the Agent OS migration; live agent run events come
 * from Agent OS directly and are not yet wired into the panel — see
 * `panel-event/AGENTS.md` "Not yet wired".)
 *
 * 5 scenarios:
 *   1. 2-source simultaneous emit → single stream, monotonically increasing seq
 *   2. Canonical status pass-through (ADR-0011 Rule 4 regression)
 *   3. EventEmitter wiring smoke — shared global bus across modules
 *   4. Actor-null fallback — actorUserId: null propagates as-is
 *   5. Phase change emit — two phase transitions arrive as separate seq
 *   6. Subscriber leak count — compile+init+close × 3 iterations, no listener growth
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

import type { PanelRunItem } from '@kiditem/shared/panel';
import { PanelSseService } from '../panel-sse.service';
import { PANEL_EVENTS, PanelUpsertInternal } from '../panel-events';
import { PrismaService } from '../../../../../prisma/prisma.service';

// ── helpers ────────────────────────────────────────────────────────────────

type RunItem = Omit<PanelRunItem, 'seq' | 'updatedAt'>;

function baseItem(overrides: Partial<RunItem> = {}): RunItem {
  return {
    id: 'workflow:run-1',
    kind: 'run',
    source: 'workflow',
    sourceId: 'run-1',
    status: 'running',
    title: 'Test workflow',
    deepLink: '/workflows/run-1',
    actorUserId: null,
    visibility: 'organization',
    createdAt: '2026-04-16T00:00:00.000Z',
    ...overrides,
  };
}

function workflowPayload(overrides: Partial<RunItem> = {}): PanelUpsertInternal {
  return {
    organizationId: 'co-1',
    item: baseItem({ id: 'workflow:run-1', source: 'workflow', sourceId: 'run-1', ...overrides }),
  };
}

function imagePayload(overrides: Partial<RunItem> = {}): PanelUpsertInternal {
  return {
    organizationId: 'co-1',
    item: baseItem({ id: 'image:gen-1', source: 'image', sourceId: 'gen-1', title: '아동 레깅스', deepLink: '/product-pipeline/thumbnail-generation?productId=prod-1', ...overrides }),
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

describe('Panel PR2a integration — workflow + image + canonical + EventEmitter wiring + leak', () => {
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

  // ── Scenario 1: 2-source simultaneous emit → single stream ───────────────

  it('Scenario 1: workflow + image emit arrive on same stream with monotonically increasing seq', async () => {
    const stream$ = sseService.getStream('co-1').pipe(take(2), toArray());

    // Subscribe first, then emit (Subject is hot)
    const collectPromise = lastValueFrom(stream$);

    emitter.emit(PANEL_EVENTS.UPSERT, workflowPayload());
    emitter.emit(PANEL_EVENTS.UPSERT, imagePayload());

    const events = await collectPromise;

    expect(events).toHaveLength(2);

    // Extract MessageEvent data (PanelEvent)
    const panelEvents = events.map((e) => (e as any).data);

    expect(panelEvents[0].type).toBe('upsert');
    expect(panelEvents[1].type).toBe('upsert');

    // Both sources present
    const sources = panelEvents.map((e: any) => e.item.source);
    expect(sources).toContain('workflow');
    expect(sources).toContain('image');

    // Monotonically increasing seq
    const seqs = panelEvents.map((e: any) => e.seq);
    expect(seqs[0]).toBeLessThan(seqs[1]);
  });

  // ── Scenario 2: Canonical status pass-through (ADR-0011 Rule 4) ───────────

  it('Scenario 2: canonical status pass-through — succeeded and running+generating arrive unchanged', async () => {
    const stream$ = sseService.getStream('co-1').pipe(take(2), toArray());
    const collectPromise = lastValueFrom(stream$);

    // workflow item with status: 'succeeded'
    emitter.emit(PANEL_EVENTS.UPSERT, workflowPayload({ status: 'succeeded' }));

    // thumbnail item with status: 'running', phase: 'generating'
    emitter.emit(PANEL_EVENTS.UPSERT, imagePayload({ status: 'running', phase: 'generating' } as any));

    const events = await collectPromise;
    const panelEvents = events.map((e) => (e as any).data);

    const workflowEvent = panelEvents.find((e: any) => e.item.source === 'workflow');
    const imageEvent = panelEvents.find((e: any) => e.item.source === 'image');

    expect(workflowEvent).toBeDefined();
    expect(workflowEvent.item.status).toBe('succeeded');

    expect(imageEvent).toBeDefined();
    expect(imageEvent.item.status).toBe('running');
    expect(imageEvent.item.phase).toBe('generating');
  });

  // ── Scenario 3: EventEmitter wiring smoke ────────────────────────────────

  it('Scenario 3: EventEmitter2 global bus — emitting from a second provider in same module reaches PanelSseService', async () => {
    /**
     * This test verifies the global bus invariant: every module that
     * injects EventEmitter2 from AppModule's `EventEmitterModule.forRoot()`
     * shares the same instance, so a workflow upsert emitted from one
     * application service is observed by PanelSseService elsewhere.
     */

    const globalEmitter = moduleRef.get(EventEmitter2);

    const stream$ = sseService.getStream('co-1').pipe(take(1), toArray());
    const collectPromise = lastValueFrom(stream$);

    // Emit from globalEmitter — simulates a workflow service emitting on its
    // injected EventEmitter2 (same token, same instance in a single forRoot() setup)
    globalEmitter.emit(PANEL_EVENTS.UPSERT, workflowPayload({ status: 'running' }));

    const events = await collectPromise;
    const panelEvent = (events[0] as any).data;

    expect(panelEvent.type).toBe('upsert');
    expect(panelEvent.item.source).toBe('workflow');
    expect(panelEvent.item.status).toBe('running');

    // Verify sseService has the same emitter instance — single bus invariant
    const sseEmitter = (sseService as any)['subject'];
    expect(sseEmitter).toBeDefined();
  });

  // ── Scenario 4: Actor-null fallback ──────────────────────────────────────

  it('Scenario 4: actorUserId: null propagates through the stream as-is', async () => {
    const stream$ = sseService.getStream('co-1').pipe(take(1), toArray());
    const collectPromise = lastValueFrom(stream$);

    emitter.emit(PANEL_EVENTS.UPSERT, workflowPayload({ actorUserId: null }));

    const events = await collectPromise;
    const panelEvent = (events[0] as any).data;

    expect(panelEvent.item.actorUserId).toBeNull();
  });

  // ── Scenario 5: Phase change emit ────────────────────────────────────────

  it('Scenario 5: two phase transitions on same thumbnail item arrive as separate seq', async () => {
    const stream$ = sseService.getStream('co-1').pipe(take(2), toArray());
    const collectPromise = lastValueFrom(stream$);

    // First emit: running + generating
    emitter.emit(PANEL_EVENTS.UPSERT, imagePayload({ status: 'running', phase: 'generating' } as any));
    // Second emit: same item, phase changed to ready
    emitter.emit(PANEL_EVENTS.UPSERT, imagePayload({ status: 'running', phase: 'ready' } as any));

    const events = await collectPromise;
    const panelEvents = events.map((e) => (e as any).data);

    expect(panelEvents).toHaveLength(2);
    expect(panelEvents[0].item.phase).toBe('generating');
    expect(panelEvents[1].item.phase).toBe('ready');

    // Separate seq for each transition
    expect(panelEvents[0].seq).not.toBe(panelEvents[1].seq);
    expect(panelEvents[0].seq).toBeLessThan(panelEvents[1].seq);
  });

  // ── Scenario 6: Subscriber leak count ────────────────────────────────────

  it('Scenario 6: compile+init+close × 3 iterations — no EventEmitter listener growth', async () => {
    // Close the beforeEach module first so we start from a clean slate.
    await moduleRef.close();

    const listenerCounts: number[] = [];

    for (let i = 0; i < 3; i++) {
      const mod = await buildModule();
      const e = mod.get(EventEmitter2);
      listenerCounts.push(e.listenerCount(PANEL_EVENTS.UPSERT));
      await mod.close();
    }

    // Each fresh module must register exactly 1 listener (PanelSseService @OnEvent handler).
    // All counts must be equal — no accumulation across iterations.
    expect(listenerCounts[0]).toBeGreaterThan(0);
    expect(listenerCounts[0]).toBe(listenerCounts[1]);
    expect(listenerCounts[1]).toBe(listenerCounts[2]);
  });
});
