import { describe, expect, it, vi } from 'vitest';
import { ERROR_DEFINITIONS } from '@kiditem/shared/errors';
import { SourceFailureAlerts } from './alerts.service';

const ORGANIZATION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER_ORGANIZATION_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ATTEMPT_ID_1 = '11111111-1111-4111-8111-111111111111';
const ATTEMPT_ID_2 = '22222222-2222-4222-8222-222222222222';
const ALERT_ID = '33333333-3333-4333-8333-333333333333';
const DEDUPE_KEY = 'sellpia:profitability:2026-08';
const READ_AT = new Date('2026-09-03T00:10:00.000Z');

/** Columns the schema cutover drops. Nothing this module writes names them. */
const RETIRED_COLUMNS = ['isRead', 'kind', 'severity'];

type AlertState = Record<string, unknown> & {
  organizationId: string;
  dedupeKey: string;
  attemptId: string;
  status: string;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function failure(attemptId = ATTEMPT_ID_1) {
  return {
    organizationId: ORGANIZATION_ID,
    dedupeKey: DEDUPE_KEY,
    sourceType: 'sellpia_product_profitability',
    attemptId,
    code: 'SELLPIA_SUPPLY_PRICE_MISSING',
    title: 'Sellpia 수익성 수집 실패',
    message: '공급가를 확인할 수 없습니다.',
    href: '/analytics/sellpia-product-sales',
  };
}

function existingAlert(overrides: Partial<AlertState> = {}): AlertState {
  const createdAt = new Date('2026-09-03T00:00:00.000Z');
  return {
    id: ALERT_ID,
    organizationId: ORGANIZATION_ID,
    dedupeKey: DEDUPE_KEY,
    sourceType: 'sellpia_product_profitability',
    attemptId: ATTEMPT_ID_1,
    title: 'Sellpia 수익성 수집 실패',
    message: '공급가를 확인할 수 없습니다.',
    href: '/analytics/sellpia-product-sales',
    status: 'OPEN',
    readAt: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

/**
 * A tiny persistence double that models the observable Alert row. The tests
 * intentionally exercise only the public service methods; they do not assert
 * which Prisma lookup primitive the adapter uses.
 */
function makeDb(initial: AlertState | null = null) {
  let row = initial;
  const now = () => new Date('2026-09-03T01:00:00.000Z');
  const matches = (where: Record<string, unknown>) => {
    if (!row) return false;
    const compound = where.organizationId_dedupeKey as
      | { organizationId: string; dedupeKey: string }
      | undefined;
    return compound
      ? row.organizationId === compound.organizationId && row.dedupeKey === compound.dedupeKey
      : Object.entries(where).every(([key, value]) => {
          if (key === 'status' && value && typeof value === 'object' && 'in' in value) {
            return (value as { in: string[] }).in.includes(row!.status);
          }
          return row![key] === value;
        });
  };
  const alert = {
    findUnique: vi.fn(async () => row),
    findFirst: vi.fn(async () => row),
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      row && row.organizationId === where.organizationId ? [row] : []),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      row = {
        ...(data as AlertState),
        id: ALERT_ID,
        createdAt: now(),
        updatedAt: now(),
      };
      return row;
    }),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      if (!row) throw new Error('missing row');
      row = { ...row, ...data, updatedAt: now() };
      return row;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      if (!matches(where)) return { count: 0 };
      row = { ...row!, ...data, updatedAt: now() };
      return { count: 1 };
    }),
  };
  return { db: { alert } as any, getRow: () => row };
}

function expectNoRetiredColumns(row: AlertState | null) {
  for (const column of RETIRED_COLUMNS) {
    expect(row).not.toHaveProperty(column);
  }
}

describe('SourceFailureAlerts', () => {
  it('creates one focused source-failure row in the supplied transaction', async () => {
    const { db, getRow } = makeDb();
    const alerts = new SourceFailureAlerts(db);

    await alerts.recordTerminalOutcome(db, failure());

    expect(getRow()).toMatchObject({
      organizationId: ORGANIZATION_ID,
      dedupeKey: DEDUPE_KEY,
      sourceType: 'sellpia_product_profitability',
      attemptId: ATTEMPT_ID_1,
      status: 'OPEN',
      readAt: null,
    });
    expectNoRetiredColumns(getRow());
  });

  it('treats replay of the same attempt as a true no-op', async () => {
    const original = existingAlert({ readAt: READ_AT });
    const { db, getRow } = makeDb(original);
    const alerts = new SourceFailureAlerts(db);
    const before = { ...getRow()! };

    await alerts.recordTerminalOutcome(db, failure(ATTEMPT_ID_1));

    expect(getRow()).toEqual(before);
    expect(db.alert.update).not.toHaveBeenCalled();
    expect(db.alert.updateMany).not.toHaveBeenCalled();
  });

  it('reopens the same dedupe row unread for a newer failed attempt', async () => {
    const { db, getRow } = makeDb(existingAlert({ readAt: READ_AT }));
    const alerts = new SourceFailureAlerts(db);

    await alerts.recordTerminalOutcome(db, failure(ATTEMPT_ID_2));

    expect(getRow()).toMatchObject({
      id: ALERT_ID,
      dedupeKey: DEDUPE_KEY,
      attemptId: ATTEMPT_ID_2,
      status: 'OPEN',
      readAt: null,
    });
    expectNoRetiredColumns(getRow());
  });

  it('resolves the open dedupe row for the completing attempt and leaves read state alone', async () => {
    const { db, getRow } = makeDb(existingAlert({ readAt: READ_AT }));
    const alerts = new SourceFailureAlerts(db);

    await alerts.resolveSourceFailure(db, {
      organizationId: ORGANIZATION_ID,
      dedupeKey: DEDUPE_KEY,
      attemptId: ATTEMPT_ID_2,
    });

    expect(getRow()).toMatchObject({ status: 'RESOLVED', readAt: READ_AT, attemptId: ATTEMPT_ID_2 });

    // A replay after resolution is a no-op: the row is no longer OPEN.
    await alerts.resolveSourceFailure(db, {
      organizationId: ORGANIZATION_ID,
      dedupeKey: DEDUPE_KEY,
      attemptId: ATTEMPT_ID_2,
    });
    expect(getRow()).toMatchObject({ status: 'RESOLVED', readAt: READ_AT, attemptId: ATTEMPT_ID_2 });
  });

  /**
   * The three rules the module took over from its callers. Each was the
   * caller's homework and each was done differently at 24 call sites.
   */
  it('does not alert when the operator cancelled the collection', async () => {
    const { db, getRow } = makeDb(existingAlert());
    const alerts = new SourceFailureAlerts(db);

    await alerts.recordTerminalOutcome(db, { ...failure(ATTEMPT_ID_2), code: 'USER_CANCELLED' });

    // Nothing moves. A failure the source had before is still true — the
    // operator cancelling a *later* attempt did not fix it — so the open row
    // stays open and the newer attempt id is not written over it.
    expect(getRow()).toMatchObject({ status: 'OPEN', attemptId: ATTEMPT_ID_1 });
  });

  it('still alerts when an attempt expired', async () => {
    const { db, getRow } = makeDb();
    const alerts = new SourceFailureAlerts(db);

    await alerts.recordTerminalOutcome(db, { ...failure(ATTEMPT_ID_2), code: 'ATTEMPT_EXPIRED' });

    // A collection that never finished is something the operator wants to know
    // about — unlike one they stopped themselves.
    expect(getRow()).toMatchObject({ status: 'OPEN' });
  });

  it('writes the registry sentence for the code, never the producer text (credentials cannot leak)', async () => {
    const { db, getRow } = makeDb();
    const alerts = new SourceFailureAlerts(db);

    await alerts.recordTerminalOutcome(db, {
      ...failure(ATTEMPT_ID_2),
      code: 'ATTEMPT_EXPIRED',
      title: 'Wing catalog collection failed',
      message: `token=abcd1234 Order collection expired. ${'x'.repeat(400)}`,
    });

    expect(getRow()).toMatchObject({
      title: '셀피아 수익성 수집 실패',
      message: ERROR_DEFINITIONS.ATTEMPT_EXPIRED.text,
    });
  });

  it('keeps a Korean producer title and gives an unknown code the source-level sentence', async () => {
    const { db, getRow } = makeDb();
    const alerts = new SourceFailureAlerts(db);

    await alerts.recordTerminalOutcome(db, failure(ATTEMPT_ID_2));

    expect(getRow()).toMatchObject({
      title: 'Sellpia 수익성 수집 실패',
      message: '셀피아 수익성 수집 작업이 실패했습니다. 다시 시도해 주세요.',
    });
  });

  it('lists and dismisses only alerts in the authenticated organization', async () => {
    const { db, getRow } = makeDb(existingAlert());
    const alerts = new SourceFailureAlerts(db);

    await alerts.list(ORGANIZATION_ID);
    expect(db.alert.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: ORGANIZATION_ID }),
    }));

    await expect(alerts.dismiss(ALERT_ID, OTHER_ORGANIZATION_ID)).rejects.toThrow();
    expect(getRow()!.readAt).toBeNull();

    await alerts.dismiss(ALERT_ID, ORGANIZATION_ID);
    // Dismissal stamps `readAt`, the one fact read state is derived from.
    expect(getRow()).toMatchObject({ readAt: expect.any(Date) });
    expectNoRetiredColumns(getRow());
  });
});
