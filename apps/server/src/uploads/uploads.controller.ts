import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadsService } from './uploads.service';

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Controller('upload')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: MulterFile,
    @Body('type') type: string,
    @Body('reportDate') reportDate?: string,
  ) {
    if (!file) {
      throw new BadRequestException('파일이 없습니다.');
    }

    if (type === 'adCsv') {
      return this.uploadsService.processAdCsv(file, reportDate);
    }

    throw new BadRequestException('type을 지정해주세요 (adCsv)');
  }
}
