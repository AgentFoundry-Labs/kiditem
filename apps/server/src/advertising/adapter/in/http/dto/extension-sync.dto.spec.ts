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
