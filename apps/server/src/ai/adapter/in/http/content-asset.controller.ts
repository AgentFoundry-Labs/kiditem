import { Controller, Get, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { ContentAssetService } from '../../../application/service/content-asset.service';
import { ListContentAssetsQueryDto } from './dto/content-asset.dto';

@Controller('ai/content-assets')
export class ContentAssetController {
  constructor(private readonly contentAssets: ContentAssetService) {}

  @Get()
  list(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListContentAssetsQueryDto,
  ) {
    return this.contentAssets.listAssets(organizationId, {
      page: query.page,
      limit: query.limit,
      productId: query.productId ?? null,
      generationId: query.generationId ?? null,
    });
  }
}
