import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  WingTrackedProductService,
  type WingTrackedSnapshotValuesInput,
} from '../../../application/service/wing-tracked-product.service';
import {
  AddWingTrackedProductDto,
  WingTrackedHistoryQueryDto,
} from './dto';

@Controller('ads/wing-tracked-products')
export class WingTrackedProductController {
  constructor(private readonly service: WingTrackedProductService) {}

  @Get()
  list(@CurrentOrganization() organizationId: string) {
    return this.service.list(organizationId);
  }

  @Post()
  add(
    @Body() body: AddWingTrackedProductDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.addTracker(
      {
        productId: body.productId,
        itemId: body.itemId ?? null,
        vendorItemId: body.vendorItemId ?? null,
        productName: body.productName,
        imagePath: body.imagePath ?? null,
        brandName: body.brandName ?? null,
        categoryHierarchy: body.categoryHierarchy ?? null,
        sourceKeyword: body.sourceKeyword ?? null,
        ...metricsFromDto(body),
      },
      organizationId,
    );
  }

  @Get('history')
  historyBulk(
    @Query() query: WingTrackedHistoryQueryDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.getBulkHistory(query.days ?? 30, organizationId);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.remove(id, organizationId);
  }

  @Get(':id/history')
  history(
    @Param('id') id: string,
    @Query() query: WingTrackedHistoryQueryDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.getHistory(id, query.days ?? 30, organizationId);
  }
}

function metricsFromDto(dto: {
  salePriceKrw?: number | null;
  ratingCount?: number | null;
  ratingAverage?: number | null;
  pvLast28Day?: number | null;
  salesLast28d?: number | null;
  estimatedRevenue28d?: number | null;
  conversionRate28d?: number | null;
}): WingTrackedSnapshotValuesInput {
  return {
    salePriceKrw: dto.salePriceKrw ?? null,
    ratingCount: dto.ratingCount ?? null,
    ratingAverage: dto.ratingAverage ?? null,
    pvLast28Day: dto.pvLast28Day ?? null,
    salesLast28d: dto.salesLast28d ?? null,
    estimatedRevenue28d: dto.estimatedRevenue28d ?? null,
    conversionRate28d: dto.conversionRate28d ?? null,
  };
}
