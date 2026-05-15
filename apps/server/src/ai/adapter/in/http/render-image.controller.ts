import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { DetailPageRasterizationService } from '../../../application/service/detail-page-rasterization.service';
import { RenderImageBodyDto } from './dto';

@Controller('render-image')
export class RenderImageController {
  constructor(
    private readonly rasterization: DetailPageRasterizationService,
  ) {}

  @Post()
  @HttpCode(200)
  async render(@Body() body: RenderImageBodyDto, @Res() res: Response): Promise<void> {
    const result = await this.rasterization.render(body);
    res.setHeader('Content-Type', result.contentType);
    res.send(result.buffer);
  }
}
