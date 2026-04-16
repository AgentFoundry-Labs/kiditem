import { describe, it, expect, beforeEach } from 'vitest';
import { createPanelStore } from '../panel-store';

const makeItem = (overrides = {}) => ({
  id: 'workflow:abc', kind: 'run' as const, source: 'workflow' as const, sourceId: 'abc',
  seq: 1, status: 'running' as const, title: 't', deepLink: '/x',
  actorUserId: null, visibility: 'company' as const,
  createdAt: '2026-04-15T00:00:00Z', updatedAt: '2026-04-15T00:00:00Z',
  ...overrides,
});

describe('panel-store', () => {
  let store: ReturnType<typeof createPanelStore>;
  beforeEach(() => { store = createPanelStore(); });

  it('upsertItem adds new', () => {
    store.getState().upsertItem(makeItem({ id: 'a', seq: 1 }));
    expect(store.getState().byId['a']).toBeDefined();
    expect(store.getState().lastSeq).toBe(1);
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

  it('handleSnapshot clears store on resetClient', () => {
    store.getState().upsertItem(makeItem({ id: 'a', seq: 100 }));
    store.getState().handleSnapshot([makeItem({ id: 'b', seq: 1 })], true);
    expect(store.getState().byId['a']).toBeUndefined();
    expect(store.getState().byId['b']).toBeDefined();
    expect(store.getState().lastSeq).toBe(1);
  });

  it('dismissItem removes', () => {
    store.getState().upsertItem(makeItem({ id: 'a', seq: 1 }));
    store.getState().dismissItem('a');
    expect(store.getState().byId['a']).toBeUndefined();
  });

  it('runningCount counts pending+running', () => {
    store.getState().upsertItem(makeItem({ id: '1', seq: 1, status: 'pending' }));
    store.getState().upsertItem(makeItem({ id: '2', seq: 2, status: 'running' }));
    store.getState().upsertItem(makeItem({ id: '3', seq: 3, status: 'succeeded' }));
    expect(store.getState().runningCount()).toBe(2);
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
