import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CHANNEL_SKU_IDENTITY_PREFLIGHT_MARKER,
  assertSafeChannelSkuDbPushWarnings,
} from '../check-channel-sku-db-push-warning.mjs';

const warningSignatures = [
  {
    name: 'channel_listings_org_account_external_id_key',
    text: 'A unique constraint covering the columns `[organization_id,channel_account_id,external_id]` on the table `channel_listings` will be added. If there are existing duplicate values, this will fail.',
  },
  {
    name: 'channel_listings_id_org_account_key',
    text: 'A unique constraint covering the columns `[id,organization_id,channel_account_id]` on the table `channel_listings` will be added. If there are existing duplicate values, this will fail.',
  },
  {
    name: 'channel_listing_options_id_org_key',
    text: 'A unique constraint covering the columns `[id,organization_id]` on the table `channel_listing_options` will be added. If there are existing duplicate values, this will fail.',
  },
  {
    name: 'channel_listing_options_org_account_external_option_key',
    text: 'A unique constraint covering the columns `[organization_id,channel_account_id,external_option_id]` on the table `channel_listing_options` will be added. If there are existing duplicate values, this will fail.',
  },
];

function warningLog(selected) {
  return [
    'Prisma schema loaded from prisma',
    '⚠️  There might be data loss when applying the changes:',
    '',
    ...selected.map(({ text }) => `  • ${text}`),
    '',
    'Use the --accept-data-loss flag to ignore the data loss warnings.',
  ].join('\n');
}

describe('channel SKU Prisma db-push warning guard', () => {
  it('accepts every non-empty subset of the four preflight-covered signatures', () => {
    for (let mask = 1; mask < (1 << warningSignatures.length); mask += 1) {
      const selected = warningSignatures.filter((_, index) => (mask & (1 << index)) !== 0);
      const result = assertSafeChannelSkuDbPushWarnings(
        warningLog(selected),
        CHANNEL_SKU_IDENTITY_PREFLIGHT_MARKER,
      );

      assert.deepEqual(result, selected.map(({ name }) => name));
    }
  });

  it('rejects an empty warning set', () => {
    assert.throws(
      () => assertSafeChannelSkuDbPushWarnings(warningLog([]), CHANNEL_SKU_IDENTITY_PREFLIGHT_MARKER),
      /non-empty|warning/i,
    );
  });

  it('rejects a missing or incorrect repeatable-preflight marker', () => {
    const log = warningLog([warningSignatures[0]]);

    assert.throws(() => assertSafeChannelSkuDbPushWarnings(log, undefined), /preflight marker/i);
    assert.throws(() => assertSafeChannelSkuDbPushWarnings(log, 'stale'), /preflight marker/i);
  });

  it('rejects destructive drop warnings', () => {
    const log = warningLog([
      warningSignatures[0],
      {
        text: 'You are about to drop the column `legacy_id` on the `channel_listing_options` table, which still contains 3 non-null values.',
      },
    ]);

    assert.throws(
      () => assertSafeChannelSkuDbPushWarnings(log, CHANNEL_SKU_IDENTITY_PREFLIGHT_MARKER),
      /unrecognized|destructive|drop/i,
    );
  });

  it('rejects extra and unrecognized unique-constraint warnings', () => {
    const extraWarning = {
      text: 'A unique constraint covering the columns `[organization_id,option_id]` on the table `channel_listing_options` will be added. If there are existing duplicate values, this will fail.',
    };

    assert.throws(
      () => assertSafeChannelSkuDbPushWarnings(
        warningLog([warningSignatures[0], extraWarning]),
        CHANNEL_SKU_IDENTITY_PREFLIGHT_MARKER,
      ),
      /unrecognized|extra/i,
    );
  });

  it('rejects duplicate covered warning signatures', () => {
    assert.throws(
      () => assertSafeChannelSkuDbPushWarnings(
        warningLog([warningSignatures[0], warningSignatures[0]]),
        CHANNEL_SKU_IDENTITY_PREFLIGHT_MARKER,
      ),
      /duplicate/i,
    );
  });
});
