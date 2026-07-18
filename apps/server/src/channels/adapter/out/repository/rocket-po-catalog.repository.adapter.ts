import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CompletedSourceArtifactRun,
} from '@kiditem/shared/source-import';
import type { RocketPoCatalogRow } from '@kiditem/shared/rocket-purchase-preview';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  CHANNEL_CATALOG_PRODUCT_PROVISIONING_PORT,
  type ChannelCatalogProductProvisioningPort,
} from '../../../../products/application/port/in/channel-catalog-product-provisioning.port';
import type { RocketPoCatalogRepositoryPort } from '../../../application/port/out/repository/rocket-po-catalog.repository.port';
import { upsertChannelCatalogIdentities } from './channel-catalog-identity-upsert';
import { publishCatalogOperationalProducts } from './channel-catalog-operational-product-publication';
import {
  ensureRocketPoCatalogSnapshot,
  listSavedRocketPos,
  loadSavedRocketCollection,
  ROCKET_PO_CATALOG_SOURCE_TYPE,
} from './rocket-po-catalog-snapshot.repository';

const SOURCE_TYPE = ROCKET_PO_CATALOG_SOURCE_TYPE;
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 120_000 } as const;

type PublishInput = Parameters<RocketPoCatalogRepositoryPort['publish']>[0];

@Injectable()
export class RocketPoCatalogRepositoryAdapter
implements RocketPoCatalogRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHANNEL_CATALOG_PRODUCT_PROVISIONING_PORT)
    private readonly productProvisioner: ChannelCatalogProductProvisioningPort,
  ) {}

  async findActiveRocketAccount(input: {
    organizationId: string;
    channelAccountId: string;
  }) {
    const account = await this.prisma.channelAccount.findFirst({
      where: {
        id: input.channelAccountId,
        organizationId: input.organizationId,
        channel: 'rocket',
        status: 'active',
      },
      select: { vendorId: true },
    });
    if (!account) return null;
    const sharedCoupangAccount = await this.prisma.channelAccount.findFirst({
      where: {
        organizationId: input.organizationId,
        channel: 'coupang',
        status: 'active',
        isPrimary: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: { vendorId: true },
    });
    return {
      vendorId: account.vendorId,
      sharedCoupangVendorId: sharedCoupangAccount?.vendorId ?? null,
    };
  }

  publish(input: PublishInput) {
    return this.prisma.$transaction(async (tx) => {
      const lockKey = `rocket-po-catalog:${input.organizationId}:${input.channelAccountId}`;
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "lock"
        FROM channel_accounts
        WHERE organization_id = ${input.organizationId}::uuid
          AND id = ${input.channelAccountId}::uuid
      `;
      const account = await tx.channelAccount.findFirst({
        where: {
          id: input.channelAccountId,
          organizationId: input.organizationId,
          channel: 'rocket',
          status: 'active',
        },
        select: { vendorId: true },
      });
      if (!account) throw new NotFoundException('Active Rocket channel account not found');
      const sharedCoupangAccount = await tx.channelAccount.findFirst({
        where: {
          organizationId: input.organizationId,
          channel: 'coupang',
          status: 'active',
          isPrimary: true,
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: { id: true, vendorId: true },
      });
      const persistedVendorId = account.vendorId?.trim() ?? '';
      const sharedCoupangVendorId = sharedCoupangAccount?.vendorId?.trim() ?? '';
      if (
        (persistedVendorId.length > 0 && persistedVendorId !== input.vendorId)
        || (sharedCoupangVendorId.length > 0 && sharedCoupangVendorId !== input.vendorId)
      ) {
        throw new ConflictException('Rocket vendor identity changed before publication');
      }
      if (persistedVendorId.length === 0) {
        const claimed = await tx.channelAccount.updateMany({
          where: {
            id: input.channelAccountId,
            organizationId: input.organizationId,
            channel: 'rocket',
            status: 'active',
            vendorId: account.vendorId,
          },
          data: { vendorId: input.vendorId },
        });
        if (claimed.count !== 1) {
          throw new ConflictException('Rocket vendor identity changed before publication');
        }
      }
      if (sharedCoupangAccount && sharedCoupangVendorId.length === 0) {
        const claimed = await tx.channelAccount.updateMany({
          where: {
            id: sharedCoupangAccount.id,
            organizationId: input.organizationId,
            channel: 'coupang',
            status: 'active',
            vendorId: sharedCoupangAccount.vendorId,
          },
          data: { vendorId: input.vendorId },
        });
        if (claimed.count !== 1) {
          throw new ConflictException('Rocket vendor identity changed before publication');
        }
      }

      const products = productsFromRows(input.rows);
      const duplicate = await tx.sourceImportRun.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: input.channelAccountId,
          fileHash: input.artifactHash,
          status: 'completed',
        },
      });
      if (duplicate) {
        await publishIdentities(tx, this.productProvisioner, input, {
          sourceImportRunId: duplicate.id,
          products,
        });
        await ensureRocketPoCatalogSnapshot(tx, input, duplicate.id);
        return {
          run: toCompletedRun(duplicate),
          duplicate: true,
          changes: zeroChanges(),
          identities: await resolveIdentities(tx, input),
        };
      }

      const sourceRun = await tx.sourceImportRun.create({
        data: {
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: input.channelAccountId,
          fileName: input.fileName,
          fileHash: input.artifactHash,
          status: 'running',
          rowCount: input.rows.length,
          createdBy: input.userId,
        },
      });
      const identities = await publishIdentities(tx, this.productProvisioner, input, {
        sourceImportRunId: sourceRun.id,
        products,
      });
      await ensureRocketPoCatalogSnapshot(tx, input, sourceRun.id);
      const completed = await tx.sourceImportRun.update({
        where: { id: sourceRun.id },
        data: {
          status: 'completed',
          importedAt: new Date(),
          publicationSequence: await nextPublicationSequence(tx, input.organizationId),
        },
      });
      return {
        run: toCompletedRun(completed),
        duplicate: false,
        changes: identities.changes,
        identities: await resolveIdentities(tx, input),
      };
    }, TRANSACTION_OPTIONS);
  }

  listSavedPos(input: Parameters<RocketPoCatalogRepositoryPort['listSavedPos']>[0]) {
    return listSavedRocketPos(this.prisma, input);
  }

  loadSavedCollection(
    input: Parameters<RocketPoCatalogRepositoryPort['loadSavedCollection']>[0],
  ) {
    return loadSavedRocketCollection(this.prisma, input);
  }
}

async function publishIdentities(
  tx: Prisma.TransactionClient,
  productProvisioner: ChannelCatalogProductProvisioningPort,
  input: PublishInput,
  context: {
    sourceImportRunId: string;
    products: ReturnType<typeof productsFromRows>;
  },
) {
  const identities = await upsertChannelCatalogIdentities(tx, {
    organizationId: input.organizationId,
    channelAccountId: input.channelAccountId,
    lastImportRunId: context.sourceImportRunId,
    rawSource: SOURCE_TYPE,
    products: context.products,
  });
  await publishCatalogOperationalProducts(tx, productProvisioner, {
    organizationId: input.organizationId,
    userId: input.userId,
    products: context.products,
    persistedListings: identities.persistedListings,
  });
  return identities;
}


function productsFromRows(rows: RocketPoCatalogRow[]) {
  const byProduct = new Map<string, RocketPoCatalogRow>();
  for (const row of rows) {
    if (!byProduct.has(row.productNo)) byProduct.set(row.productNo, row);
  }
  return [...byProduct.values()].map((row) => ({
    externalProductId: row.productNo,
    registeredName: row.productName,
    displayName: row.productName,
    category: null,
    manufacturer: null,
    brand: null,
    productStatus: 'observed',
    raw: { source: SOURCE_TYPE, poLineId: row.poLineId },
    options: [{
      externalOptionId: row.productNo,
      optionName: row.productName,
      salePrice: null,
      sellerSku: row.productNo,
      barcode: row.barcode || null,
      modelNumber: null,
      skuStatus: 'observed',
      attributes: {},
      raw: { source: SOURCE_TYPE, poLineId: row.poLineId },
    }],
  }));
}

async function resolveIdentities(
  tx: Prisma.TransactionClient,
  input: Pick<PublishInput, 'organizationId' | 'channelAccountId' | 'rows'>,
) {
  const productNos = [...new Set(input.rows.map(({ productNo }) => productNo))];
  const options = await tx.channelListingOption.findMany({
    where: {
      organizationId: input.organizationId,
      externalOptionId: { in: productNos },
      listing: { channelAccountId: input.channelAccountId },
    },
    select: { id: true, externalOptionId: true },
  });
  const optionByExternalId = new Map(options.map((option) =>
    [option.externalOptionId, option.id]));
  return input.rows.map((row) => {
    const channelSkuId = optionByExternalId.get(row.productNo);
    if (!channelSkuId) {
      throw new ConflictException(`Rocket identity ${row.productNo} was not persisted`);
    }
    return { poLineId: row.poLineId, channelSkuId };
  });
}

async function nextPublicationSequence(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<bigint> {
  const lockKey = `channel-catalog-sequence:${organizationId}:${SOURCE_TYPE}`;
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "lock"
  `;
  const rows = await tx.$queryRaw<Array<{ publicationSequence: bigint }>>`
    SELECT COALESCE(MAX(publication_sequence), 0::bigint) + 1 AS "publicationSequence"
    FROM source_import_runs
    WHERE organization_id = ${organizationId}::uuid
      AND source_type = ${SOURCE_TYPE}
  `;
  if (rows[0]?.publicationSequence === undefined) {
    throw new ConflictException('Could not allocate Rocket publication sequence');
  }
  return rows[0].publicationSequence;
}

function toCompletedRun(run: {
  id: string;
  sourceType: string;
  channelAccountId: string | null;
  fileName: string | null;
  fileHash: string | null;
  status: string;
  rowCount: number;
  importedAt: Date | null;
  lastVerifiedAt: Date | null;
  verificationCount: number;
  lastTrigger: string | null;
  freshnessGeneration: bigint | null;
  manualFreshExportConfirmedAt: Date | null;
  manualFreshExportConfirmedBy: string | null;
  qualityReport: Prisma.JsonValue | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CompletedSourceArtifactRun {
  if (!run.fileName || !run.fileHash || !run.importedAt || run.status !== 'completed') {
    throw new ConflictException('Rocket catalog run is missing completed provenance');
  }
  return {
    id: run.id,
    sourceType: 'coupang_rocket_po_catalog',
    channelAccountId: run.channelAccountId,
    fileName: run.fileName,
    fileHash: run.fileHash,
    status: 'completed',
    rowCount: run.rowCount,
    importedAt: run.importedAt.toISOString(),
    lastVerifiedAt: run.lastVerifiedAt?.toISOString() ?? null,
    verificationCount: run.verificationCount,
    lastTrigger: null,
    freshnessGeneration: run.freshnessGeneration?.toString() ?? null,
    manualFreshExportConfirmedAt:
      run.manualFreshExportConfirmedAt?.toISOString() ?? null,
    manualFreshExportConfirmedBy: run.manualFreshExportConfirmedBy,
    qualityReport: null,
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}

function zeroChanges() {
  return {
    createdProductCount: 0,
    updatedProductCount: 0,
    createdSkuCount: 0,
    updatedSkuCount: 0,
  };
}
