import { describe, it, expect } from 'vitest';
import { PanelItem, PanelEvent, PanelRunSourceSchema } from '../index.js';

const makeRun = (overrides = {}) => ({
  id: 'workflow:abc',
  kind: 'run' as const,
  source: 'workflow' as const,
  sourceId: 'abc',
  seq: 1,
  status: 'running' as const,
  title: 'Test',
  deepLink: '/workflows/runs/abc',
  actorUserId: null,
  visibility: 'company' as const,
  createdAt: '2026-04-15T00:00:00Z',
  updatedAt: '2026-04-15T00:00:00Z',
  ...overrides,
});

describe('PanelItem', () => {
  it('parses a valid workflow run', () => {
    expect(() => PanelItem.parse(makeRun())).not.toThrow();
  });
  it('rejects unknown source', () => {
    expect(() => PanelItem.parse(makeRun({ source: 'bogus' as any }))).toThrow();
  });
  it('rejects invalid status', () => {
    expect(() => PanelItem.parse(makeRun({ status: 'weird' as any }))).toThrow();
  });
});

describe('PanelEvent', () => {
  it('parses upsert', () => {
    expect(() => PanelEvent.parse({ type: 'upsert', seq: 5, item: makeRun() })).not.toThrow();
  });
  it('parses dismiss with itemId only', () => {
    expect(() => PanelEvent.parse({ type: 'dismiss', seq: 6, itemId: 'workflow:abc' })).not.toThrow();
  });
  it('parses snapshot with resetClient flag', () => {
    expect(() => PanelEvent.parse({ type: 'snapshot', seq: 0, items: [], resetClient: true })).not.toThrow();
  });
  it('rejects snapshot without resetClient', () => {
    expect(() => PanelEvent.parse({ type: 'snapshot', seq: 0, items: [] } as any)).toThrow();
  });
  it('PanelRunSourceSchema accepts workflow', () => {
    expect(() => PanelRunSourceSchema.parse('workflow')).not.toThrow();
  });
});
