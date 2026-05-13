import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { ContentWorkspaceAttachmentService } from '../../../application/service/content-workspace-attachment.service';
import { AttachContentGroupToProductDto } from './dto/content-archive.dto';

@Controller('ai/content-archive/groups')
export class ContentWorkspaceAttachmentController {
  constructor(private readonly attachment: ContentWorkspaceAttachmentService) {}

  @Post(':groupId/attach-product')
  attachGroupToProduct(
    @CurrentOrganization() organizationId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Body() body: AttachContentGroupToProductDto,
  ) {
    return this.attachment.attachGroupToProduct(organizationId, groupId, body.productId);
  }
}
