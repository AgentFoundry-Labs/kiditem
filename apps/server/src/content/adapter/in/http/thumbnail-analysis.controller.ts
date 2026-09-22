import { BadRequestException, Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { AnalyzeBatchDto, AnalyzeThumbnailDto, CheckImageSpecDto, PreInspectDto } from './dto/thumbnail-analyze.dto';
import { ThumbnailAnalysisService } from '../../../application/service/thumbnail-analysis.service';
import { ThumbnailRecomposeService } from '../../../application/service/thumbnail-recompose.service';

@Controller('thumbnail-analysis')
export class ThumbnailAnalysisController {
  constructor(
    private readonly analysisService: ThumbnailAnalysisService,
    private readonly recomposeService: ThumbnailRecomposeService,
  ) {}

  // ─── 목록 / 요약 ───────────────────────────────────────────────

  @Get()
  findAll(@CurrentOrganization() organizationId: string) {
    return this.analysisService.findAllWithAnalysis(organizationId);
  }

  @Get('summary')
  getSummary(@CurrentOrganization() organizationId: string) {
    return this.analysisService.getSummary(organizationId);
  }

  // ─── 분석 / 사전검수 ─────────────────────────────────────────────

  @Post('analyze')
  analyze(@Body() body: AnalyzeThumbnailDto, @CurrentOrganization() organizationId: string) {
    if (body.contentWorkspaceId) {
      return this.analysisService.analyzeWorkspace(body.contentWorkspaceId, organizationId, body.scope ?? 'all');
    }
    if (body.imageUrl) {
      return this.analysisService.analyzeDirectImage(body.imageUrl, body.productName, body.scope ?? 'all');
    }
    throw new BadRequestException('contentWorkspaceId 또는 imageUrl 이 필요합니다');
  }

  @Post('edit/variants')
  classifyRecomposeVariants(
    @Body() body: { contentWorkspaceId: string },
    @CurrentOrganization() organizationId: string,
  ) {
    if (!body?.contentWorkspaceId) {
      throw new BadRequestException('contentWorkspaceId 가 필요합니다');
    }
    return this.recomposeService.classify(body.contentWorkspaceId, organizationId);
  }

  @Post('image-spec')
  checkImageSpec(@Body() body: CheckImageSpecDto, @CurrentOrganization() _organizationId: string) {
    return this.analysisService.checkImageSpec(body.imageUrl);
  }

  @Post('pre-inspect')
  preInspect(@Body() body: PreInspectDto, @CurrentOrganization() organizationId: string) {
    return this.analysisService.preInspect(body.contentWorkspaceIds, organizationId);
  }

  @Post('analyze-batch')
  analyzeBatch(@Body() body: AnalyzeBatchDto, @CurrentOrganization() organizationId: string) {
    return this.analysisService.analyzeBatch(body.contentWorkspaceIds, organizationId, body.scope ?? 'all');
  }

  @Delete('analyze-batch')
  cancelBatch(@CurrentOrganization() organizationId: string) {
    return this.analysisService.cancelBatch(organizationId);
  }
}
