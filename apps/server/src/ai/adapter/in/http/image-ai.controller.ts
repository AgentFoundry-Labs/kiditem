import { Body, Controller, Post } from '@nestjs/common';
import { ImageAiService } from '../../../application/service/image-ai.service';
import { ImageEditBodyDto } from './dto';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';

@Controller('image-ai')
export class ImageAiController {
  constructor(private readonly imageAiService: ImageAiService) {}

  @Post('edit')
  async edit(@Body() body: ImageEditBodyDto, @CurrentOrganization() organizationId: string) {
    return this.imageAiService.createEditTask(body, organizationId);
  }
}
