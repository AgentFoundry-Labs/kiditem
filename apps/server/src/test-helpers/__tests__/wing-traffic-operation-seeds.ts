import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { WING_TRAFFIC_KIND, WingTrafficPlanSchema, WingTrafficResultSchema } from '@kiditem/shared/advertising-operations';

// Tests may write operation rows directly to prove readers (ADR-0025 scanner skips `__tests__`); production code
// never does. A run that goes through the real contract is `wingTrafficOperations` in `../wing-traffic-operations`.

type Summary = { visitors: number; views: number; cartAdds: number; orders: number; salesQty: number; revenue: number; providerConversionRate: number | null };
const ZERO: Summary = { visitors: 0, views: 0, cartAdds: 0, orders: 0, salesQty: 0, revenue: 0, providerConversionRate: null };

/**
 * 성공한 `advertising.wing_traffic` 실행 하나를 실행 표에 곧바로 둔다(KID-362). 원장 읽기 테스트가 옛
 * `source_import_runs(coupang_wing_traffic)` 대신 쓰는 커버리지 근거다. 행(listing-day)은 테스트가 따로 둔다.
 */
export async function seedWingTrafficOperation(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    channelAccountId: string;
    confirmedDates: readonly string[];
    providerBackedEmptyDates?: readonly string[];
    accountDaily?: Readonly<Record<string, Partial<Summary>>>;
    periodSummary?: Partial<Summary>;
    unmatchedOptionIdsByDate?: Record<string, string[]>;
    startedAt?: Date;
    finishedAt?: Date;
    id?: string;
    /** 기본 succeeded. 다른 상태는 원장 읽기가 무시하는지 보는 테스트용. */
    status?: 'succeeded' | 'executing' | 'failed';
  },
): Promise<{ id: string }> {
  const id = input.id ?? randomUUID();
  const dates = [...input.confirmedDates].sort();
  const first = dates[0]!;
  const last = dates[dates.length - 1]!;
  const startedAt = input.startedAt ?? new Date();
  const finishedAt = input.finishedAt ?? startedAt;
  const plan = WingTrafficPlanSchema.parse({
    channelAccountId: input.channelAccountId,
    vendorId: 'A0001',
    startDate: first,
    endDate: last,
    expectedDates: dates,
    maxPagesPerDay: 100,
    startedAt: startedAt.toISOString(),
  });
  const result = WingTrafficResultSchema.parse({
    channelAccountId: input.channelAccountId,
    requestedStartDate: first,
    requestedEndDate: last,
    confirmedDates: dates,
    providerBackedEmptyDates: [...(input.providerBackedEmptyDates ?? [])],
    accountDaily: dates.map((businessDate) => ({
      businessDate,
      observedAt: finishedAt.toISOString(),
      operationId: id,
      ...ZERO,
      ...(input.accountDaily?.[businessDate] ?? {}),
    })),
    periodSummary: {
      startDate: first,
      endDate: last,
      observedAt: finishedAt.toISOString(),
      operationId: id,
      accountSummary: { ...ZERO, ...(input.periodSummary ?? {}) },
    },
    rowCount: 0,
    matchedCount: 0,
    unmatchedCount: 0,
    unmatchedOptionIdsByDate: input.unmatchedOptionIdsByDate ?? {},
  });
  await prisma.operation.create({
    data: {
      id,
      organizationId: input.organizationId,
      kind: WING_TRAFFIC_KIND,
      status: input.status ?? 'succeeded',
      token: randomUUID(),
      expiresAt: finishedAt,
      plan,
      result,
      windowStart: new Date(`${first}T00:00:00.000Z`),
      windowEnd: new Date(`${last}T00:00:00.000Z`),
      startedAt,
      finishedAt: (input.status ?? 'succeeded') === 'executing' ? null : finishedAt,
      attempts: 1,
    },
  });
  return { id };
}
