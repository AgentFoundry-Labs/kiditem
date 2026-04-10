import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { ThumbnailAnalysisService } from '../services/thumbnail-analysis.service';
import { ThumbnailGenerationService } from '../services/thumbnail-generation.service';
import { ThumbnailEditService } from '../services/thumbnail-edit.service';
import {
  AnalyzeThumbnailDto,
  AnalyzeBatchDto,
  SelectCandidateDto,
  ListThumbnailAnalysesQueryDto,
  ListGenerationsQueryDto,
  EditThumbnailDto,
} from '../dto';

@Controller('thumbnail-analysis')
export class ThumbnailAnalysisController {
  constructor(
    private readonly analysisService: ThumbnailAnalysisService,
    private readonly generationService: ThumbnailGenerationService,
    private readonly editService: ThumbnailEditService,
  ) {}

  @Get()
  findAll(@Query() query: ListThumbnailAnalysesQueryDto) {
    return this.analysisService.findAllWithAnalysis(query);
  }

  @Get('summary')
  getSummary() {
    return this.analysisService.getSummary();
  }

  @Post('analyze')
  async analyze(@Body() body: AnalyzeThumbnailDto) {
    if (body.productId) {
      return this.analysisService.analyzeProduct(body.productId, body.scope);
    }
    if (body.imageUrl) {
      return this.analysisService.analyzeDirectImage(body.imageUrl, body.productName);
    }
    throw new BadRequestException('productId 또는 imageUrl이 필요합니다');
  }

  @Post('analyze-batch')
  analyzeBatch(@Body() body: AnalyzeBatchDto) {
    return this.analysisService.analyzeBatch(body.productIds, body.scope);
  }

  @Delete('analyze-batch')
  cancelBatch() {
    return this.analysisService.cancelBatch();
  }

  @Post('image-spec')
  checkImageSpec(@Body() body: { imageUrl: string }) {
    return this.analysisService.checkImageSpec(body.imageUrl);
  }

  @Post('pre-inspect')
  preInspect(@Body() body: { productIds?: string[] }) {
    return this.analysisService.preInspect(body.productIds);
  }

  @Get('generations')
  findGenerations(@Query() query: ListGenerationsQueryDto) {
    return this.generationService.findAll({
      status: query.status,
      method: query.method,
      page: query.page,
      limit: query.limit,
    });
  }

  @Post('edit-jobs')
  createEditJobs(@Body() body: EditThumbnailDto) {
    return this.editService.createEditJobs(body.productIds, body.purpose);
  }

  @Put('generations/:id/select')
  selectCandidate(@Param('id') id: string, @Body() body: SelectCandidateDto) {
    return this.generationService.selectCandidate(id, body.selectedUrl);
  }

  @Put('generations/:id/apply')
  applyGeneration(@Param('id') id: string) {
    return this.generationService.applyGeneration(id);
  }

  @Put('generations/:id/skip')
  skipGeneration(@Param('id') id: string) {
    return this.generationService.skipGeneration(id);
  }

  @Delete('generations/:id')
  deleteGeneration(@Param('id') id: string) {
    return this.generationService.deleteGeneration(id);
  }
}
