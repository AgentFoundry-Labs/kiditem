import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  CoupangCatalogBasicProductV1,
  CoupangCatalogCollectionQuality,
  CoupangCatalogDetailProductV1,
} from '@kiditem/shared/coupang-catalog-snapshot';
import { KiditemInvalidValueError, KiditemNotFoundError } from '@kiditem/shared/errors';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ownerTransaction, ownerTransactionClient } from '../../../../prisma/owner-transaction';
import { lockProductMapping } from '../../../../products/transaction/product-mapping-lock';
import {
  CATALOG_MEDIA_PUBLICATION_PORT,
  type CatalogMediaPublicationPort,
} from '../../../application/port/out/cross-domain/catalog-media-publication.port';
import {
  CHANNELS_PRODUCT_MAPPING_GENERATION_PORT,
  type ChannelsProductMappingGenerationPort,
} from '../../../application/port/out/cross-domain/product-mapping-generation.port';
import {
  CHANNEL_OPTION_RECIPE_PORT,
  type ChannelOptionRecipePort,
} from '../../../application/port/in/channel-option-recipe.port';
import type {
  CatalogAccountScope,
  CatalogPublicationActor,
  ChannelCatalogPublicationPort,
} from '../../../application/port/out/repository/channel-catalog-publication.port';
import { resolveCoupangVendorId } from '../../../domain/account/coupang-account-identity';
import {
  CATALOG_DELETED_STATUS,
  resolveAbsentProducts,
} from '../../../domain/collection/catalog-deletion-confirmation';
import {
  planCatalogDetailTargets,
  type StoredCatalogListing,
} from '../../../domain/collection/catalog-detail-targets';
import { updateChannelCatalogDetails, upsertChannelCatalogBasics } from './channel-catalog-identity-upsert';
import { publishWingCatalogWorkbook } from './channel-catalog-import.repository.adapter';
import { applyRegisteredOptionRecipes } from '../persistence/registered-option-recipes';

const CHANNEL = 'coupang';

/**
 * Wing 카탈로그 실행 kind 셋의 Channels 원장 쓰기(KID-354). 실행 계약의 finish 트랜잭션 안에서 부르고, 반영
 * 출처는 `lastOperationId`·`publicationReference {type: 'operation'}`로 남긴다. `source_import_runs`·
 * `channel_scrape_*`는 읽지도 쓰지도 않는다. 계정 겹침은 실행 잠금(`account:<id>`)이 막는다.
 */
@Injectable()
export class ChannelCatalogPublicationRepositoryAdapter implements ChannelCatalogPublicationPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CATALOG_MEDIA_PUBLICATION_PORT)
    private readonly media: CatalogMediaPublicationPort,
    @Inject(CHANNEL_OPTION_RECIPE_PORT)
    private readonly recipes: ChannelOptionRecipePort,
    @Inject(CHANNELS_PRODUCT_MAPPING_GENERATION_PORT)
    private readonly productMapping: ChannelsProductMappingGenerationPort,
  ) {}

  async assertWingAccount(scope: CatalogAccountScope): Promise<void> {
    const account = await this.prisma.channelAccount.findFirst({
      where: { id: scope.channelAccountId, organizationId: scope.organizationId, status: 'active' },
      select: { channel: true, externalAccountId: true, vendorId: true },
    });
    if (!account) throw new KiditemNotFoundError('CHANNELS_ACCOUNT_NOT_FOUND');
    if (account.channel !== CHANNEL || !resolveCoupangVendorId(account)) {
      throw new KiditemInvalidValueError('CHANNELS_ACCOUNT_INVALID', {
        details: { reason: account.channel !== CHANNEL ? 'catalog_requires_coupang' : 'catalog_requires_vendor' },
      });
    }
  }

  async findDetailsScopeMismatch(
    scope: CatalogAccountScope & { detailTargetProductIds: readonly string[]; absentProductIds: readonly string[] },
  ): Promise<string | null> {
    const ids = [...new Set([...scope.detailTargetProductIds, ...scope.absentProductIds])];
    if (ids.length === 0) return null;
    const rows = await this.prisma.channelListing.findMany({
      where: { organizationId: scope.organizationId, channelAccountId: scope.channelAccountId, externalId: { in: ids } },
      select: { externalId: true, status: true },
    });
    const stored = new Map(rows.map((row) => [row.externalId, row.status]));
    const target = scope.detailTargetProductIds.find((id) => !stored.has(id));
    if (target !== undefined) return target;
    return scope.absentProductIds.find((id) => !stored.has(id) || stored.get(id) === CATALOG_DELETED_STATUS) ?? null;
  }

  async publishList(
    transaction: OwnerTransaction,
    input: CatalogPublicationActor & { products: CoupangCatalogBasicProductV1[] },
  ) {
    const tx = ownerTransactionClient(transaction);
    await lockProductMapping(tx, input.organizationId);
    // 상세 대상은 이번 목록이 쓰기 전의 저장값과 비교해야 한다 (KID-348).
    const plan = planCatalogDetailTargets({
      listed: input.products.map((product) => ({
        externalProductId: product.externalProductId,
        modifiedOn: textValue(product.raw.modifiedOn),
      })),
      stored: await readStoredCatalogListings(tx, input),
    });
    if (input.products.length === 0) {
      return { plan, changes: { createdProductCount: 0, updatedProductCount: 0, createdSkuCount: 0, updatedSkuCount: 0 } };
    }
    const identities = await upsertChannelCatalogBasics(tx, {
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      products: input.products,
      lastImportRunId: null,
      lastOperationId: input.operationId,
      rawSource: 'coupang_catalog_basics',
    });
    await this.media.publishProviderMedia({
      transaction: tx,
      organizationId: input.organizationId,
      userId: input.userId,
      publicationReference: { type: 'operation', id: input.operationId },
      publicationScope: 'basic',
      listings: input.products.map((product) => {
        const listingId = identities.listingIds.get(product.externalProductId)!;
        return {
          listingId,
          channel: CHANNEL,
          displayName: product.displayName ?? product.registeredName ?? product.externalProductId,
          optionIdentityRemaps: remapsOf(identities.identityRemaps, listingId),
          media: product.media,
        };
      }),
    });
    await applyRegisteredOptionRecipes(ownerTransaction(tx), this.recipes, {
      organizationId: input.organizationId,
      channelListingIds: [...identities.listingIds.values()],
    });
    // 목록은 사라진 상품을 끄지 않는다: 삭제 확인을 거친 상세 kind만 바꾼다 (KID-348).
    if (identities.mappingIdentityChanged) await this.productMapping.advance(tx, input.organizationId);
    return { plan, changes: identities.changes };
  }

  async publishDetails(
    transaction: OwnerTransaction,
    input: CatalogPublicationActor & {
      detailTargetProductIds: readonly string[];
      absentProductIds: readonly string[];
      products: CoupangCatalogDetailProductV1[];
      confirmations: Array<{ externalProductId: string; outcome: 'deleted' | 'present' | 'not_found' }>;
    },
  ): Promise<CoupangCatalogCollectionQuality> {
    const tx = ownerTransactionClient(transaction);
    const targets = new Set(input.detailTargetProductIds);
    const outside = input.products.find(({ externalProductId }) => !targets.has(externalProductId));
    if (outside) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', {
        details: { reason: 'catalog_scope_mismatch', externalProductId: outside.externalProductId },
      });
    }
    // 사라진 상품은 삭제로 확인된 것만 바꾼다. 돌아왔거나 확인 못 한 상품은 그대로 둔다 (KID-348).
    const absence = resolveAbsentProducts(input.absentProductIds, input.confirmations);
    if (absence.unexpected.length > 0) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', {
        details: { reason: 'catalog_scope_mismatch', externalProductId: absence.unexpected[0] },
      });
    }
    await lockProductMapping(tx, input.organizationId);
    const applied = await applyCatalogDetails(tx, this.media, this.recipes, input);
    await advanceDetailModifiedOn(tx, input, input.products.map(({ externalProductId }) => externalProductId));
    const deleted = await markCatalogProductsDeleted(tx, { ...input, externalProductIds: absence.deleted });
    if (applied.mappingIdentityChanged || deleted.listings > 0 || deleted.options > 0) {
      await this.productMapping.advance(tx, input.organizationId);
    }
    return {
      detailTargets: input.detailTargetProductIds.length,
      detailApplied: applied.appliedProductIds.length,
      detailUnchanged: applied.unchangedProductIds.length,
      deletedProducts: deleted.listings,
      unconfirmedAbsentProductIds: absence.unconfirmed,
    };
  }

  publishWorkbook(
    transaction: OwnerTransaction,
    input: Parameters<ChannelCatalogPublicationPort['publishWorkbook']>[1],
  ) {
    return publishWingCatalogWorkbook(ownerTransactionClient(transaction), {
      recipes: this.recipes,
      productMapping: this.productMapping,
    }, input);
  }
}

/**
 * 상세를 리스팅·옵션에 반영한다. 같은 상세라 쓰지 않은 상품은 옵션 조합·미디어도 다시 반영하지 않는다.
 */
async function applyCatalogDetails(
  tx: Prisma.TransactionClient,
  mediaPublisher: CatalogMediaPublicationPort,
  recipes: ChannelOptionRecipePort,
  input: CatalogPublicationActor & { products: CoupangCatalogDetailProductV1[] },
) {
  if (input.products.length === 0) {
    return { appliedProductIds: [] as string[], unchangedProductIds: [] as string[], mappingIdentityChanged: false };
  }
  const identities = await updateChannelCatalogDetails(tx, {
    organizationId: input.organizationId,
    channelAccountId: input.channelAccountId,
    products: input.products.map((product) => ({
      externalProductId: product.externalProductId,
      documents: product.documents,
      raw: product.raw,
      media: product.media,
      options: product.options,
    })),
    lastImportRunId: null,
    lastOperationId: input.operationId,
    rawSource: 'coupang_catalog_details',
  });
  const applied = new Set(identities.appliedProductIds);
  const appliedProducts = input.products.filter(({ externalProductId }) => applied.has(externalProductId));
  if (appliedProducts.length > 0) {
    await applyRegisteredOptionRecipes(ownerTransaction(tx), recipes, {
      organizationId: input.organizationId,
      channelListingIds: appliedProducts.map(({ externalProductId }) => identities.listingIds.get(externalProductId)!),
    });
  }
  // Detail and option media are independent observations. Reconcile only the role present in this
  // response; an empty role is intentionally left unchanged.
  for (const scope of ['detail', 'option'] as const) {
    const listings = appliedProducts
      .map((product) => {
        const listingId = identities.listingIds.get(product.externalProductId)!;
        return {
          listingId,
          channel: CHANNEL,
          displayName: product.externalProductId,
          optionIdentityRemaps: remapsOf(identities.identityRemaps, listingId),
          media: product.media
            .filter((item) => item.role === scope)
            .map((item) => ({
              sourceUrl: item.sourceUrl,
              role: item.role,
              sortOrder: item.sortOrder,
              externalOptionId: item.externalOptionId ??
                (item.externalOptionIds?.length === 1 ? item.externalOptionIds[0]! : null),
              ...(item.externalOptionIds ? { externalOptionIds: item.externalOptionIds } : {}),
            })),
        };
      })
      .filter((listing) => listing.media.length > 0);
    if (listings.length === 0) continue;
    await mediaPublisher.publishProviderMedia({
      transaction: tx,
      organizationId: input.organizationId,
      userId: input.userId,
      publicationReference: { type: 'operation', id: input.operationId },
      publicationScope: scope,
      listings,
    });
  }
  return {
    appliedProductIds: identities.appliedProductIds,
    unchangedProductIds: identities.unchangedProductIds,
    mappingIdentityChanged: identities.mappingIdentityChanged,
  };
}

/**
 * 상세를 받은 상품의 `detail.modifiedOn`을 목록이 저장한 `modifiedOn`(구역 이전 행은 평면 값)으로 올린다.
 * 같은 상세라 쓰지 않은 상품도 올린다 — 그래야 다음 동기화가 다시 잡지 않는다(KID-354).
 */
async function advanceDetailModifiedOn(
  tx: Prisma.TransactionClient,
  scope: CatalogAccountScope,
  externalProductIds: readonly string[],
): Promise<void> {
  if (externalProductIds.length === 0) return;
  await tx.$executeRaw`
    UPDATE channel_listings
    SET raw_json = jsonb_set(
          raw_json,
          '{detail,modifiedOn}',
          COALESCE(raw_json -> 'list' -> 'modifiedOn', raw_json -> 'modifiedOn', 'null'::jsonb),
          true
        )
    WHERE organization_id = ${scope.organizationId}::uuid
      AND channel_account_id = ${scope.channelAccountId}::uuid
      AND external_id = ANY(${[...externalProductIds]}::text[])
      AND jsonb_typeof(raw_json -> 'detail') = 'object'
  `;
}

/**
 * Wing이 삭제 상태로 돌려준 상품을 `DELETED`·비활성으로 기록한다. 옵션도 끈다. 확정 구성은 지우지 않는다.
 * 이미 삭제로 기록된 행은 다시 쓰지 않는다.
 */
async function markCatalogProductsDeleted(
  tx: Prisma.TransactionClient,
  input: CatalogAccountScope & { operationId: string; externalProductIds: readonly string[] },
): Promise<{ listings: number; options: number }> {
  if (input.externalProductIds.length === 0) return { listings: 0, options: 0 };
  const options = await tx.channelListingOption.updateMany({
    where: {
      organizationId: input.organizationId,
      listing: {
        organizationId: input.organizationId,
        channelAccountId: input.channelAccountId,
        externalId: { in: [...input.externalProductIds] },
      },
      isActive: true,
    },
    data: { isActive: false, lastImportRunId: null, lastOperationId: input.operationId },
  });
  const listings = await tx.channelListing.updateMany({
    where: {
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      externalId: { in: [...input.externalProductIds] },
      // `<>`는 NULL과 맞지 않는다: 상태가 비어 있는 행도 삭제로 기록해야 한다.
      OR: [{ status: null }, { status: { not: CATALOG_DELETED_STATUS } }],
    },
    data: { status: CATALOG_DELETED_STATUS, isActive: false, lastImportRunId: null, lastOperationId: input.operationId },
  });
  return { listings: listings.count, options: options.count };
}

/**
 * 계정의 저장된 리스팅을 상세 대상 비교에 필요한 만큼만 읽는다. 상세 문서는 크므로 `detail.modifiedOn`만 꺼낸다.
 */
async function readStoredCatalogListings(
  tx: Prisma.TransactionClient,
  scope: CatalogAccountScope,
): Promise<StoredCatalogListing[]> {
  const rows = await tx.$queryRaw<Array<{ externalId: string; status: string | null; detailModifiedOn: string | null }>>`
    SELECT external_id AS "externalId",
           status,
           raw_json -> 'detail' ->> 'modifiedOn' AS "detailModifiedOn"
    FROM channel_listings
    WHERE organization_id = ${scope.organizationId}::uuid
      AND channel_account_id = ${scope.channelAccountId}::uuid
  `;
  return rows.map((row) => ({ externalProductId: row.externalId, detailModifiedOn: row.detailModifiedOn, status: row.status }));
}

function remapsOf(
  remaps: ReadonlyArray<{ listingId: string; oldExternalOptionId: string; newExternalOptionId: string }>,
  listingId: string,
) {
  return remaps
    .filter((remap) => remap.listingId === listingId)
    .map(({ oldExternalOptionId, newExternalOptionId }) => ({ oldExternalOptionId, newExternalOptionId }));
}

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}
