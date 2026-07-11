#!/usr/bin/env tsx
import 'dotenv/config';

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

export const CHANNEL_SKU_IDENTITY_SCHEMA_VERSION = 'kiditem.channel-sku-identity.v1';
export const MAX_CHANNEL_SKU_IDENTITY_EXAMPLES = 20;

type ReadonlyQueryClient = Pick<PrismaClient, '$queryRaw'>;
type ViolationExample = Record<string, unknown>;

export type ChannelSkuIdentityReport = {
  schemaVersion: typeof CHANNEL_SKU_IDENTITY_SCHEMA_VERSION;
  passed: boolean;
  channelSkuAccountColumnPresent: boolean;
  violations: {
    activeParentIdentityDuplicates: ViolationExample[];
    channelSkuParentOrganizationMismatches: ViolationExample[];
    parentChannelAccountOrganizationMismatches: ViolationExample[];
    channelSkuParentAccountMismatches: ViolationExample[];
    projectedChannelSkuIdentityDuplicates: ViolationExample[];
  };
};

function bounded(rows: ViolationExample[]): ViolationExample[] {
  return rows.slice(0, MAX_CHANNEL_SKU_IDENTITY_EXAMPLES);
}

export async function checkChannelSkuIdentity(
  prisma: ReadonlyQueryClient,
): Promise<ChannelSkuIdentityReport> {
  const columnRows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'channel_listing_options'
        AND column_name = 'channel_account_id'
    ) AS exists
  `;
  const channelSkuAccountColumnPresent = columnRows[0]?.exists === true;

  const activeParentIdentityDuplicates = bounded(await prisma.$queryRaw<ViolationExample[]>`
    SELECT product.organization_id AS "organizationId",
           product.channel_account_id AS "channelAccountId",
           product.external_id AS "externalId",
           COUNT(*)::int AS "duplicateCount"
    FROM channel_listings product
    WHERE product.is_deleted = false
      AND product.channel_account_id IS NOT NULL
    GROUP BY product.organization_id,
             product.channel_account_id,
             product.external_id
    HAVING COUNT(*) > 1
    ORDER BY product.organization_id,
             product.channel_account_id,
             product.external_id
    LIMIT 20
  `);

  const channelSkuParentOrganizationMismatches = bounded(await prisma.$queryRaw<ViolationExample[]>`
    SELECT sku.id AS "channelSkuId",
           sku.organization_id AS "channelSkuOrganizationId",
           product.id AS "parentId",
           product.organization_id AS "parentOrganizationId"
    FROM channel_listing_options sku
    JOIN channel_listings product
      ON product.id = sku.listing_id
    WHERE sku.organization_id <> product.organization_id
    ORDER BY sku.id
    LIMIT 20
  `);

  const parentChannelAccountOrganizationMismatches = bounded(await prisma.$queryRaw<ViolationExample[]>`
    SELECT product.id AS "parentId",
           product.organization_id AS "parentOrganizationId",
           product.channel_account_id AS "channelAccountId",
           account.organization_id AS "channelAccountOrganizationId"
    FROM channel_listings product
    JOIN channel_accounts account
      ON account.id = product.channel_account_id
    WHERE product.channel_account_id IS NOT NULL
      AND product.organization_id <> account.organization_id
    ORDER BY product.id
    LIMIT 20
  `);

  let channelSkuParentAccountMismatches: ViolationExample[] = [];
  if (channelSkuAccountColumnPresent) {
    channelSkuParentAccountMismatches = bounded(await prisma.$queryRaw<ViolationExample[]>`
      SELECT sku.id AS "channelSkuId",
             sku.organization_id AS "organizationId",
             sku.channel_account_id AS "channelSkuAccountId",
             product.channel_account_id AS "parentChannelAccountId"
      FROM channel_listing_options sku
      JOIN channel_listings product
        ON product.id = sku.listing_id
      WHERE sku.channel_account_id IS NOT NULL
        AND sku.channel_account_id IS DISTINCT FROM product.channel_account_id
      ORDER BY sku.id
      LIMIT 20
    `);
  }

  const projectedChannelSkuIdentityDuplicates = bounded(await prisma.$queryRaw<ViolationExample[]>`
    SELECT sku.organization_id AS "organizationId",
           product.channel_account_id AS "channelAccountId",
           sku.external_option_id AS "externalOptionId",
           COUNT(*)::int AS "duplicateCount"
    FROM channel_listing_options sku
    JOIN channel_listings product
      ON product.id = sku.listing_id
     AND product.organization_id = sku.organization_id
    WHERE product.channel_account_id IS NOT NULL
    GROUP BY sku.organization_id,
             product.channel_account_id,
             sku.external_option_id
    HAVING COUNT(*) > 1
    LIMIT 20
  `);

  const violations = {
    activeParentIdentityDuplicates,
    channelSkuParentOrganizationMismatches,
    parentChannelAccountOrganizationMismatches,
    channelSkuParentAccountMismatches,
    projectedChannelSkuIdentityDuplicates,
  };

  return {
    schemaVersion: CHANNEL_SKU_IDENTITY_SCHEMA_VERSION,
    passed: Object.values(violations).every((examples) => examples.length === 0),
    channelSkuAccountColumnPresent,
    violations,
  };
}

export async function runChannelSkuIdentityPreflight(
  prisma: ReadonlyQueryClient,
  output: (text: string) => void = console.log,
): Promise<0 | 1> {
  const report = await checkChannelSkuIdentity(prisma);
  output(JSON.stringify(report, null, 2));
  return report.passed ? 0 : 1;
}

function createPrisma(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for the channel SKU identity preflight.');
  }

  const prisma = createPrisma(databaseUrl);
  try {
    await prisma.$connect();
    process.exitCode = await runChannelSkuIdentityPreflight(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
