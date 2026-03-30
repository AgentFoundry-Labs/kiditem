import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

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
  app.useStaticAssets('/data/products', { prefix: '/processed/' });
  await app.listen(4000);
  console.log('Server running on http://localhost:4000');
}
bootstrap();
