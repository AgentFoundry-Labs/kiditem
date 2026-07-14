import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';

import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
import {
  CoupangCatalogService,
  type CoupangListingRow,
  type CoupangListingSource,
  type CoupangProductInput,
  type RocketStatusResult,
  type WingProductInput,
} from '../services/coupang-catalog.service';

/** 쿠팡 로켓 등록 상품 카탈로그 + KidItem 매칭/번들 연결 상태. */
@Controller('orders/rocket/coupang-products')
export class CoupangCatalogController {
  constructor(private readonly service: CoupangCatalogService) {}

  /** 확장 수집 상품 upsert + 셀피아 이름매칭 */
  @Post('sync')
  async sync(
    @CurrentOrganization() organizationId: string,
    @Body() body: { products?: CoupangProductInput[] },
  ): Promise<{ total: number; matched: number; bundleCandidates: number }> {
    const products = body?.products ?? [];
    if (!products.length) throw new BadRequestException('동기화할 쿠팡 상품이 없습니다.');
    return this.service.syncListings(products, organizationId);
  }

  /** WING 수집 상품(옵션ID+상품명) upsert + 셀피아 재고 이름매칭 (검토 대상으로 저장) */
  @Post('wing-sync')
  async wingSync(
    @CurrentOrganization() organizationId: string,
    @Body() body: { products?: WingProductInput[] },
  ): Promise<{ total: number; matched: number; suggested: number; fuzzy: number; unmatched: number }> {
    const products = body?.products ?? [];
    if (!products.length) throw new BadRequestException('동기화할 WING 상품이 없습니다.');
    return this.service.syncWingListings(products, organizationId);
  }

  /** 재수집 없이 저장된 카탈로그를 다시 매칭(정규화/셀피아 최신 반영) */
  @Post('rematch')
  async rematch(
    @CurrentOrganization() organizationId: string,
  ): Promise<{ total: number; matched: number }> {
    return this.service.rematchListings(organizationId);
  }

  /** 카탈로그 목록(매칭 단품 조인). source=wing|purchase_order 로 출처 필터. */
  @Get()
  async list(
    @CurrentOrganization() organizationId: string,
    @Query('onlyBundles') onlyBundles?: string,
    @Query('onlyUnconnected') onlyUnconnected?: string,
    @Query('source') source?: string,
  ): Promise<CoupangListingRow[]> {
    const src: CoupangListingSource | undefined =
      source === 'wing' || source === 'purchase_order' || source === 'vendor_search' ? source : undefined;
    return this.service.listListings(organizationId, {
      onlyBundles: onlyBundles === 'true',
      onlyUnconnected: onlyUnconnected === 'true',
      source: src,
    });
  }

  /** 쿠팡 로켓 등록/미등록 현황(마스터 단위, 실제 상품). 로켓 카탈로그 기준. */
  @Get('rocket-status')
  async rocketStatus(
    @CurrentOrganization() organizationId: string,
  ): Promise<RocketStatusResult> {
    return this.service.rocketRegistrationStatus(organizationId);
  }

  /** 매칭 단품 수정 · 연결완료 상태 반영 */
  @Patch(':id')
  async patch(
    @CurrentOrganization() organizationId: string,
    @Param('id') id: string,
    @Body() body: { matchedOptionId?: string | null; matchStatus?: string; bundleOptionId?: string | null },
  ): Promise<{ ok: true }> {
    await this.service.updateListing(organizationId, id, body ?? {});
    return { ok: true };
  }
}
