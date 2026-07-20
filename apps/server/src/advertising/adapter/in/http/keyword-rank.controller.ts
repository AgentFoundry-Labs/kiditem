import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { KeywordRankService } from '../../../application/service/keyword-rank.service';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  CreateKeywordTrackerDto,
  KeywordRankHistoryQueryDto,
  KeywordProductRankQueryDto,
  KeywordSerpQueryDto,
  SetRepresentativeKeywordDto,
  UpdateKeywordTrackerDto,
} from './dto';

@Controller('ads/keyword-rank')
export class KeywordRankController {
  constructor(private readonly keywordRankService: KeywordRankService) {}

  @Get('trackers')
  listTrackers(@CurrentOrganization() organizationId: string) {
    return this.keywordRankService.listTrackers(organizationId);
  }

  @Post('trackers')
  createTracker(
    @Body() body: CreateKeywordTrackerDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.keywordRankService.createTracker(body, organizationId);
  }

  @Patch('trackers/:id')
  updateTracker(
    @Param('id') id: string,
    @Body() body: UpdateKeywordTrackerDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.keywordRankService.updateTracker(id, body, organizationId);
  }

  @Delete('trackers/:id')
  deleteTracker(
    @Param('id') id: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.keywordRankService.deleteTracker(id, organizationId);
  }

  @Get('history')
  getHistory(
    @Query() query: KeywordRankHistoryQueryDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.keywordRankService.getHistory(
      query.keyword,
      query.days ?? 30,
      organizationId,
    );
  }

  @Get('products')
  getProductRanks(
    @Query() query: KeywordProductRankQueryDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.keywordRankService.getProductRankOverview(
      query.days ?? 30,
      organizationId,
    );
  }

  @Patch('products/:vendorItemId/keyword')
  setRepresentativeKeyword(
    @Param('vendorItemId') vendorItemId: string,
    @Body() body: SetRepresentativeKeywordDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.keywordRankService.setRepresentativeKeyword(
      vendorItemId,
      body.keyword,
      organizationId,
    );
  }

  @Delete('products/:vendorItemId/keyword')
  resetRepresentativeKeyword(
    @Param('vendorItemId') vendorItemId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.keywordRankService.resetRepresentativeKeyword(
      vendorItemId,
      organizationId,
    );
  }

  @Get('wing-targets')
  getWingSalesRankTargets(
    @CurrentOrganization() organizationId: string,
  ) {
    return this.keywordRankService.getWingSalesRankTargets(organizationId);
  }

  @Get('serp')
  getLatestSerp(
    @Query() query: KeywordSerpQueryDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.keywordRankService.getLatestSerp(query.keyword, organizationId);
  }
}
