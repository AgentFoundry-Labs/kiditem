import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '..', '..', '..', '.env') });

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      /^http:\/\/localhost:\d+$/,
    ],
  });
  app.useBodyParser('json', { limit: '5mb' });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));
  app.useGlobalFilters(new GlobalExceptionFilter());
  // 이미지는 S3-호환 스토리지(MinIO/R2/S3)에서 직접 서빙 (StorageService 참조)
  await app.listen(4000);
  console.log('Server running on http://localhost:4000');
}
bootstrap();
