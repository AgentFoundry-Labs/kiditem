import { describe, it, expect } from 'vitest';
import { PanelItem, PanelEvent, PanelRunSourceSchema, PanelAlertItem } from '../index.js';

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
  it('parses a valid workflow run (kind=run)', () => {
    const result = PanelItem.parse(makeRun());
    expect(result.kind).toBe('run');
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

  it.each([
    ['workflow', true],
    ['agent', true],
    ['image', true],
    ['bogus', false],
  ])('PanelRunSourceSchema: %s → valid=%s', (source, valid) => {
    if (valid) {
      expect(() => PanelRunSourceSchema.parse(source)).not.toThrow();
    } else {
      expect(() => PanelRunSourceSchema.parse(source)).toThrow();
    }
  });
});

const makeAlert = (overrides = {}) => ({
  kind: 'alert' as const,
  id: '00000000-0000-0000-0000-000000000001',
  severity: 'warning',
  type: 'internal:stock',
  title: 'Stock low',
  message: null,
  targetType: null,
  targetId: null,
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

  it.each(['severity', 'type', 'title'])('rejects non-string %s', (field) => {
    expect(() => PanelAlertItem.parse(makeAlert({ [field]: 123 as any }))).toThrow();
  });

  it('message accepts null or string', () => {
    expect(() => PanelAlertItem.parse(makeAlert({ message: null }))).not.toThrow();
    expect(() => PanelAlertItem.parse(makeAlert({ message: 'details here' }))).not.toThrow();
  });

  it('targetType accepts null or string', () => {
    expect(() => PanelAlertItem.parse(makeAlert({ targetType: null }))).not.toThrow();
    expect(() => PanelAlertItem.parse(makeAlert({ targetType: 'product' }))).not.toThrow();
  });

  it('targetId accepts null or valid uuid', () => {
    expect(() => PanelAlertItem.parse(makeAlert({ targetId: null }))).not.toThrow();
    expect(() =>
      PanelAlertItem.parse(makeAlert({ targetId: '00000000-0000-0000-0000-000000000002' })),
    ).not.toThrow();
  });

  it.each(['id', 'targetId', 'actorUserId', 'actionTaskId'])(
    'rejects invalid uuid on %s',
    (field) => {
      expect(() => PanelAlertItem.parse(makeAlert({ [field]: 'not-a-uuid' }))).toThrow();
    },
  );

  it.each(['actorUserId', 'actionTaskId'])('accepts null %s', (field) => {
    expect(() => PanelAlertItem.parse(makeAlert({ [field]: null }))).not.toThrow();
  });

  it('accepts valid uuid actionTaskId', () => {
    expect(() =>
      PanelAlertItem.parse(makeAlert({ actionTaskId: '00000000-0000-0000-0000-000000000099' })),
    ).not.toThrow();
  });
});

describe('PanelRunItem phase/failureType', () => {
  it.each([undefined, null, 'uploading'])('accepts phase = %s', (phase) => {
    expect(() => PanelItem.parse(makeRun({ phase }))).not.toThrow();
  });

  it.each([undefined, null, 'timeout'])('accepts failureType = %s', (failureType) => {
    expect(() => PanelItem.parse(makeRun({ failureType }))).not.toThrow();
  });
});
