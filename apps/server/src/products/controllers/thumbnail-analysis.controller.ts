import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { ThumbnailAnalysisService } from '../services/thumbnail-analysis.service';
import { ThumbnailGenerationService } from '../services/thumbnail-generation.service';
import {
  AnalyzeThumbnailDto,
  AnalyzeBatchDto,
  GenerateThumbnailDto,
  SelectCandidateDto,
  ListThumbnailAnalysesQueryDto,
  ListGenerationsQueryDto,
} from '../dto';

@Controller('thumbnail-analysis')
export class ThumbnailAnalysisController {
  constructor(
    private readonly analysisService: ThumbnailAnalysisService,
    private readonly generationService: ThumbnailGenerationService,
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
      return this.analysisService.analyzeProduct(body.productId);
    }
    if (body.imageUrl) {
      return this.analysisService.analyzeDirectImage(body.imageUrl, body.productName);
    }
    throw new BadRequestException('productId 또는 imageUrl이 필요합니다');
  }

  @Post('analyze-batch')
  analyzeBatch(@Body() body: AnalyzeBatchDto) {
    return this.analysisService.analyzeBatch(body.productIds);
  }

  @Get('generations')
  findGenerations(@Query() query: ListGenerationsQueryDto) {
    return this.generationService.findAll({
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
  }

  @Post('generations')
  createGenerations(@Body() body: GenerateThumbnailDto) {
    return this.generationService.createJobs(body.productIds);
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
}
