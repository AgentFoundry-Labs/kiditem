import { describe, expect, it, vi } from 'vitest';
import {
  assertLocalDevelopmentDatabase,
  bootstrapAuthoritativeInventoryDevelopment,
  buildBootstrapPlan,
  parseBootstrapArgs,
} from '../bootstrap-authoritative-inventory-dev';

const { ensureFormula } = vi.hoisted(() => ({ ensureFormula: vi.fn() }));
vi.mock('../data-migrations/ensure/absolute-product-abc-formula', () => ({
  ensureAbsoluteProductAbcFormulaForOrganization: ensureFormula,
}));

const organizationId = '11111111-1111-4111-8111-111111111111';
const coupangVendorId = 'VENDOR-DEV-001';

describe('authoritative inventory development bootstrap', () => {
  it('accepts only local, non-production database URLs', () => {
    expect(() => assertLocalDevelopmentDatabase(
      'postgresql://kiditem:kiditem@localhost:5433/kiditem',
    )).not.toThrow();
    expect(() => assertLocalDevelopmentDatabase(
      'postgresql://kiditem:kiditem@127.0.0.1:5433/kiditem_dev',
    )).not.toThrow();

    expect(() => assertLocalDevelopmentDatabase(
      'postgresql://kiditem:kiditem@db.example.com/kiditem',
    )).toThrow(/non-local/i);
    expect(() => assertLocalDevelopmentDatabase(
      'postgresql://kiditem:kiditem@localhost:5433/kiditem_staging',
    )).toThrow(/non-local/i);
    expect(() => assertLocalDevelopmentDatabase(
      'postgresql://kiditem:kiditem@localhost:5433/kiditem_production',
    )).toThrow(/non-local/i);
  });

  it('builds only organization and Wing/Rocket channel-account metadata', () => {
    const args = parseBootstrapArgs([
      '--organization-id', organizationId,
      '--organization-name', 'KidItem Dev',
      '--organization-slug', 'kiditem-dev',
      '--coupang-vendor-id', coupangVendorId,
      '--coupang-account-id', '22222222-2222-4222-8222-222222222222',
      '--rocket-account-id', '33333333-3333-4333-8333-333333333333',
    ]);

    expect(buildBootstrapPlan(args)).toEqual({
      organization: {
        id: organizationId,
        name: 'KidItem Dev',
        slug: 'kiditem-dev',
        isActive: true,
      },
      channelAccounts: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          organizationId,
          channel: 'coupang',
          name: 'Coupang Wing',
          externalAccountId: coupangVendorId,
          vendorId: coupangVendorId,
          status: 'active',
          isPrimary: true,
        },
        {
          id: '33333333-3333-4333-8333-333333333333',
          organizationId,
          channel: 'rocket',
          name: 'Coupang Rocket',
          externalAccountId: coupangVendorId,
          vendorId: coupangVendorId,
          status: 'active',
          isPrimary: true,
        },
      ],
    });
  });

  it('installs the ABC formula for the organization inside the bootstrap transaction', async () => {
    const steps: string[] = [];
    const tx = {
      organization: { upsert: vi.fn(async () => { steps.push('organization'); }) },
      channelAccount: {
        upsert: vi.fn(async ({ create }: { create: { channel: string } }) => {
          steps.push(`channel-account:${create.channel}`);
        }),
      },
    };
    let inTransaction = false;
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<void>) => {
        inTransaction = true;
        try {
          return await callback(tx);
        } finally {
          inTransaction = false;
        }
      }),
    };
    ensureFormula.mockReset().mockImplementation(async (client: unknown, id: string) => {
      steps.push(`formula:${id}:${client === tx && inTransaction}`);
    });

    await bootstrapAuthoritativeInventoryDevelopment(prisma as never, buildBootstrapPlan({
      organizationId,
      organizationName: 'KidItem Dev',
      organizationSlug: 'kiditem-dev',
      coupangVendorId,
    }));

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(ensureFormula).toHaveBeenCalledTimes(1);
    expect(steps).toEqual([
      'organization',
      `formula:${organizationId}:true`,
      'channel-account:coupang',
      'channel-account:rocket',
    ]);
  });

  it('rejects development bootstrap without the real Coupang Vendor ID', () => {
    expect(() => parseBootstrapArgs([
      '--organization-id', organizationId,
      '--organization-name', 'KidItem Dev',
    ])).toThrow(/coupang-vendor-id/i);
  });

  it('keeps accepting a directly built plan with the canonical Vendor ID', () => {
    expect(buildBootstrapPlan({
      organizationId,
      organizationName: 'KidItem Dev',
      organizationSlug: 'kiditem-dev',
      coupangVendorId,
      coupangAccountId: '22222222-2222-4222-8222-222222222222',
      rocketAccountId: '33333333-3333-4333-8333-333333333333',
    }).channelAccounts)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          channel: 'coupang',
          externalAccountId: coupangVendorId,
          vendorId: coupangVendorId,
        }),
        expect.objectContaining({
          channel: 'rocket',
          externalAccountId: coupangVendorId,
          vendorId: coupangVendorId,
        }),
      ]));
  });

  it('parses the documented CLI and rejects missing identity arguments', () => {
    expect(parseBootstrapArgs([
      '--organization-id', organizationId,
      '--organization-name', 'KidItem Dev',
      '--coupang-vendor-id', coupangVendorId,
    ])).toMatchObject({
      organizationId,
      organizationName: 'KidItem Dev',
      organizationSlug: 'kiditem-dev',
      coupangVendorId,
    });

    expect(() => parseBootstrapArgs(['--organization-name', 'KidItem Dev']))
      .toThrow(/organization-id/i);
  });
});
