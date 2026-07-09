import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';

import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
import {
  CoupangCatalogService,
  type CoupangListingRow,
  type CoupangProductInput,
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

  /** 재수집 없이 저장된 카탈로그를 다시 매칭(정규화/셀피아 최신 반영) */
  @Post('rematch')
  async rematch(
    @CurrentOrganization() organizationId: string,
  ): Promise<{ total: number; matched: number }> {
    return this.service.rematchListings(organizationId);
  }

  /** 카탈로그 목록(매칭 단품 조인) */
  @Get()
  async list(
    @CurrentOrganization() organizationId: string,
    @Query('onlyBundles') onlyBundles?: string,
    @Query('onlyUnconnected') onlyUnconnected?: string,
  ): Promise<CoupangListingRow[]> {
    return this.service.listListings(organizationId, {
      onlyBundles: onlyBundles === 'true',
      onlyUnconnected: onlyUnconnected === 'true',
    });
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
