import { describe, expect, it } from 'vitest';
import {
  assertReadyCounts,
  assertLocalRebuildGuard,
  assertSharedRebuildGuard,
  buildCoupangReplayBundle,
  buildSharedBootstrapPlan,
} from '../authoritative-inventory-rebuild';

const organizationId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const coupangAccountId = '00000000-0000-4000-8000-000000000003';

describe('authoritative inventory shared rebuild guard', () => {
  it('requires GitHub Actions, the selected environment, and the exact environment token', () => {
    expect(() => assertSharedRebuildGuard({
      target: 'staging',
      githubEnvironment: 'staging',
      confirmation: 'RESET_STAGING_DATA',
      expectedConfirmation: 'RESET_STAGING_DATA',
      githubActions: 'true',
    })).not.toThrow();

    for (const unsafe of [
      { githubActions: 'false' },
      { githubEnvironment: 'production' },
      { confirmation: 'RESET_PRODUCTION_DATA' },
      { confirmation: 'reset_staging_data' },
    ]) {
      expect(() => assertSharedRebuildGuard({
        target: 'staging',
        githubEnvironment: 'staging',
        confirmation: 'RESET_STAGING_DATA',
        expectedConfirmation: 'RESET_STAGING_DATA',
        githubActions: 'true',
        ...unsafe,
      })).toThrow(/refusing shared database rebuild/i);
    }
  });
});

describe('authoritative inventory local replay guard', () => {
  it('requires a loopback database and the exact local reset token', () => {
    expect(() => assertLocalRebuildGuard({
      databaseUrl: 'postgresql://kiditem:kiditem@localhost:5433/kiditem',
      confirmation: 'RESET_LOCAL_DATA',
      expectedConfirmation: 'RESET_LOCAL_DATA',
    })).not.toThrow();
    expect(() => assertLocalRebuildGuard({
      databaseUrl: 'postgresql://kiditem:kiditem@db.example.com:5432/kiditem',
      confirmation: 'RESET_LOCAL_DATA',
      expectedConfirmation: 'RESET_LOCAL_DATA',
    })).toThrow(/local development database/i);
    expect(() => assertLocalRebuildGuard({
      databaseUrl: 'postgresql://kiditem:kiditem@localhost:5433/kiditem',
      confirmation: 'reset_local_data',
      expectedConfirmation: 'RESET_LOCAL_DATA',
    })).toThrow(/local rebuild/i);
  });
});

describe('authoritative inventory shared rebuild baseline', () => {
  it('contains only the minimum organization, user, membership, and account rows', () => {
    expect(buildSharedBootstrapPlan({
      organizationId,
      organizationName: 'KidItem Staging',
      organizationSlug: 'kiditem-staging',
      userId,
      userEmail: 'operator@example.test',
      userName: 'Operator',
      coupangAccountId,
      coupangExternalAccountId: 'wing-account',
      coupangAccountName: 'Coupang Wing',
    })).toEqual({
      organization: {
        id: organizationId,
        name: 'KidItem Staging',
        slug: 'kiditem-staging',
        isActive: true,
      },
      user: {
        id: userId,
        email: 'operator@example.test',
        name: 'Operator',
        role: 'admin',
        type: 'human',
        isActive: true,
      },
      membership: {
        organizationId,
        userId,
        role: 'admin',
        status: 'active',
      },
      channelAccounts: [{
        id: coupangAccountId,
        organizationId,
        channel: 'coupang',
        name: 'Coupang Wing',
        externalAccountId: 'wing-account',
        status: 'active',
        isPrimary: true,
        config: null,
      }],
    });
  });
});

describe('authoritative inventory Coupang replay bundle', () => {
  it('reconstructs only replayable scrape payloads and derives acceptance counts', () => {
    const bundle = buildCoupangReplayBundle({
      target: 'staging',
      originRunId: '12345',
      organizationId,
      runs: [{
        id: 'legacy-run-id',
        source: 'wing',
        pageType: 'itemwinner',
        businessDate: new Date('2026-07-10T00:00:00.000Z'),
        periodStart: null,
        periodEnd: null,
        period: null,
        targetUrl: 'https://wing.example.test/products',
        metaJson: { kpis: { active: 12 }, credentials: 'must-not-copy' },
        snapshots: [{
          rawJson: {
            externalId: 'listing-1',
            vendorItemId: 'option-1',
            password: 'raw-password',
            nested: { authorization: 'Bearer raw-token', metric: 3 },
            customerEmail: 'buyer@example.test',
          },
          normalizedJson: { vendorItemId: 'option-1', cookie: 'session-cookie' },
        }],
      }],
      factCounts: {
        scrapeRuns: 1,
        rawSnapshots: 1,
        listingDailyFacts: 1,
        optionDailyFacts: 1,
        adTargetFacts: 0,
        accountKpiFacts: 1,
      },
      createdAt: '2026-07-13T00:00:00.000Z',
    });

    expect(bundle).toMatchObject({
      schemaVersion: 'kiditem.authoritative-inventory-rebuild.v1',
      target: 'staging',
      originRunId: '12345',
      organizationId,
      expectedReplayCounts: {
        scrapeRuns: 1,
        rawSnapshots: 1,
        listingDailyFacts: 1,
        optionDailyFacts: 1,
        adTargetFacts: 0,
        accountKpiFacts: 1,
      },
      payloads: [{
        sourceRunId: 'legacy-run-id',
        body: {
          type: 'raw_scrape',
          source: 'wing',
          data: [{
            externalId: 'listing-1',
            vendorItemId: 'option-1',
            nested: { metric: 3 },
          }],
          normalizedRows: [{ vendorItemId: 'option-1' }],
          kpis: { active: 12 },
        },
      }],
    });
    const serialized = JSON.stringify(bundle);
    expect(serialized).not.toMatch(/must-not-copy|raw-password|raw-token|session-cookie|buyer@example\.test/i);
    expect(serialized).not.toMatch(/password|secret|credential|order|review/i);
  });
});

describe('authoritative inventory rebuild readiness', () => {
  it('fails closed until both authenticated imports and all configured counts exist', () => {
    const expected = {
      activeMasters: 1964,
      listings: 1225,
      channelSkus: 2241,
    };
    const actual = {
      completedSellpiaImports: 1,
      completedWingImports: 1,
      activeMasters: 1964,
      listings: 1225,
      channelSkus: 2241,
    };

    expect(() => assertReadyCounts(actual, expected)).not.toThrow();
    expect(() => assertReadyCounts({ ...actual, completedSellpiaImports: 0 }, expected))
      .toThrow(/Sellpia/i);
    expect(() => assertReadyCounts({ ...actual, completedWingImports: 0 }, expected))
      .toThrow(/Wing/i);
    expect(() => assertReadyCounts({ ...actual, channelSkus: 2240 }, expected))
      .toThrow(/channel SKUs/i);
  });
});
