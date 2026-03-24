import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      /^http:\/\/localhost:\d+$/,
    ],
  });
  app.setGlobalPrefix('api');
  await app.listen(4000);
  console.log('Server running on http://localhost:4000');
}
bootstrap();
