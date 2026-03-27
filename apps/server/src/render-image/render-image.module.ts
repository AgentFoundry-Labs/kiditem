import { Module } from '@nestjs/common';
import { RenderImageController } from './render-image.controller';

@Module({
  controllers: [RenderImageController],
})
export class RenderImageModule {}
