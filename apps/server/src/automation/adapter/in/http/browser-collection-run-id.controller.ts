import { Controller, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { BrowserCollectionRunIdService } from '../../../application/service/browser-collection-run-id.service';

@Controller('browser-collection-runs')
export class BrowserCollectionRunIdController {
  constructor(private readonly runIds: BrowserCollectionRunIdService) {}

  @Post()
  issue(@CurrentOrganization() _organizationId: string) {
    return this.runIds.issue();
  }
}
