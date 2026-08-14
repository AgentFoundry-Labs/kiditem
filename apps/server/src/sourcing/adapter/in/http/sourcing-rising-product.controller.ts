import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import {
  OPERATION_RUNNER_PORT,
  type OperationRunnerPort,
} from '../../../../operations/application/port/in/operation-runner.port';
import { SourcingRisingProductService } from '../../../application/service/sourcing-rising-product.service';
import { DetectRisingProductsDto } from './dto/sourcing-rising-product.dto';
import type { AuthUser } from '../../../../auth/auth.types';

@Controller('sourcing/rising-products')
export class SourcingRisingProductController {
  constructor(
    private readonly rising: SourcingRisingProductService,
    @Inject(OPERATION_RUNNER_PORT)
    private readonly operationRunner: OperationRunnerPort,
  ) {}

  @Get()
  latest(@CurrentOrganization() organizationId: string) {
    return this.rising.getLatest(organizationId);
  }

  @Post('detect')
  @HttpCode(HttpStatus.ACCEPTED)
  detect(
    @Body() body: DetectRisingProductsDto,
    @CurrentOrganization() organizationId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.operationRunner.start({
      organizationId,
      operationKey: 'sourcing.detect_rising_products',
      triggerSource: 'domain_screen',
      input: {
        ...(body.windowDays === undefined ? {} : { windowDays: body.windowDays }),
        ...(body.limit === undefined ? {} : { limit: body.limit }),
      },
      requestedByUserId: user.id,
      idempotencyKey: idempotencyKey?.trim() || null,
    });
  }
}
