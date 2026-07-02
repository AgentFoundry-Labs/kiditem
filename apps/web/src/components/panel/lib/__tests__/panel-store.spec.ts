import { describe, it, expect, beforeEach } from 'vitest';
import { createPanelStore } from '../panel-store';
import type { PanelItem } from '@kiditem/shared/panel';

const makeItem = (overrides = {}) => ({
  id: 'workflow:abc', kind: 'run' as const, source: 'workflow' as const, sourceId: 'abc',
  seq: 1, status: 'running' as const, title: 't', deepLink: '/x',
  actorUserId: null, visibility: 'organization' as const,
  createdAt: '2026-04-15T00:00:00Z', updatedAt: '2026-04-15T00:00:00Z',
  ...overrides,
});

const makeAlertItem = (overrides: Partial<PanelItem> = {}): PanelItem => ({
  kind: 'alert',
  id: '11111111-1111-1111-1111-111111111111',
  alertKind: 'operation',
  status: 'running',
  severity: 'info',
  type: 'internal:rules',
  title: '작업 실행 중',
  message: null,
  targetType: null,
  targetId: null,
  operationKey: 'op-1',
  sourceType: 'agent_run_request',
  sourceId: '22222222-2222-2222-2222-222222222222',
  isRead: false,
  actionTaskId: null,
  actorUserId: null,
  href: null,
  progress: null,
  metadata: {},
  readAt: null,
  startedAt: '2026-04-15T00:00:00.000Z',
  finishedAt: null,
  createdAt: '2026-04-15T00:00:00.000Z',
  ...overrides,
});

describe('panel-store', () => {
  let store: ReturnType<typeof createPanelStore>;
  beforeEach(() => { store = createPanelStore(); });

  it('upsertItem adds new', () => {
    store.getState().upsertItem(makeItem({ id: 'a', seq: 1 }));
    expect(store.getState().byId['a']).toBeDefined();
    expect(store.getState().lastSeq).toBe(1);
    expect(store.getState().hasHydrated).toBe(true);
  });

  it('upsertItem replaces if seq is newer', () => {
    store.getState().upsertItem(makeItem({ id: 'a', seq: 1, title: 'old' }));
    store.getState().upsertItem(makeItem({ id: 'a', seq: 2, title: 'new' }));
    expect(store.getState().byId['a'].title).toBe('new');
  });

  it('upsertItem ignores stale seq', () => {
    store.getState().upsertItem(makeItem({ id: 'a', seq: 5 }));
    store.getState().upsertItem(makeItem({ id: 'a', seq: 3 }));
    const item = store.getState().byId['a'];
    expect(item?.kind === 'run' ? item.seq : undefined).toBe(5);
  });

  it('upsertItem replaces alert lifecycle state even without item seq', () => {
    const id = '11111111-1111-1111-1111-111111111112';
    store.getState().upsertItem(makeAlertItem({ id, status: 'running', progress: 0.2 }));
    store.getState().upsertItem(makeAlertItem({
      id,
      status: 'succeeded',
      progress: 1,
      finishedAt: '2026-04-15T00:05:00.000Z',
    }));

    const item = store.getState().byId[id];
    expect(item?.kind === 'alert' ? item.status : undefined).toBe('succeeded');
    expect(store.getState().runningCount()).toBe(0);
  });

  it('handleSnapshot clears store on resetClient', () => {
    store.getState().upsertItem(makeItem({ id: 'a', seq: 100 }));
    store.getState().handleSnapshot([makeItem({ id: 'b', seq: 1 })], true);
    expect(store.getState().byId['a']).toBeUndefined();
    expect(store.getState().byId['b']).toBeDefined();
    expect(store.getState().lastSeq).toBe(1);
    expect(store.getState().hasHydrated).toBe(true);
  });

  it('dismissItem removes', () => {
    store.getState().upsertItem(makeItem({ id: 'a', seq: 1 }));
    store.getState().dismissItem('a');
    expect(store.getState().byId['a']).toBeUndefined();
    expect(store.getState().hasHydrated).toBe(true);
  });

  it('runningCount counts pending+running', () => {
    store.getState().upsertItem(makeItem({ id: '1', seq: 1, status: 'pending' }));
    store.getState().upsertItem(makeItem({ id: '2', seq: 2, status: 'running' }));
    store.getState().upsertItem(makeItem({ id: '3', seq: 3, status: 'succeeded' }));
    store.getState().upsertItem(makeAlertItem({ id: '11111111-1111-1111-1111-111111111112' }));
    store.getState().upsertItem(
      makeAlertItem({
        id: '11111111-1111-1111-1111-111111111113',
        alertKind: 'signal',
      }),
    );
    store.getState().upsertItem(
      makeAlertItem({
        id: '11111111-1111-1111-1111-111111111114',
        status: 'succeeded',
      }),
    );
    expect(store.getState().runningCount()).toBe(3);
  });

  it('unreadCount counts unread alerts and failed runs', () => {
    store.getState().upsertItem(makeItem({ id: '1', seq: 1, status: 'failed' }));
    store.getState().upsertItem(makeItem({ id: '2', seq: 2, status: 'succeeded' }));
    store.getState().upsertItem(makeAlertItem({ id: '11111111-1111-1111-1111-111111111112' }));
    store.getState().upsertItem(
      makeAlertItem({
        id: '11111111-1111-1111-1111-111111111113',
        isRead: true,
      }),
    );

    expect(store.getState().unreadCount()).toBe(2);
  });

  it('applyEvent dispatches by type', () => {
    store.getState().applyEvent({ type: 'upsert', seq: 1, item: makeItem({ id: 'a', seq: 1 }) });
    expect(store.getState().byId['a']).toBeDefined();
    store.getState().applyEvent({ type: 'dismiss', seq: 2, itemId: 'a' });
    expect(store.getState().byId['a']).toBeUndefined();
  });

  it('applyEvent advances lastSeq on dismiss', () => {
    store.getState().applyEvent({ type: 'upsert', seq: 1, item: makeItem({ id: 'a', seq: 1 }) });
    store.getState().applyEvent({ type: 'dismiss', seq: 5, itemId: 'a' });
    expect(store.getState().lastSeq).toBe(5);
  });

  it('applyEvent handles snapshot', () => {
    store.getState().upsertItem(makeItem({ id: 'old', seq: 100 }));
    store.getState().applyEvent({
      type: 'snapshot',
      seq: 50,
      items: [makeItem({ id: 'new', seq: 50 })],
      resetClient: true,
    });
    expect(store.getState().byId['old']).toBeUndefined();
    expect(store.getState().byId['new']).toBeDefined();
  });
});
