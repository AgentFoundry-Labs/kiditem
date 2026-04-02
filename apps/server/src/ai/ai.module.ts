import { Module } from '@nestjs/common';
import { AgentRegistryModule } from '../agent-registry/agent-registry.module';
import { TextAiController } from './controllers/text-ai.controller';
import { TextAiService } from './services/text-ai.service';
import { ImageAiController } from './controllers/image-ai.controller';
import { ImageAiService } from './services/image-ai.service';
import { RenderImageController } from './controllers/render-image.controller';

@Module({
  imports: [AgentRegistryModule],
  controllers: [TextAiController, ImageAiController, RenderImageController],
  providers: [TextAiService, ImageAiService],
})
export class AiModule {}
