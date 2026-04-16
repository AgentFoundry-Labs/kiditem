import { describe, it, expect } from 'vitest';
import { PanelItem, PanelEvent, PanelRunSourceSchema, PanelAlertItem, PANEL_ITEM_KINDS } from '../index.js';

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
  it('PanelRunSourceSchema accepts agent', () => {
    expect(() => PanelRunSourceSchema.parse('agent')).not.toThrow();
  });
  it('PanelRunSourceSchema accepts image', () => {
    expect(() => PanelRunSourceSchema.parse('image')).not.toThrow();
  });
  it('PanelRunSourceSchema rejects unknown source', () => {
    expect(() => PanelRunSourceSchema.parse('bogus')).toThrow();
  });
});

const makeAlert = (overrides = {}) => ({
  kind: 'alert' as const,
  id: '00000000-0000-0000-0000-000000000001',
  severity: 'warning',
  type: 'internal:stock',
  title: 'Stock low',
  message: null,
  productId: null,
  isRead: false,
  actionTaskId: null,
  actorUserId: null,
  createdAt: '2026-04-15T00:00:00Z',
  ...overrides,
});

describe('PanelAlertItem', () => {
  it('parses a valid alert item', () => {
    expect(() => PanelAlertItem.parse(makeAlert())).not.toThrow();
  });
  it('PanelItem discriminates alert from run', () => {
    const result = PanelItem.parse(makeAlert());
    expect(result.kind).toBe('alert');
  });
  it('PanelItem still parses run', () => {
    const result = PanelItem.parse(makeRun());
    expect(result.kind).toBe('run');
  });
  it('rejects non-string severity', () => {
    expect(() => PanelAlertItem.parse(makeAlert({ severity: 123 as any }))).toThrow();
  });
  it('rejects non-string type', () => {
    expect(() => PanelAlertItem.parse(makeAlert({ type: 123 as any }))).toThrow();
  });
  it('rejects non-string title', () => {
    expect(() => PanelAlertItem.parse(makeAlert({ title: 123 as any }))).toThrow();
  });
  it('accepts null message', () => {
    expect(() => PanelAlertItem.parse(makeAlert({ message: null }))).not.toThrow();
  });
  it('accepts non-null message', () => {
    expect(() => PanelAlertItem.parse(makeAlert({ message: 'details here' }))).not.toThrow();
  });
  it('accepts null productId', () => {
    expect(() => PanelAlertItem.parse(makeAlert({ productId: null }))).not.toThrow();
  });
  it('accepts non-null productId uuid', () => {
    expect(() =>
      PanelAlertItem.parse(makeAlert({ productId: '00000000-0000-0000-0000-000000000002' })),
    ).not.toThrow();
  });
  it('rejects invalid uuid on id', () => {
    expect(() => PanelAlertItem.parse(makeAlert({ id: 'not-a-uuid' }))).toThrow();
  });
  it('rejects invalid uuid on productId', () => {
    expect(() => PanelAlertItem.parse(makeAlert({ productId: 'not-a-uuid' }))).toThrow();
  });
  it('rejects invalid uuid on actorUserId', () => {
    expect(() => PanelAlertItem.parse(makeAlert({ actorUserId: 'not-a-uuid' }))).toThrow();
  });
  it('accepts null actorUserId', () => {
    expect(() => PanelAlertItem.parse(makeAlert({ actorUserId: null }))).not.toThrow();
  });
  it('accepts null actionTaskId', () => {
    expect(() => PanelAlertItem.parse(makeAlert({ actionTaskId: null }))).not.toThrow();
  });
  it('accepts valid uuid actionTaskId', () => {
    expect(() =>
      PanelAlertItem.parse(makeAlert({ actionTaskId: '00000000-0000-0000-0000-000000000099' })),
    ).not.toThrow();
  });
  it('rejects invalid uuid on actionTaskId', () => {
    expect(() => PanelAlertItem.parse(makeAlert({ actionTaskId: 'not-a-uuid' }))).toThrow();
  });
});

describe('PANEL_ITEM_KINDS', () => {
  it('contains run and alert', () => {
    expect(PANEL_ITEM_KINDS).toContain('run');
    expect(PANEL_ITEM_KINDS).toContain('alert');
    expect(PANEL_ITEM_KINDS).toHaveLength(2);
  });
});

describe('PanelRunItem phase/failureType', () => {
  it('accepts phase undefined (workflow regression)', () => {
    expect(() => PanelItem.parse(makeRun())).not.toThrow();
  });
  it('accepts phase null', () => {
    expect(() => PanelItem.parse(makeRun({ phase: null }))).not.toThrow();
  });
  it('accepts phase string', () => {
    expect(() => PanelItem.parse(makeRun({ phase: 'uploading' }))).not.toThrow();
  });
  it('accepts failureType undefined', () => {
    expect(() => PanelItem.parse(makeRun({ failureType: undefined }))).not.toThrow();
  });
  it('accepts failureType null', () => {
    expect(() => PanelItem.parse(makeRun({ failureType: null }))).not.toThrow();
  });
  it('accepts failureType string', () => {
    expect(() => PanelItem.parse(makeRun({ failureType: 'timeout' }))).not.toThrow();
  });
});
