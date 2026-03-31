import { Body, Controller, Post } from '@nestjs/common';
import { ImageAiService } from '../services/image-ai.service';
import { ImageEditBodyDto } from '../dto';

@Controller('image-ai')
export class ImageAiController {
  constructor(private readonly imageAiService: ImageAiService) {}

  @Post('edit')
  async edit(@Body() body: ImageEditBodyDto) {
    return this.imageAiService.createEditTask(body);
  }
}
