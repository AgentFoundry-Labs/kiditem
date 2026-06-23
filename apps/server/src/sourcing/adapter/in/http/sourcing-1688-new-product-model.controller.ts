import { Body, Controller, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { Sourcing1688NewProductModelService } from '../../../application/service/sourcing-1688-new-product-model.service';
import { RunSourcing1688NewProductModelDto } from './dto/sourcing-1688-new-product-model.dto';

@Controller('sourcing/1688-new-product-model')
export class Sourcing1688NewProductModelController {
  constructor(private readonly model: Sourcing1688NewProductModelService) {}

  @Post('run')
  async run(
    @Body() body: RunSourcing1688NewProductModelDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.model.run({
      organizationId,
      days: body.days,
      limit: body.limit,
    });
  }

  @Post('latest')
  async latest(
    @Body() body: RunSourcing1688NewProductModelDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.model.latestOrRun({
      organizationId,
      days: body.days,
      limit: body.limit,
    });
  }
}
