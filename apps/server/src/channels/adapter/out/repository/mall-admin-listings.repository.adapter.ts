import { Inject, Injectable } from '@nestjs/common';
import {
  MALL_ADMIN_LISTINGS_SOURCE_TYPE,
  type MallAdminListingRow,
  type MallAdminListingsPlan,
  type MallAdminListingsPublication,
} from '@kiditem/shared/mall-admin-listings';
import type { Prisma } from '@prisma/client';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { ownerTransactionClient } from '../../../../prisma/owner-transaction';
import { lockProductMapping } from '../../../../products/transaction/product-mapping-lock';
import {
  CHANNELS_PRODUCT_MAPPING_GENERATION_PORT,
  type ChannelsProductMappingGenerationPort,
} from '../../../application/port/out/cross-domain/product-mapping-generation.port';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  MallAdminListingsOperationRepositoryPort,
  MallAdminListingsRepositoryPort,
} from '../../../application/port/out/repository/mall-admin-listings.repository.port';
import {
  mallAdminListingProducts,
  resolveMallAdminRowCodes,
  mallAdminStatusCounts,
} from '../../../domain/collection/mall-admin-listings';
import { readMallAccountRowIds } from './mall-account-rows';
import { readMallAdminListingsSource } from './mall-admin-listings.reader';
import { upsertChannelCatalogIdentities } from './channel-catalog-identity-upsert';
import { deactivateCatalogAbsence } from './catalog-absence';

const SOURCE_TYPE = MALL_ADMIN_LISTINGS_SOURCE_TYPE;

/**
 * 몰 관리자 목록의 Channels 원장(KID-363·381). 가져오기는 실행 kind `channels.mall_admin_listings` 하나이고 발행은 finish
 * 트랜잭션 안에서만 한다(`publishOperation`). 옛 시도(`source_import_runs`)를 쓰지도, 실패 알림을 남기지도 않는다(정책 B).
 */
@Injectable()
export class MallAdminListingsRepositoryAdapter implements MallAdminListingsRepositoryPort, MallAdminListingsOperationRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHANNELS_PRODUCT_MAPPING_GENERATION_PORT)
    private readonly productMapping: ChannelsProductMappingGenerationPort,
  ) {}

  readSource(input: Parameters<MallAdminListingsRepositoryPort['readSource']>[0]) {
    return readMallAdminListingsSource(this.prisma, input.organizationId);
  }

  /** 몰 허브가 고르는 그 몰의 계정 행(실행 kind plan, KID-363). 없으면 null. */
  async readMallAccountId(organizationId: string, mallKey: string): Promise<string | null> {
    return (await readMallAccountRowIds(this.prisma, organizationId, [mallKey])).get(mallKey) ?? null;
  }

  /**
   * 실행 kind(`channels.mall_admin_listings`, KID-363)의 발행 — finish 트랜잭션 안에서. 계획 뒤 몰 계정 행이 바뀌었으면
   * 쓰지 않고 거절한다. 반영 출처는 `lastOperationId`이고 `source_import_runs`는 쓰지 않는다.
   */
  async publishOperation(
    transaction: OwnerTransaction,
    input: { organizationId: string; operationId: string; plan: MallAdminListingsPlan; rows: MallAdminListingRow[] },
  ): Promise<MallAdminListingsPublication> {
    const tx = ownerTransactionClient(transaction);
    await lockProductMapping(tx, input.organizationId);
    const account = (await readMallAccountRowIds(tx, input.organizationId, [input.plan.mallKey])).get(input.plan.mallKey);
    if (account !== input.plan.channelAccountId) {
      throw new KiditemInvalidValueError('SOURCE_SNAPSHOT_INVALID', {
        details: { reason: 'mall_account_changed', mallKey: input.plan.mallKey },
      });
    }
    return publishMallAdminListings(tx, this.productMapping, {
      organizationId: input.organizationId,
      plan: input.plan,
      rows: [...input.rows].sort((left, right) => left.mallProductCode.localeCompare(right.mallProductCode)),
      provenance: { operationId: input.operationId },
    });
  }
}

/**
 * 그 몰 계정의 리스팅을 이번 목록으로 바꾼다(실행 kind finalize). 이 원천이 만든 행 중 목록에 없는 것만 끄고, 매칭 신원이
 * 바뀌었으면 매칭 세대를 올린다. 출처는 실행 id다.
 */
async function publishMallAdminListings(
  tx: Prisma.TransactionClient,
  productMapping: ChannelsProductMappingGenerationPort,
  input: {
    organizationId: string;
    plan: MallAdminListingsPlan;
    rows: MallAdminListingRow[];
    provenance: { operationId: string };
  },
): Promise<MallAdminListingsPublication> {
  const { plan, rows } = input;
  const runIds = { lastImportRunId: null, lastOperationId: input.provenance.operationId };
  // 사방넷이 다른 번호로 준 상품은 그 번호의 리스팅에 레시피가 붙어 있다 — 그 번호가 이 계정에 있으면 그 번호를 쓴다.
  const candidateCodes = [...new Set(rows.flatMap((row) => row.alternateCodes ?? []))];
  const existingCodes = candidateCodes.length === 0
    ? new Set<string>()
    : new Set((await tx.channelListing.findMany({
      where: {
        organizationId: input.organizationId,
        channelAccountId: plan.channelAccountId,
        externalId: { in: [...candidateCodes, ...rows.map((row) => row.mallProductCode)] },
      },
      select: { externalId: true },
    })).map((listing) => listing.externalId));
  const products = mallAdminListingProducts(plan, resolveMallAdminRowCodes(rows, existingCodes));
  let mappingChanged = false;
  if (products.length > 0) {
    const upserted = await upsertChannelCatalogIdentities(tx, {
      organizationId: input.organizationId,
      channelAccountId: plan.channelAccountId,
      ...runIds,
      rawSource: SOURCE_TYPE,
      // 몰 관리자 목록은 판매가와 판매자코드를 내주지만 바코드·모델번호 칸은 없다.
      unobservedOptionFields: ['barcode', 'modelNumber'],
      products,
    });
    mappingChanged = upserted.mappingIdentityChanged;
    // 몰이 목록에 사진을 함께 주는 몰(온채널)은 그 주소를 리스팅에 남긴다 — 수집마다 새로 쓴다(KID-313 W3a).
    // 몰의 대표이미지가 바뀌면 리스팅 사진도 바뀌고, 대표이미지 평가는 바뀐 사진에 새 행을 만든다.
    // 신원 upsert 는 사진을 모르므로 여기서 값이 달라진 줄만 쓴다. 사진을 주지 않은 줄은 남긴 사진을 지우지 않는다.
    for (const product of products) {
      const listingId = upserted.listingIds.get(product.externalProductId);
      if (!listingId || !product.imageUrl) continue;
      await tx.channelListing.updateMany({
        where: {
          id: listingId,
          organizationId: input.organizationId,
          OR: [{ imageUrl: null }, { NOT: { imageUrl: product.imageUrl } }],
        },
        data: { imageUrl: product.imageUrl },
      });
    }
  }
  const present = products.map((product) => product.externalProductId);
  const deactivated = await deactivateCatalogAbsence(tx, {
    organizationId: input.organizationId,
    channelAccountId: plan.channelAccountId,
    provenance: input.provenance,
    // 같은 몰 계정에 사방넷 수집이나 KidItem 등록이 만든 행이 함께 있다.
    scope: { kind: 'source', sourceType: SOURCE_TYPE },
    presentExternalProductIds: present,
    // 이 원천은 리스팅 하나에 옵션 한 줄이고 둘의 외부 ID 가 같다.
    presentExternalOptionIds: present,
  });
  mappingChanged ||= deactivated.listings > 0 || deactivated.options > 0;
  if (mappingChanged) await productMapping.advance(tx, input.organizationId);

  return {
    listings: products.length,
    deactivated: deactivated.listings,
    missingNames: rows.filter((row) => row.sellpiaName === null).length,
    codedListings: rows.filter((row) => row.sellerCode !== null).length,
    statuses: mallAdminStatusCounts(products),
  };
}
