import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  AnalyzeBatchDto,
  AnalyzeThumbnailDto,
  CheckImageSpecDto,
  PreInspectDto,
} from './dto/thumbnail-analyze.dto';
import {
  DeleteCandidateDto,
  EditJobsDto,
  ReEditDto,
  SelectCandidateDto,
  WingRegisterBatchDto,
} from './dto/thumbnail-edit.dto';
import { ThumbnailAnalysisService } from '../../../application/service/thumbnail-analysis.service';
import { ThumbnailAnalysisBatchService } from '../../../application/service/thumbnail-analysis-batch.service';
import { ThumbnailGenerationService } from '../../../application/service/thumbnail-generation.service';
import { ThumbnailRecomposeService } from '../../../application/service/thumbnail-recompose.service';
import { ThumbnailWingService } from '../../../application/service/thumbnail-wing.service';

@Controller('thumbnail-analysis')
export class ThumbnailAnalysisController {
  constructor(
    private readonly analysisService: ThumbnailAnalysisService,
    private readonly batchService: ThumbnailAnalysisBatchService,
    private readonly generationService: ThumbnailGenerationService,
    private readonly recomposeService: ThumbnailRecomposeService,
    private readonly wingService: ThumbnailWingService,
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

  @Get('generations')
  listGenerations(
    @CurrentOrganization() organizationId: string,
    @Query('productId') productId?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return this.generationService.findAll(organizationId, {
      productId: productId || null,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });
  }

  @Get('playwriter-status')
  checkPlaywriterStatus(@CurrentOrganization() _organizationId: string) {
    return this.wingService.checkPlaywriterStatus();
  }

  @Get('generations/:id')
  getGeneration(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.generationService.findOne(id, organizationId);
  }

  // ─── 분석 / 사전검수 ─────────────────────────────────────────────

  @Post('analyze')
  analyze(@Body() body: AnalyzeThumbnailDto, @CurrentOrganization() organizationId: string) {
    if (body.productId) {
      return this.analysisService.analyzeProduct(body.productId, organizationId, body.scope ?? 'all');
    }
    if (body.imageUrl) {
      return this.analysisService.analyzeDirectImage(
        body.imageUrl,
        body.productName,
        body.scope ?? 'all',
      );
    }
    throw new BadRequestException('productId 또는 imageUrl 이 필요합니다');
  }

  @Post('edit/variants')
  classifyRecomposeVariants(
    @Body() body: { productId: string },
    @CurrentOrganization() organizationId: string,
  ) {
    if (!body?.productId) throw new BadRequestException('productId 가 필요합니다');
    return this.recomposeService.classify(body.productId, organizationId);
  }

  @Post('image-spec')
  checkImageSpec(@Body() body: CheckImageSpecDto, @CurrentOrganization() _organizationId: string) {
    return this.analysisService.checkImageSpec(body.imageUrl);
  }

  @Post('pre-inspect')
  preInspect(@Body() body: PreInspectDto, @CurrentOrganization() organizationId: string) {
    return this.analysisService.preInspect(body.productIds, organizationId);
  }

  @Post('analyze-batch')
  analyzeBatch(@Body() body: AnalyzeBatchDto, @CurrentOrganization() organizationId: string) {
    return this.analysisService.analyzeBatch(body.productIds, organizationId, body.scope ?? 'all');
  }

  @Delete('analyze-batch')
  cancelBatch(@CurrentOrganization() organizationId: string) {
    return this.analysisService.cancelBatch(organizationId);
  }

  // ─── Batch job tracker (resumable) ─────────────────────────────
  // 새로고침/탭 닫음 후에도 진행 상태를 유지하기 위해 backend 가 organization
  // 별 in-memory 1잡을 추적한다. frontend 가 jobId 를 localStorage 에 저장.

  @Post('batch')
  startBatch(
    @Body() body: AnalyzeBatchDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.batchService.start(organizationId, body.productIds, body.scope ?? 'all');
  }

  @Get('batch')
  currentBatch(@CurrentOrganization() organizationId: string) {
    return { job: this.batchService.getCurrent(organizationId) };
  }

  @Get('batch/:jobId')
  batchStatus(
    @Param('jobId') jobId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.batchService.getStatus(jobId, organizationId);
  }

  @Delete('batch/:jobId')
  cancelBatchJob(
    @Param('jobId') jobId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.batchService.cancel(jobId, organizationId);
  }

  // ─── 편집 jobs (현재 main 에서는 unavailable) ────────────────────

  @Post('edit-jobs')
  createEditJobs(@Body() body: EditJobsDto, @CurrentOrganization() organizationId: string) {
    return this.generationService.createEditJobs(
      body.productIds,
      organizationId,
      body.purpose ?? 'compliance',
      body.variantKey ?? null,
    );
  }

  @Post('generations/:id/re-edit')
  reEditGeneration(
    @Param('id') id: string,
    @Body() body: ReEditDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.generationService.reEditJob(
      id,
      organizationId,
      body?.purpose ?? 'compliance',
      body?.variantKey ?? null,
    );
  }

  // ─── Generation 상태 전이 ─────────────────────────────────────

  @Put('generations/:id/select')
  selectCandidate(
    @Param('id') id: string,
    @Body() body: SelectCandidateDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.generationService.selectCandidate(id, organizationId, body.selectedUrl);
  }

  @Put('generations/:id/apply')
  applyGeneration(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.generationService.applyGeneration(id, organizationId);
  }

  @Put('generations/:id/skip')
  skipGeneration(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.generationService.skipGeneration(id, organizationId);
  }

  @Delete('generations/:id')
  deleteGeneration(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.generationService.deleteGeneration(id, organizationId);
  }

  @Delete('generations/:id/candidates')
  deleteCandidate(
    @Param('id') id: string,
    @Body() body: DeleteCandidateDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.generationService.removeCandidate(id, organizationId, body.url);
  }

  // ─── Wing 등록 ────────────────────────────────────────────────

  @Post('generations/:id/wing-register')
  wingRegister(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.wingService.registerToWing(id, organizationId);
  }

  @Post('generations/wing-register/batch')
  wingRegisterBatch(
    @Body() body: WingRegisterBatchDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.wingService.batchRegister(body.generationIds, organizationId);
  }

  @Delete('generations/:id/registration-error')
  clearRegistrationError(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.wingService.clearRegistrationError(id, organizationId);
  }

  @Post('generations/:id/verify-registration')
  verifyRegistration(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.wingService.verifyRegistration(id, organizationId);
  }
}
