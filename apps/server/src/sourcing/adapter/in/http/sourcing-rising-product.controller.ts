import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { SourcingRisingProductService } from '../../../application/service/sourcing-rising-product.service';
import { DetectRisingProductsDto } from './dto/sourcing-rising-product.dto';

@Controller('sourcing/rising-products')
export class SourcingRisingProductController {
  constructor(private readonly rising: SourcingRisingProductService) {}

  /** Read today's/most-recent persisted rising-product result (no recompute). */
  @Get()
  async latest(@CurrentOrganization() organizationId: string) {
    return this.rising.getLatest(organizationId);
  }

  /** Recompute rising products from the latest SERP/Wing/trend snapshots and persist. */
  @Post('detect')
  async detect(
    @Body() body: DetectRisingProductsDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.rising.detect({
      organizationId,
      windowDays: body.windowDays,
      limit: body.limit,
    });
  }

  /** Return the persisted result if present, else compute one. */
  @Post('latest')
  async latestOrDetect(
    @Body() body: DetectRisingProductsDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.rising.latestOrDetect({
      organizationId,
      windowDays: body.windowDays,
      limit: body.limit,
    });
  }
}
