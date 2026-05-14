import { Controller, Get } from '@nestjs/common';
import { AdBenchmarkService } from '../../../application/service/ad-benchmark.service';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';

@Controller('ads')
export class AdvertisingDiagnosticsController {
  constructor(private readonly adBenchmarkService: AdBenchmarkService) {}

  @Get('benchmark')
  getBenchmark(@CurrentOrganization() organizationId: string) {
    return this.adBenchmarkService.getDiagnosis(organizationId);
  }
}
