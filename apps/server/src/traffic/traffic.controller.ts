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
import { CurrentCompany } from '../auth/decorators/current-company.decorator';

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = new Set([
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream', // 일부 브라우저가 xlsx 에 사용
]);
const ALLOWED_EXTENSIONS = /\.(csv|xls|xlsx)$/i;

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
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_SIZE },
      fileFilter: (_req, file, cb) => {
        const mimeOk = ALLOWED_MIME_TYPES.has(file.mimetype);
        const extOk = ALLOWED_EXTENSIONS.test(file.originalname);
        if (mimeOk || extOk) return cb(null, true);
        cb(new BadRequestException('CSV 또는 엑셀 파일만 업로드 가능합니다.'), false);
      },
    }),
  )
  async upload(
    @UploadedFile() file: MulterFile,
    @CurrentCompany() companyId: string,
  ) {
    if (!file) {
      throw new BadRequestException('파일이 필요합니다.');
    }
    return this.trafficService.uploadTrafficStats(file, companyId);
  }
}
