#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const CHANNEL_SKU_IDENTITY_PREFLIGHT_MARKER = 'passed';

const UNIQUE_WARNING_SIGNATURES = Object.freeze(new Map([
  [
    'A unique constraint covering the columns `[organization_id,channel_account_id,external_id]` on the table `channel_listings` will be added. If there are existing duplicate values, this will fail.',
    'channel_listings_org_account_external_id_key',
  ],
  [
    'A unique constraint covering the columns `[id,organization_id,channel_account_id]` on the table `channel_listings` will be added. If there are existing duplicate values, this will fail.',
    'channel_listings_id_org_account_key',
  ],
  [
    'A unique constraint covering the columns `[id,organization_id]` on the table `channel_listing_options` will be added. If there are existing duplicate values, this will fail.',
    'channel_listing_options_id_org_key',
  ],
  [
    'A unique constraint covering the columns `[organization_id,channel_account_id,external_option_id]` on the table `channel_listing_options` will be added. If there are existing duplicate values, this will fail.',
    'channel_listing_options_org_account_external_option_key',
  ],
]));

function normalizeWarning(text) {
  return text.replace(/\s+/g, ' ').trim();
}

export function assertSafeChannelSkuDbPushWarnings(log, preflightMarker) {
  if (preflightMarker !== CHANNEL_SKU_IDENTITY_PREFLIGHT_MARKER) {
    throw new Error('Channel SKU identity preflight marker is missing or invalid.');
  }
  if (!/There might be data loss when applying the changes:/i.test(log)
      || !log.includes('--accept-data-loss')) {
    throw new Error('Prisma output is not a warning-only db push refusal.');
  }

  const lines = log.split(/\r?\n/);
  const unexpectedError = lines
    .map((line) => line.trim())
    .find((line) => /^Error:/i.test(line) && !line.includes('--accept-data-loss'));
  if (unexpectedError) {
    throw new Error(`Prisma output contains an extra error: ${unexpectedError}`);
  }

  const warnings = lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith('•'))
    .map((line) => normalizeWarning(line.slice(1)));
  if (warnings.length === 0) {
    throw new Error('A non-empty Prisma warning set is required.');
  }

  const accepted = [];
  const acceptedSet = new Set();
  for (const warning of warnings) {
    const signature = UNIQUE_WARNING_SIGNATURES.get(warning);
    if (!signature) {
      throw new Error(`Unrecognized or extra Prisma db push warning: ${warning}`);
    }
    if (acceptedSet.has(signature)) {
      throw new Error(`Duplicate Prisma db push warning signature: ${signature}`);
    }
    acceptedSet.add(signature);
    accepted.push(signature);
  }
  return accepted;
}

function main() {
  const logPath = process.argv[2];
  if (!logPath) {
    throw new Error('Usage: node scripts/check-channel-sku-db-push-warning.mjs <db-push-log>');
  }
  const accepted = assertSafeChannelSkuDbPushWarnings(
    readFileSync(logPath, 'utf8'),
    process.env.CHANNEL_SKU_IDENTITY_PREFLIGHT,
  );
  console.log(JSON.stringify({ acceptedWarnings: accepted }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
