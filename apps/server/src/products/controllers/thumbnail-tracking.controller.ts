import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { IsString, IsNumber, IsOptional, IsIn } from 'class-validator';
import { ThumbnailTrackingService } from '../services/thumbnail-tracking.service';

class CreateTrackingDto {
  @IsString()
  companyId!: string;

  @IsString()
  productId!: string;

  @IsString()
  generationId!: string;

  @IsString()
  originalGrade!: string;

  @IsNumber()
  originalScore!: number;
}

class UpdateMetricsDto {
  @IsOptional()
  @IsNumber()
  ctrBefore?: number;

  @IsOptional()
  @IsNumber()
  ctrAfter?: number;

  @IsOptional()
  @IsNumber()
  reviewsBefore?: number;

  @IsOptional()
  @IsNumber()
  reviewsAfter?: number;

  @IsOptional()
  @IsNumber()
  salesBefore?: number;

  @IsOptional()
  @IsNumber()
  salesAfter?: number;

  @IsOptional()
  @IsString()
  @IsIn(['tracking', 'measured', 'inconclusive'])
  status?: string;
}

@Controller('thumbnail-tracking')
export class ThumbnailTrackingController {
  constructor(private readonly trackingService: ThumbnailTrackingService) {}

  @Get()
  findAll() {
    return this.trackingService.findAll();
  }

  @Post()
  create(@Body() body: CreateTrackingDto) {
    return this.trackingService.create(body);
  }

  @Patch(':id')
  updateMetrics(@Param('id') id: string, @Body() body: UpdateMetricsDto) {
    return this.trackingService.updateMetrics(id, body);
  }
}
