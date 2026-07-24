import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { ExtensionSyncDto } from './extension-sync.dto';

async function scopeErrors(scope: unknown) {
  const dto = plainToInstance(ExtensionSyncDto, {
    type: 'ad_campaign',
    campaignReportScope: scope,
  });
  return { dto, errors: await validate(dto, { whitelist: true }) };
}

describe('ExtensionSyncDto campaignReportScope', () => {
  it.each(['single_campaign_metadata_raw', 'future_bounded_scope']) (
    'preserves bounded raw authority evidence: %s',
    async (scope) => {
      const { dto, errors } = await scopeErrors(`  ${scope}  `);
      expect(errors).toHaveLength(0);
      expect(dto.campaignReportScope).toBe(scope);
    },
  );

  it.each(['', '   ', 'x'.repeat(65)])('rejects invalid bounded strings', async (scope) => {
    const { errors } = await scopeErrors(scope);
    expect(errors).not.toHaveLength(0);
  });
});

describe('ExtensionSyncDto campaign sweep identity', () => {
  it('preserves the composite browser run attempt and terminal roster counts', async () => {
    const dto = plainToInstance(ExtensionSyncDto, {
      type: 'ad_campaign',
      collectionRunId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      collectionAttempt: 2,
      campaignSweepComplete: true,
      campaignIdentityComplete: true,
      campaignCount: 9,
      rawOnlyCampaignCount: 0,
      campaignDailyCollectionComplete: true,
      campaignDailyWindowDays: 31,
      campaignDailyFrom: '2026-06-24',
      campaignDailyTo: '2026-07-24',
    });

    await expect(validate(dto, { whitelist: true })).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      collectionRunId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      collectionAttempt: 2,
      campaignSweepComplete: true,
      campaignIdentityComplete: true,
      campaignCount: 9,
      rawOnlyCampaignCount: 0,
      campaignDailyCollectionComplete: true,
      campaignDailyWindowDays: 31,
      campaignDailyFrom: '2026-06-24',
      campaignDailyTo: '2026-07-24',
    });
  });

  it.each([
    { collectionRunId: 'not-a-uuid' },
    { collectionAttempt: 0 },
    { collectionAttempt: 2147483648 },
    { campaignCount: -1 },
    { campaignCount: 2147483648 },
    { rawOnlyCampaignCount: -1 },
    { rawOnlyCampaignCount: 2147483648 },
    { campaignDailyWindowDays: 0 },
    { campaignDailyWindowDays: 91 },
    { campaignDailyFrom: '2026/06/24' },
    { campaignDailyTo: 'not-a-date' },
  ])('rejects an invalid sweep field: %j', async (patch) => {
    const dto = plainToInstance(ExtensionSyncDto, {
      type: 'ad_campaign',
      ...patch,
    });

    expect(await validate(dto, { whitelist: true })).not.toHaveLength(0);
  });
});
