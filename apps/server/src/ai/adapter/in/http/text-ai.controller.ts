import { Body, Controller, Post } from '@nestjs/common';
import { TextAiService } from '../../../application/service/text-ai.service';
import { TextTransformBodyDto } from './dto';

@Controller('text-ai')
export class TextAiController {
  constructor(private readonly textAiService: TextAiService) {}

  @Post('transform')
  async transform(@Body() body: TextTransformBodyDto) {
    return this.textAiService.transform(body);
  }
}
