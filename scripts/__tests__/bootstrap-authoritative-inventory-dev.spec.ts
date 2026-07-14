import { describe, expect, it } from 'vitest';
import {
  assertLocalDevelopmentDatabase,
  buildBootstrapPlan,
  parseBootstrapArgs,
} from '../bootstrap-authoritative-inventory-dev';

const organizationId = '11111111-1111-4111-8111-111111111111';

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
    expect(buildBootstrapPlan({
      organizationId,
      organizationName: 'KidItem Dev',
      organizationSlug: 'kiditem-dev',
      coupangAccountId: '22222222-2222-4222-8222-222222222222',
      rocketAccountId: '33333333-3333-4333-8333-333333333333',
    })).toEqual({
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
          externalAccountId: 'dev-wing',
          status: 'active',
          isPrimary: true,
        },
        {
          id: '33333333-3333-4333-8333-333333333333',
          organizationId,
          channel: 'rocket',
          name: 'Coupang Rocket',
          externalAccountId: 'dev-rocket',
          status: 'active',
          isPrimary: true,
        },
      ],
    });
  });

  it('parses the documented CLI and rejects missing identity arguments', () => {
    expect(parseBootstrapArgs([
      '--organization-id', organizationId,
      '--organization-name', 'KidItem Dev',
    ])).toMatchObject({
      organizationId,
      organizationName: 'KidItem Dev',
      organizationSlug: 'kiditem-dev',
    });

    expect(() => parseBootstrapArgs(['--organization-name', 'KidItem Dev']))
      .toThrow(/organization-id/i);
  });
});
