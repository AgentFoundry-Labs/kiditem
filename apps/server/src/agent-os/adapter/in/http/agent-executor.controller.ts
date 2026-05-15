import { Body, Controller, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { AgentRunExecutor } from '../../../application/service/agent-run-executor.service';
import { ClaimAndRunDto } from './dto/agent-runs.dto';

@Controller('agent-os')
export class AgentExecutorController {
  constructor(private readonly executor: AgentRunExecutor) {}

  @Post('executor/claim-and-run')
  async claimAndRun(
    @CurrentOrganization() organizationId: string,
    @Body() body: ClaimAndRunDto,
  ) {
    return this.executor.executeNext(body.workerId, organizationId);
  }
}
