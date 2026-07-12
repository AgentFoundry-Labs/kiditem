import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SELLPIA_CUTOVER_PREFLIGHT_MARKER,
  assertSafeSellpiaDbPushWarnings,
} from '../check-sellpia-db-push-warning.mjs';

const allowed = [
  {
    name: 'master_products_id_org_key',
    text: 'A unique constraint covering the columns `[id,organization_id]` on the table `master_products` will be added. If there are existing duplicate values, this will fail.',
  },
  {
    name: 'channel_accounts_id_org_key',
    text: 'A unique constraint covering the columns `[id,organization_id]` on the table `channel_accounts` will be added. If there are existing duplicate values, this will fail.',
  },
  {
    name: 'channel_listings_id_org_key',
    text: 'A unique constraint covering the columns `[id,organization_id]` on the table `channel_listings` will be added. If there are existing duplicate values, this will fail.',
  },
  {
    name: 'channel_listing_options_id_org_key',
    text: 'A unique constraint covering the columns `[id,organization_id]` on the table `channel_listing_options` will be added. If there are existing duplicate values, this will fail.',
  },
  {
    name: 'channel_listing_options_org_account_external_option_key',
    text: 'A unique constraint covering the columns `[organization_id,channel_account_id,external_option_id]` on the table `channel_listing_options` will be added. If there are existing duplicate values, this will fail.',
  },
  {
    name: 'content_workspaces_candidate_active_key',
    text: 'A unique constraint covering the columns `[organization_id,source_candidate_id]` on the table `content_workspaces` will be added. If there are existing duplicate values, this will fail.',
  },
];

function warningLog(warnings) {
  return [
    'Prisma schema loaded from prisma',
    '⚠️  There might be data loss when applying the changes:',
    '',
    ...warnings.map(({ text }) => `  • ${text}`),
    '',
    'Use the --accept-data-loss flag to ignore the data loss warnings.',
  ].join('\n');
}

describe('Sellpia 0.1.8 Prisma db-push warning guard', () => {
  it('accepts only the reviewed additive composite-key warning set', () => {
    assert.deepEqual(
      assertSafeSellpiaDbPushWarnings(warningLog(allowed), SELLPIA_CUTOVER_PREFLIGHT_MARKER),
      allowed.map(({ name }) => name),
    );
  });

  it('rejects a missing or stale preflight marker', () => {
    assert.throws(() => assertSafeSellpiaDbPushWarnings(warningLog(allowed), undefined), /preflight marker/i);
    assert.throws(() => assertSafeSellpiaDbPushWarnings(warningLog(allowed), 'stale'), /preflight marker/i);
  });

  for (const text of [
    'You are about to drop the column `legacy_id` on the `channel_listings` table, which still contains 3 non-null values.',
    'You are about to drop the `inventory` table, which is not empty (12 rows).',
    'The column `option_id` on the `order_line_items` table would be dropped and recreated. This will lead to data loss.',
    'A unique constraint covering the columns `[organization_id,unexpected_id]` on the table `orders` will be added. If there are existing duplicate values, this will fail.',
  ]) {
    it(`rejects destructive, renamed, or extra warning: ${text}`, () => {
      assert.throws(
        () => assertSafeSellpiaDbPushWarnings(
          warningLog([...allowed, { text }]),
          SELLPIA_CUTOVER_PREFLIGHT_MARKER,
        ),
        /unapproved|destructive|rename|drop|extra|unrecognized/i,
      );
    });
  }

  it('rejects a non-warning Prisma failure', () => {
    assert.throws(
      () => assertSafeSellpiaDbPushWarnings('Error: P1001 cannot reach database', SELLPIA_CUTOVER_PREFLIGHT_MARKER),
      /warning-only|Prisma output/i,
    );
  });

  it('rejects an additional non-bullet warning marker', () => {
    const log = `${warningLog(allowed)}\nWarning: an additional migration warning was emitted.`;

    assert.throws(
      () => assertSafeSellpiaDbPushWarnings(log, SELLPIA_CUTOVER_PREFLIGHT_MARKER),
      /extra|unapproved|warning/i,
    );
  });
});
