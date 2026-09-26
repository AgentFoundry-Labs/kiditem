import { Controller, Get, Inject } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  MALL_ADMIN_LISTINGS_PORT,
  type MallAdminListingsPort,
} from '../../../application/port/in/mall-admin-listings.port';

/**
 * 몰 관리자 화면에서 등록 상품을 직접 가져오는 원천의 현재(KID-246 2단계). 가져오기는 실행 kind
 * `channels.mall_admin_listings`(`POST /api/operations`)다 — 옛 시도 경로(attempts)는 없다(KID-381).
 */
@Controller('channels/mall-admin-listings')
export class MallAdminListingsController {
  constructor(
    @Inject(MALL_ADMIN_LISTINGS_PORT) private readonly listings: MallAdminListingsPort,
  ) {}

  @Get('source')
  readSource(@CurrentOrganization() organizationId: string) {
    return this.listings.readSource({ organizationId });
  }
}
