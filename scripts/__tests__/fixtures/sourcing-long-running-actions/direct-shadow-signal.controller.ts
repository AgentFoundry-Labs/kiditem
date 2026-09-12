import { Post } from '@nestjs/common';
import { SourcingShadowSignalService } from '../../../application/service/sourcing-shadow-signal.service';

export class DirectShadowSignalController {
  constructor(private readonly shadowSignals: SourcingShadowSignalService) {}

  @Post('collect')
  collect() {
    return this.shadowSignals.collect({ organizationId: 'organization-id', idempotencyKey: 'owner-key' });
  }
}
