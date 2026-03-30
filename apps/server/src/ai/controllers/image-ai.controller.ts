import { Body, Controller, Post } from '@nestjs/common';
import { ImageAiService } from '../services/image-ai.service';

@Controller('image-ai')
export class ImageAiController {
  constructor(private readonly imageAiService: ImageAiService) {}

  @Post('edit')
  async edit(
    @Body() body: { image_url: string; preset: string; user_prompt?: string },
  ) {
    return this.imageAiService.createEditTask(body);
  }
}
