import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { TrendCollectService } from '../../../application/service/trend-collect.service';
import { TrendQueryService } from '../../../application/service/trend-query.service';
import {
  CollectTrendDto,
  TrendHistoryQueryDto,
  UpdateTrendSeedDto,
  UpsertTrendSeedDto,
} from './dto';

const DEFAULT_NAVER_KEYWORD_DAYS = 30;
const DEFAULT_TREND_HISTORY_DAYS = 7;

@Controller('sourcing/trend')
export class TrendCollectionController {
  constructor(
    private readonly collectService: TrendCollectService,
    private readonly queryService: TrendQueryService,
  ) {}

  @Post('collect')
  collect(
    @Body() body: CollectTrendDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.collectService.collect(organizationId, body.sources);
  }

  @Get('seeds')
  async listSeeds(@CurrentOrganization() organizationId: string) {
    const seeds = await this.collectService.listSeeds(organizationId);
    return { seeds: seeds.map(toSeedResponse) };
  }

  @Post('seeds')
  async upsertSeed(
    @Body() body: UpsertTrendSeedDto,
    @CurrentOrganization() organizationId: string,
  ) {
    const seed = await this.collectService.upsertSeed({
      organizationId,
      keyword: body.keyword,
      keywordCn: body.keywordCn,
      sources: body.sources,
    });
    return { seed: toSeedResponse(seed) };
  }

  @Patch('seeds/:id')
  async updateSeed(
    @Param('id') id: string,
    @Body() body: UpdateTrendSeedDto,
    @CurrentOrganization() organizationId: string,
  ) {
    const seed = await this.collectService.updateSeed({
      id,
      organizationId,
      keyword: body.keyword,
      keywordCn: body.keywordCn,
      sources: body.sources,
      enabled: body.enabled,
    });
    return { seed: toSeedResponse(seed) };
  }

  @Delete('seeds/:id')
  async deleteSeed(
    @Param('id') id: string,
    @CurrentOrganization() organizationId: string,
  ) {
    await this.collectService.deleteSeed({ id, organizationId });
    return { deleted: true };
  }

  @Get('naver-keywords')
  getNaverKeywords(
    @Query() query: TrendHistoryQueryDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.queryService.getNaverKeywords(organizationId, query.days ?? DEFAULT_NAVER_KEYWORD_DAYS);
  }

  @Get('popular-keywords')
  getPopularKeywords(
    @Query() query: TrendHistoryQueryDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.queryService.getPopularKeywords(organizationId, query.days ?? DEFAULT_TREND_HISTORY_DAYS);
  }

  @Get('1688-hot')
  get1688Hot(
    @Query() query: TrendHistoryQueryDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.queryService.get1688Hot(organizationId, query.days ?? DEFAULT_TREND_HISTORY_DAYS);
  }

  @Get('1688-targets')
  async get1688Targets(@CurrentOrganization() organizationId: string) {
    const targets = await this.collectService.list1688Targets(organizationId);
    return { targets };
  }

  @Get('shorts')
  getShorts(
    @Query() query: TrendHistoryQueryDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.queryService.getShorts(organizationId, query.days ?? DEFAULT_TREND_HISTORY_DAYS);
  }

  @Get('tiktok-cc')
  getTiktokCc(
    @Query() query: TrendHistoryQueryDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.queryService.getTiktokCc(organizationId, query.days ?? DEFAULT_TREND_HISTORY_DAYS);
  }

  @Get('tiktok-cc-targets')
  async getTiktokCcTargets(@CurrentOrganization() organizationId: string) {
    const targets = await this.collectService.listTiktokCcTargets(organizationId);
    return { targets };
  }
}

function toSeedResponse(seed: {
  id: string;
  keyword: string;
  keywordCn: string | null;
  sources: string[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: seed.id,
    keyword: seed.keyword,
    keywordCn: seed.keywordCn,
    sources: seed.sources,
    enabled: seed.enabled,
    createdAt: seed.createdAt.toISOString(),
    updatedAt: seed.updatedAt.toISOString(),
  };
}
