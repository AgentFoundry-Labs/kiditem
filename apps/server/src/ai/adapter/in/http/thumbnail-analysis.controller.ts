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
import { CurrentCompany } from '../../../../auth/decorators/current-company.decorator';
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
import { ThumbnailGenerationService } from '../../../application/service/thumbnail-generation.service';
import { ThumbnailRecomposeService } from '../../../application/service/thumbnail-recompose.service';
import { ThumbnailWingService } from '../../../application/service/thumbnail-wing.service';

@Controller('thumbnail-analysis')
export class ThumbnailAnalysisController {
  constructor(
    private readonly analysisService: ThumbnailAnalysisService,
    private readonly generationService: ThumbnailGenerationService,
    private readonly recomposeService: ThumbnailRecomposeService,
    private readonly wingService: ThumbnailWingService,
  ) {}

  // ─── 목록 / 요약 ───────────────────────────────────────────────

  @Get()
  findAll(@CurrentCompany() companyId: string) {
    return this.analysisService.findAllWithAnalysis(companyId);
  }

  @Get('summary')
  getSummary(@CurrentCompany() companyId: string) {
    return this.analysisService.getSummary(companyId);
  }

  @Get('generations')
  listGenerations(
    @CurrentCompany() companyId: string,
    @Query('productId') productId?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return this.generationService.findAll(companyId, {
      productId: productId || null,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });
  }

  @Get('playwriter-status')
  checkPlaywriterStatus(@CurrentCompany() _companyId: string) {
    return this.wingService.checkPlaywriterStatus();
  }

  @Get('generations/:id')
  getGeneration(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.generationService.findOne(id, companyId);
  }

  // ─── 분석 / 사전검수 ─────────────────────────────────────────────

  @Post('analyze')
  analyze(@Body() body: AnalyzeThumbnailDto, @CurrentCompany() companyId: string) {
    if (body.productId) {
      return this.analysisService.analyzeProduct(body.productId, companyId, body.scope ?? 'all');
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
    @CurrentCompany() companyId: string,
  ) {
    if (!body?.productId) throw new BadRequestException('productId 가 필요합니다');
    return this.recomposeService.classify(body.productId, companyId);
  }

  @Post('image-spec')
  checkImageSpec(@Body() body: CheckImageSpecDto, @CurrentCompany() _companyId: string) {
    return this.analysisService.checkImageSpec(body.imageUrl);
  }

  @Post('pre-inspect')
  preInspect(@Body() body: PreInspectDto, @CurrentCompany() companyId: string) {
    return this.analysisService.preInspect(body.productIds, companyId);
  }

  @Post('analyze-batch')
  analyzeBatch(@Body() body: AnalyzeBatchDto, @CurrentCompany() companyId: string) {
    return this.analysisService.analyzeBatch(body.productIds, companyId, body.scope ?? 'all');
  }

  @Delete('analyze-batch')
  cancelBatch(@CurrentCompany() companyId: string) {
    return this.analysisService.cancelBatch(companyId);
  }

  // ─── 편집 jobs (현재 main 에서는 unavailable) ────────────────────

  @Post('edit-jobs')
  createEditJobs(@Body() body: EditJobsDto, @CurrentCompany() companyId: string) {
    return this.generationService.createEditJobs(
      body.productIds,
      companyId,
      body.purpose ?? 'compliance',
      body.variantKey ?? null,
    );
  }

  @Post('generations/:id/re-edit')
  reEditGeneration(
    @Param('id') id: string,
    @Body() body: ReEditDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.generationService.reEditJob(
      id,
      companyId,
      body?.purpose ?? 'compliance',
      body?.variantKey ?? null,
    );
  }

  // ─── Generation 상태 전이 ─────────────────────────────────────

  @Put('generations/:id/select')
  selectCandidate(
    @Param('id') id: string,
    @Body() body: SelectCandidateDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.generationService.selectCandidate(id, companyId, body.selectedUrl);
  }

  @Put('generations/:id/apply')
  applyGeneration(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.generationService.applyGeneration(id, companyId);
  }

  @Put('generations/:id/skip')
  skipGeneration(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.generationService.skipGeneration(id, companyId);
  }

  @Delete('generations/:id')
  deleteGeneration(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.generationService.deleteGeneration(id, companyId);
  }

  @Delete('generations/:id/candidates')
  deleteCandidate(
    @Param('id') id: string,
    @Body() body: DeleteCandidateDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.generationService.removeCandidate(id, companyId, body.url);
  }

  // ─── Wing 등록 ────────────────────────────────────────────────

  @Post('generations/:id/wing-register')
  wingRegister(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.wingService.registerToWing(id, companyId);
  }

  @Post('generations/wing-register/batch')
  wingRegisterBatch(
    @Body() body: WingRegisterBatchDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.wingService.batchRegister(body.generationIds, companyId);
  }

  @Delete('generations/:id/registration-error')
  clearRegistrationError(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.wingService.clearRegistrationError(id, companyId);
  }

  @Post('generations/:id/verify-registration')
  verifyRegistration(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.wingService.verifyRegistration(id, companyId);
  }
}
