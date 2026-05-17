import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
} from '@nestjs/common';
import type { AuthUser } from '../../../../auth/auth.types';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { OperationCancellationService } from '../../../application/service/operation-cancellation.service';
import type { CancelOperationResult } from '../../../application/service/operation-cancellation.types';
import {
  CancelOperationDto,
  toCancelOperationTarget,
} from './dto/operation-cancel.dto';

@Controller('operations')
export class OperationCancellationController {
  constructor(private readonly cancellations: OperationCancellationService) {}

  @Post('cancel')
  @HttpCode(200)
  async cancel(
    @Body() dto: CancelOperationDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<CancelOperationResult> {
    try {
      return await this.cancellations.cancel({
        organizationId,
        actorUserId: user.id,
        target: toCancelOperationTarget(dto),
      });
    } catch (error) {
      if (error instanceof Error && error.message.endsWith('is required')) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
