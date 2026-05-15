import { describe, it, expect } from 'vitest';
import { PanelItemSchema, PanelEventSchema, PanelRunSourceSchema, PanelAlertItemSchema } from '../index.js';

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
  visibility: 'organization' as const,
  createdAt: '2026-04-15T00:00:00Z',
  updatedAt: '2026-04-15T00:00:00Z',
  ...overrides,
});

describe('PanelItem', () => {
  it('parses a valid workflow run (kind=run)', () => {
    const result = PanelItemSchema.parse(makeRun());
    expect(result.kind).toBe('run');
  });
  it('rejects unknown source', () => {
    expect(() => PanelItemSchema.parse(makeRun({ source: 'bogus' as any }))).toThrow();
  });
  it('rejects invalid status', () => {
    expect(() => PanelItemSchema.parse(makeRun({ status: 'weird' as any }))).toThrow();
  });
});

describe('PanelEvent', () => {
  it('parses upsert', () => {
    expect(() => PanelEventSchema.parse({ type: 'upsert', seq: 5, item: makeRun() })).not.toThrow();
  });
  it('parses dismiss with itemId only', () => {
    expect(() => PanelEventSchema.parse({ type: 'dismiss', seq: 6, itemId: 'workflow:abc' })).not.toThrow();
  });
  it('parses snapshot with resetClient flag', () => {
    expect(() => PanelEventSchema.parse({ type: 'snapshot', seq: 0, items: [], resetClient: true })).not.toThrow();
  });
  it('rejects snapshot without resetClient', () => {
    expect(() => PanelEventSchema.parse({ type: 'snapshot', seq: 0, items: [] } as any)).toThrow();
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
  alertKind: 'signal' as const,
  status: 'open' as const,
  severity: 'warning',
  type: 'internal:stock',
  title: 'Stock low',
  message: null,
  targetType: null,
  targetId: null,
  operationKey: null,
  sourceType: null,
  sourceId: null,
  isRead: false,
  actionTaskId: null,
  actorUserId: null,
  href: null,
  progress: null,
  metadata: {},
  readAt: null,
  startedAt: null,
  finishedAt: null,
  createdAt: '2026-04-15T00:00:00Z',
  ...overrides,
});

describe('PanelAlertItem', () => {
  it('parses a valid alert item', () => {
    expect(() => PanelAlertItemSchema.parse(makeAlert())).not.toThrow();
  });

  it('preserves alert ledger fields without colliding with the panel kind discriminator', () => {
    const result = PanelAlertItemSchema.parse(makeAlert({
      alertKind: 'operation',
      status: 'running',
      operationKey: 'agent-os.request:00000000-0000-0000-0000-000000000001',
      sourceType: 'agent_run_request',
      sourceId: '00000000-0000-0000-0000-000000000001',
      href: '/agents',
      progress: 0.5,
      metadata: { agentType: 'sourcing' },
      actorUserId: '00000000-0000-0000-0000-000000000099',
      startedAt: '2026-04-15T00:00:00Z',
    }));

    expect(result.kind).toBe('alert');
    expect(result.alertKind).toBe('operation');
    expect(result.status).toBe('running');
    expect(result.operationKey).toBe('agent-os.request:00000000-0000-0000-0000-000000000001');
    expect(result.actorUserId).toBe('00000000-0000-0000-0000-000000000099');
    expect(result.metadata).toEqual({ agentType: 'sourcing' });
  });

  it('PanelItem discriminates alert from run', () => {
    const result = PanelItemSchema.parse(makeAlert());
    expect(result.kind).toBe('alert');
  });

  it.each(['severity', 'type', 'title'])('rejects non-string %s', (field) => {
    expect(() => PanelAlertItemSchema.parse(makeAlert({ [field]: 123 as any }))).toThrow();
  });

  it('message accepts null or string', () => {
    expect(() => PanelAlertItemSchema.parse(makeAlert({ message: null }))).not.toThrow();
    expect(() => PanelAlertItemSchema.parse(makeAlert({ message: 'details here' }))).not.toThrow();
  });

  it('targetType accepts null or string', () => {
    expect(() => PanelAlertItemSchema.parse(makeAlert({ targetType: null }))).not.toThrow();
    expect(() => PanelAlertItemSchema.parse(makeAlert({ targetType: 'product' }))).not.toThrow();
  });

  it('targetId accepts null or valid uuid', () => {
    expect(() => PanelAlertItemSchema.parse(makeAlert({ targetId: null }))).not.toThrow();
    expect(() =>
      PanelAlertItemSchema.parse(makeAlert({ targetId: '00000000-0000-0000-0000-000000000002' })),
    ).not.toThrow();
  });

  it.each(['id', 'targetId', 'actorUserId', 'actionTaskId'])(
    'rejects invalid uuid on %s',
    (field) => {
      expect(() => PanelAlertItemSchema.parse(makeAlert({ [field]: 'not-a-uuid' }))).toThrow();
    },
  );

  it.each(['actorUserId', 'actionTaskId'])('accepts null %s', (field) => {
    expect(() => PanelAlertItemSchema.parse(makeAlert({ [field]: null }))).not.toThrow();
  });

  it('accepts valid uuid actionTaskId', () => {
    expect(() =>
      PanelAlertItemSchema.parse(makeAlert({ actionTaskId: '00000000-0000-0000-0000-000000000099' })),
    ).not.toThrow();
  });
});

describe('PanelRunItem phase/failureType', () => {
  it.each([undefined, null, 'uploading'])('accepts phase = %s', (phase) => {
    expect(() => PanelItemSchema.parse(makeRun({ phase }))).not.toThrow();
  });

  it.each([undefined, null, 'timeout'])('accepts failureType = %s', (failureType) => {
    expect(() => PanelItemSchema.parse(makeRun({ failureType }))).not.toThrow();
  });
});
