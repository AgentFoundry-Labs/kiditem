import { Body, Controller, Post } from '@nestjs/common';
import { TextAiService } from './text-ai.service';

@Controller('text-ai')
export class TextAiController {
  constructor(private readonly textAiService: TextAiService) {}

  @Post('transform')
  async transform(
    @Body() body: { text: string; preset: string; custom_prompt?: string },
  ) {
    return this.textAiService.transform(body);
  }
}
