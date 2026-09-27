import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AD_REPORT_KIND } from '@kiditem/shared/advertising-operations';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID as ORG } from '../../test-helpers/real-prisma';
import { advertisingLedgerTestReader } from '../../test-helpers/channel-fact-ports';
import { seedCoupangAdAccount } from '../../test-helpers/ad-ledger-seeds';
import type { PrismaService } from '../../prisma/prisma.service';
import { ownerTransaction } from '../../prisma/owner-transaction';

/**
 * 광고 증거 기준일(KID-372, 옛 `readAdEvidenceCutoff` 규칙 유지): 활성 쿠팡 계정 모두의 가장 최근 성공한
 * `advertising.ad_report` 실행이 닫힌 날(어제)을 **요청하고** 보류했을 때만(확정 창이 그 전날에 끝남) 기준일이 하루 물린다.
 * 어제를 요청조차 하지 않은 실행은 물리지 않는다 — 어제는 아직 수집하지 않은 날이다.
 */
describe('readAdEvidenceCutoff (PG)', () => {
  let prisma: PrismaClient;
  const day = (d: string) => new Date(`${d}T00:00:00.000Z`);

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });
  afterAll(async () => prisma.$disconnect());
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  /** 요청 끝 `requestedEnd`, 확정 창 끝 `confirmedEnd`인 성공 실행. */
  async function reportRun(channelAccountId: string, input: { start: string; requestedEnd: string; confirmedEnd: string; finishedAt: string; status?: string }) {
    await prisma.operation.create({
      data: {
        organizationId: ORG,
        kind: AD_REPORT_KIND,
        status: input.status ?? 'succeeded',
        token: randomUUID(),
        expiresAt: day(input.requestedEnd),
        plan: { channelAccountId, startDate: input.start, endDate: input.requestedEnd },
        windowStart: day(input.start),
        windowEnd: day(input.confirmedEnd),
        finishedAt: new Date(input.finishedAt),
        attempts: 1,
      },
    });
  }

  const cutoff = (closedDay: string) => advertisingLedgerTestReader(prisma as unknown as PrismaService)
    .readAdEvidenceCutoff(ownerTransaction(prisma as never), { organizationId: ORG, closedDay });

  it('holds the cutoff a day when every account\'s newest report requested the closed day and held it', async () => {
    const a = await seedCoupangAdAccount(prisma, { organizationId: ORG, externalAccountId: 'A' });
    const b = await seedCoupangAdAccount(prisma, { organizationId: ORG, externalAccountId: 'B' });
    await reportRun(a.id, { start: '2026-07-10', requestedEnd: '2026-07-17', confirmedEnd: '2026-07-16', finishedAt: '2026-07-18T01:00:00Z' });
    await reportRun(b.id, { start: '2026-07-10', requestedEnd: '2026-07-17', confirmedEnd: '2026-07-16', finishedAt: '2026-07-18T01:10:00Z' });
    // An older report of A that confirmed the day does not count — only the newest does.
    await reportRun(a.id, { start: '2026-07-17', requestedEnd: '2026-07-17', confirmedEnd: '2026-07-17', finishedAt: '2026-07-17T20:00:00Z' });

    expect(await cutoff('2026-07-17')).toBe('2026-07-16');
  });

  it('keeps the closed day when a report requested only through the day before it', async () => {
    const a = await seedCoupangAdAccount(prisma, { organizationId: ORG, externalAccountId: 'A' });
    await reportRun(a.id, { start: '2026-07-10', requestedEnd: '2026-07-16', confirmedEnd: '2026-07-16', finishedAt: '2026-07-17T01:00:00Z' });

    expect(await cutoff('2026-07-17')).toBe('2026-07-17');
  });

  it('keeps the closed day when one active account has no succeeded report or confirmed it', async () => {
    const a = await seedCoupangAdAccount(prisma, { organizationId: ORG, externalAccountId: 'A' });
    const b = await seedCoupangAdAccount(prisma, { organizationId: ORG, externalAccountId: 'B' });
    await reportRun(a.id, { start: '2026-07-10', requestedEnd: '2026-07-17', confirmedEnd: '2026-07-16', finishedAt: '2026-07-18T01:00:00Z' });
    await reportRun(b.id, { start: '2026-07-10', requestedEnd: '2026-07-17', confirmedEnd: '2026-07-16', finishedAt: '2026-07-18T01:00:00Z', status: 'failed' });

    expect(await cutoff('2026-07-17')).toBe('2026-07-17');
  });
});
