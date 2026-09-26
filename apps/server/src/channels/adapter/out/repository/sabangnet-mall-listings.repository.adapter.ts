import { Inject, Injectable } from '@nestjs/common';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import {
  SABANGNET_MALL_LISTINGS_SOURCE_TYPE,
  sabangnetShopIdsByMallKey,
  type SabangnetMallListingsPublication,
} from '@kiditem/shared/sabangnet-mall-listings';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ownerTransactionClient } from '../../../../prisma/owner-transaction';
import { lockProductMapping } from '../../../../products/transaction/product-mapping-lock';
import {
  CHANNELS_PRODUCT_MAPPING_GENERATION_PORT,
  type ChannelsProductMappingGenerationPort,
} from '../../../application/port/out/cross-domain/product-mapping-generation.port';
import type { SabangnetMallListingsRepositoryPort } from '../../../application/port/out/repository/sabangnet-mall-listings.repository.port';
import { sabangnetListingsByAccount } from '../../../domain/collection/sabangnet-mall-listings';
import { readMallAccountRowIds } from './mall-account-rows';
import { upsertChannelCatalogIdentities } from './channel-catalog-identity-upsert';
import { deactivateCatalogAbsence } from './catalog-absence';

const SOURCE_TYPE = SABANGNET_MALL_LISTINGS_SOURCE_TYPE;

/**
 * 사방넷 몰 목록 kind(KID-363)의 Channels 원장 쓰기. 반영 출처는 `lastOperationId`이고 `source_import_runs`는
 * 읽지도 쓰지도 않는다. 실행 겹침은 실행 잠금(`resource:sabangnet:login`)이, 몰 계정 여러 곳의 리스팅 쓰기와
 * 매칭 세대는 finish 트랜잭션 안의 매칭 잠금이 지킨다.
 */
@Injectable()
export class SabangnetMallListingsRepositoryAdapter implements SabangnetMallListingsRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHANNELS_PRODUCT_MAPPING_GENERATION_PORT)
    private readonly productMapping: ChannelsProductMappingGenerationPort,
  ) {}

  async readMalls(organizationId: string) {
    const shopIds = sabangnetShopIdsByMallKey();
    const accounts = await readMallAccountRowIds(this.prisma, organizationId, [...shopIds.keys()]);
    return [...shopIds].map(([mallKey, ids]) => ({
      mallKey,
      channelAccountId: accounts.get(mallKey) ?? null,
      sabangnetShopIds: [...ids],
    }));
  }

  async publish(
    transaction: OwnerTransaction,
    input: Parameters<SabangnetMallListingsRepositoryPort['publish']>[1],
  ): Promise<SabangnetMallListingsPublication[]> {
    const tx = ownerTransactionClient(transaction);
    // 발행이 몰 계정 여러 곳의 리스팅을 바꾸므로 매칭 잠금을 먼저 잡는다.
    await lockProductMapping(tx, input.organizationId);
    // 계획을 세운 뒤 몰 계정 행이 바뀌었으면 쇼핑몰 현황이 보는 행과 다른 행에 쓰게 된다.
    const accounts = await readMallAccountRowIds(tx, input.organizationId, input.plan.malls.map((mall) => mall.mallKey));
    const changed = input.plan.malls.find((mall) => accounts.get(mall.mallKey) !== mall.channelAccountId);
    if (changed) {
      throw new KiditemInvalidValueError('SOURCE_SNAPSHOT_INVALID', {
        details: { reason: 'mall_account_changed', mallKey: changed.mallKey },
      });
    }

    const products = sabangnetListingsByAccount(input.plan, input.rows);
    const publication: SabangnetMallListingsPublication[] = [];
    let mappingChanged = false;
    for (const mall of input.plan.malls) {
      const listings = products.get(mall.channelAccountId) ?? [];
      if (listings.length > 0) {
        const upserted = await upsertChannelCatalogIdentities(tx, {
          organizationId: input.organizationId,
          channelAccountId: mall.channelAccountId,
          lastImportRunId: null,
          lastOperationId: input.operationId,
          rawSource: SOURCE_TYPE,
          // 사방넷 송신 기록은 판매가·모델명(=판매자코드)·바코드를 싣지만 모델번호 칸은 없다.
          unobservedOptionFields: ['modelNumber'],
          products: listings,
        });
        mappingChanged ||= upserted.mappingIdentityChanged;
      }
      const present = listings.map((listing) => listing.externalProductId);
      const deactivated = await deactivateCatalogAbsence(tx, {
        organizationId: input.organizationId,
        channelAccountId: mall.channelAccountId,
        provenance: { operationId: input.operationId },
        // 같은 몰 계정에 KidItem 등록이나 몰 관리자 수집이 만든 행이 함께 있다.
        scope: { kind: 'source', sourceType: SOURCE_TYPE },
        presentExternalProductIds: present,
        // 이 원천은 리스팅 하나에 옵션 한 줄이고 둘의 외부 ID 가 같다.
        presentExternalOptionIds: present,
      });
      mappingChanged ||= deactivated.listings > 0 || deactivated.options > 0;
      publication.push({
        mallKey: mall.mallKey,
        channelAccountId: mall.channelAccountId,
        listings: listings.length,
        deactivated: deactivated.listings,
      });
    }
    if (mappingChanged) await this.productMapping.advance(tx, input.organizationId);
    return publication;
  }
}
