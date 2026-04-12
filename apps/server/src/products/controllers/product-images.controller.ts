import {
  Controller,
  Post,
  Param,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

@Controller('products')
export class ProductImagesController {
  @Post(':id/images/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const productId = req.params.id as string;
          const dir = join(process.cwd(), 'data', 'product-images', productId);
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname) || '.png';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: MAX_SIZE },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIMES.includes(file.mimetype)) {
          cb(new BadRequestException('JPEG, PNG, WebP만 허용됩니다'), false);
        } else {
          cb(null, true);
        }
      },
    }),
  )
  async uploadImage(
    @Param('id') productId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('파일이 필요합니다');
    return {
      url: `/product-images/${productId}/${file.filename}`,
      filename: file.filename,
      size: file.size,
    };
  }
}
