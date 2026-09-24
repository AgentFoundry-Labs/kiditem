import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ImageAssetOperationService } from '../../../application/service/image-asset-operation.service';
import { ImageAiService } from '../../../application/service/image-ai.service';
import { ImageCropBodyDto, ImageEditBodyDto } from './dto';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';

class CancelImageEditTaskBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

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

  @Get('tasks/:taskId')
  async task(
    @Param('taskId') taskId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.imageAiService.getEditTask(organizationId, taskId);
  }

  @Post('tasks/:taskId/cancel')
  async cancelTask(
    @Param('taskId') taskId: string,
    @Body() body: CancelImageEditTaskBodyDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.imageAiService.cancelEditTask(
      organizationId,
      taskId,
      user.id,
      body.reason?.trim() || '사용자 요청으로 중단되었습니다.',
    );
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
