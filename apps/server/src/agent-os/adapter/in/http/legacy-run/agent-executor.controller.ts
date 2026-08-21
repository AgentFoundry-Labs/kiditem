import { Body, Controller, Inject, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../../auth/decorators/current-organization.decorator';
import { LEGACY_AGENT_RUN_EXECUTION_PORT, type LegacyAgentRunExecutionPort } from '../../../../application/port/in/legacy-run/legacy-agent-run.port';
import { ClaimAndRunDto } from './dto/agent-runs.dto';

@Controller('agent-os')
export class AgentExecutorController {
  constructor(@Inject(LEGACY_AGENT_RUN_EXECUTION_PORT) private readonly executor: LegacyAgentRunExecutionPort) {}

  @Post('executor/claim-and-run')
  async claimAndRun(
    @CurrentOrganization() organizationId: string,
    @Body() body: ClaimAndRunDto,
  ) {
    return this.executor.executeNext(body.workerId, organizationId);
  }
}
