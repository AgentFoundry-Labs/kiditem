import { Module } from '@nestjs/common';
import { ImageAiController } from './image-ai.controller';
import { ImageAiService } from './image-ai.service';

@Module({
  controllers: [ImageAiController],
  providers: [ImageAiService],
})
export class ImageAiModule {}
