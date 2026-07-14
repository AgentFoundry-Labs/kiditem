import { describe, expect, it, vi } from 'vitest';
import { ReadinessService } from '../readiness.service';

const ORGANIZATION_ID = '00000000-0000-0000-0000-0000000c0001';

describe('ReadinessService', () => {
  it('reports Agent OS live automation readiness without exposing secrets', async () => {
    const originalEnv = { ...process.env };
    process.env.OPENAI_API_KEY = 'sk-test-secret';
    process.env.AGENT_OS_OPENAI_RESPONSES_MODEL = 'gpt-test';
    delete process.env.AGENT_OS_1688_CHECKOUT_RUNTIME;

    const prisma = {
      channelAccount: {
        findFirst: vi.fn(async () => ({
          vendorId: 'vendor-1',
          externalAccountId: null,
          config: {
            coupangCredentials: {
              accessKey: {
                version: 1,
                algorithm: 'aes-256-gcm',
                iv: 'iv',
                ciphertext: 'access-secret',
                tag: 'tag',
              },
              secretKey: {
                version: 1,
                algorithm: 'aes-256-gcm',
                iv: 'iv',
                ciphertext: 'secret-secret',
                tag: 'tag',
              },
            },
          },
        })),
      },
    };

    try {
      const service = new ReadinessService(prisma as never);
      const status = await service.getAgentOsLiveStatus(ORGANIZATION_ID);

      expect(status.allReady).toBe(false);
      expect(status.checks).toEqual([
        expect.objectContaining({
          key: 'openai_responses_operator',
          status: 'ready',
          requiredFor: ['operator_runtime'],
        }),
        expect.objectContaining({
          key: 'coupang_seller_product_api',
          status: 'ready',
          requiredFor: ['channels.submit_coupang_listing'],
        }),
        expect.objectContaining({
          key: 'alibaba_1688_checkout_runtime',
          status: 'missing',
          requiredFor: [
            'supply.submit_purchase_order',
            'supply.submit_purchase_order_live_checkout',
          ],
        }),
      ]);
      expect(JSON.stringify(status)).not.toContain('sk-test-secret');
      expect(JSON.stringify(status)).not.toContain('access-secret');
      expect(JSON.stringify(status)).not.toContain('secret-secret');
    } finally {
      process.env = originalEnv;
    }
  });

  it('reports missing Agent OS live automation prerequisites', async () => {
    const originalEnv = { ...process.env };
    delete process.env.OPENAI_API_KEY;
    delete process.env.AGENT_OS_OPENAI_RESPONSES_MODEL;
    delete process.env.AGENT_OS_1688_CHECKOUT_RUNTIME;

    const prisma = {
      channelAccount: {
        findFirst: vi.fn(async () => null),
      },
    };

    try {
      const service = new ReadinessService(prisma as never);
      const status = await service.getAgentOsLiveStatus(ORGANIZATION_ID);

      expect(status.allReady).toBe(false);
      expect(status.checks.map((check) => [check.key, check.status])).toEqual([
        ['openai_responses_operator', 'missing'],
        ['coupang_seller_product_api', 'missing'],
        ['alibaba_1688_checkout_runtime', 'missing'],
      ]);
      expect(status.blockedCapabilities).toEqual([
        'operator_runtime',
        'channels.submit_coupang_listing',
        'supply.submit_purchase_order',
        'supply.submit_purchase_order_live_checkout',
      ]);
    } finally {
      process.env = originalEnv;
    }
  });

  it('requires a provider endpoint before marking 1688 checkout runtime ready', async () => {
    const originalEnv = { ...process.env };
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.AGENT_OS_OPENAI_RESPONSES_MODEL = 'gpt-test';
    process.env.AGENT_OS_1688_CHECKOUT_RUNTIME = 'provider';
    delete process.env.AGENT_OS_1688_CHECKOUT_PROVIDER_URL;

    const prisma = {
      channelAccount: {
        findFirst: vi.fn(async () => ({
          vendorId: 'vendor-1',
          externalAccountId: null,
          config: {
            coupangCredentials: {
              accessKey: {
                version: 1,
                algorithm: 'aes-256-gcm',
                iv: 'iv',
                ciphertext: 'access-secret',
                tag: 'tag',
              },
              secretKey: {
                version: 1,
                algorithm: 'aes-256-gcm',
                iv: 'iv',
                ciphertext: 'secret-secret',
                tag: 'tag',
              },
            },
          },
        })),
      },
    };

    try {
      const service = new ReadinessService(prisma as never);
      const missingEndpoint = await service.getAgentOsLiveStatus(ORGANIZATION_ID);
      expect(
        missingEndpoint.checks.find(
          (check) => check.key === 'alibaba_1688_checkout_runtime',
        ),
      ).toMatchObject({
        status: 'missing',
        detail: expect.stringContaining('AGENT_OS_1688_CHECKOUT_PROVIDER_URL'),
      });

      process.env.AGENT_OS_1688_CHECKOUT_PROVIDER_URL =
        'https://checkout.example.test/1688/orders';
      const ready = await service.getAgentOsLiveStatus(ORGANIZATION_ID);
      expect(
        ready.checks.find(
          (check) => check.key === 'alibaba_1688_checkout_runtime',
        ),
      ).toMatchObject({
        status: 'ready',
        requiredFor: [
          'supply.submit_purchase_order',
          'supply.submit_purchase_order_live_checkout',
        ],
      });
    } finally {
      process.env = originalEnv;
    }
  });

  it('includes the KST reference date when querying @db.Date business dates', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-02T01:00:00.000Z'));

    const expectedDates = [
      '2026-04-18',
      '2026-04-19',
      '2026-04-20',
      '2026-04-21',
      '2026-04-22',
      '2026-04-23',
      '2026-04-24',
      '2026-04-25',
      '2026-04-26',
      '2026-04-27',
      '2026-04-28',
      '2026-04-29',
      '2026-04-30',
      '2026-05-01',
    ];
    const row = (businessDate: string) => ({
      businessDate: new Date(`${businessDate}T00:00:00.000Z`),
      lastObservedAt: new Date('2026-05-02T01:00:00.000Z'),
    });

    const prisma = {
      channelAccountDailyKpiSnapshot: {
        findMany: vi.fn(async ({ where }) => {
          if (where.source === 'wing') {
            return expectedDates.map(row);
          }
          return expectedDates.filter((d) => d !== '2026-04-18').map(row);
        }),
        findFirst: vi.fn(async () => ({
          businessDate: new Date('2026-05-02T00:00:00.000Z'),
          lastObservedAt: new Date('2026-05-02T01:00:00.000Z'),
        })),
      },
      rocketPurchaseOrder: {
        findMany: vi.fn(async () => [
          {
            businessDate: new Date('2026-05-14T00:00:00.000Z'),
            updatedAt: new Date('2026-05-02T01:00:00.000Z'),
          },
        ]),
      },
      masterProduct: {
        count: vi.fn(async () => 1752),
        findFirst: vi.fn(async () => ({ updatedAt: new Date('2026-05-02T01:00:00.000Z') })),
      },
    };

    const service = new ReadinessService(prisma as never);
    const status = await service.getStatus(ORGANIZATION_ID);

    const wingQuery = prisma.channelAccountDailyKpiSnapshot.findMany.mock.calls[0][0];
    const adsQuery = prisma.channelAccountDailyKpiSnapshot.findMany.mock.calls[1][0];
    expect(wingQuery.where.businessDate).toEqual({
      gte: new Date('2026-04-18T00:00:00.000Z'),
      lte: new Date('2026-05-01T00:00:00.000Z'),
    });
    expect(adsQuery.where.businessDate.lte).toEqual(new Date('2026-05-01T00:00:00.000Z'));

    const wingSales = status.checks.find((check) => check.key === 'wing_sales');
    const rocketSales = status.checks.find((check) => check.key === 'rocket_sales');
    const coupangAds = status.checks.find((check) => check.key === 'coupang_ads');
    expect(wingSales?.status).toBe('ok');
    expect(rocketSales?.status).toBe('ok');
    expect(coupangAds?.status).toBe('stale');
    expect(coupangAds?.missingDates).toEqual(['2026-04-18']);
  });
});
