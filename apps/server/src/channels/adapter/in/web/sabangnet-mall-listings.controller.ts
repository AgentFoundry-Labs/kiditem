import { Controller, Get, Inject } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  SABANGNET_MALL_LISTINGS_PORT,
  type SabangnetMallListingsPort,
} from '../../../application/port/in/sabangnet-mall-listings.port';

/**
 * 사방넷 송신 기록으로 몰 등록 상품을 가져오는 원천(KID-246)의 현재. 시작·진행·중단은 실행 계약
 * (`channels.sabangnet_mall_listings`, KID-363)이 맡는다.
 */
@Controller('channels/sabangnet-listings')
export class SabangnetMallListingsController {
  constructor(
    @Inject(SABANGNET_MALL_LISTINGS_PORT) private readonly listings: SabangnetMallListingsPort,
  ) {}

  @Get('source')
  readSource(@CurrentOrganization() organizationId: string) {
    return this.listings.readSource(organizationId);
  }
}
