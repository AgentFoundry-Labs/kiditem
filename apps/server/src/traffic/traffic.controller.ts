import {
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TrafficService } from './traffic.service';

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Controller('traffic')
export class TrafficController {
  constructor(private readonly trafficService: TrafficService) {}

  @Get('summary')
  async summary(@Query('days') days?: string) {
    const d = days ? parseInt(days, 10) : 30;
    return this.trafficService.getTrafficSummary(d);
  }

  @Get('monthly')
  async monthly(
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const now = new Date();
    const y = year ? parseInt(year, 10) : now.getFullYear();
    const m = month ? parseInt(month, 10) : now.getMonth() + 1;
    return this.trafficService.getMonthlyRevenue(y, m);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: MulterFile) {
    if (!file) {
      throw new BadRequestException('파일이 필요합니다.');
    }
    return this.trafficService.uploadTrafficStats(file);
  }
}
