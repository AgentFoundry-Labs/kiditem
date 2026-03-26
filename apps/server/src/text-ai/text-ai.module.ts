import { Module } from '@nestjs/common';
import { TextAiController } from './text-ai.controller';
import { TextAiService } from './text-ai.service';

@Module({
  controllers: [TextAiController],
  providers: [TextAiService],
})
export class TextAiModule {}
