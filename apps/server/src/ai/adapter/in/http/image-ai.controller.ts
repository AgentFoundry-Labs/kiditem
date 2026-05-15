import { Body, Controller, Post } from '@nestjs/common';
import { ImageAssetOperationService } from '../../../application/service/image-asset-operation.service';
import { ImageAiService } from '../../../application/service/image-ai.service';
import { ImageCropBodyDto, ImageEditBodyDto } from './dto';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';

@Controller('image-ai')
export class ImageAiController {
  constructor(
    private readonly imageAiService: ImageAiService,
    private readonly imageAssetOperation: ImageAssetOperationService,
  ) {}

  @Post('edit')
  async edit(
    @Body() body: ImageEditBodyDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.imageAiService.createEditTask(body, organizationId, user.id);
  }

  @Post('crop')
  async crop(
    @Body() body: ImageCropBodyDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.imageAssetOperation.cropImage({
      organizationId,
      imageUrl: body.imageUrl,
      crop: body.crop,
    });
  }
}
