import { Body, Controller, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { SourcingAgentRagService } from '../../../application/service/sourcing-agent-rag.service';
import { QuerySourcingAgentRagDto } from './dto/sourcing-agent-rag.dto';

@Controller('sourcing/agent-rag')
export class SourcingAgentRagController {
  constructor(private readonly rag: SourcingAgentRagService) {}

  @Post('query')
  async query(
    @Body() body: QuerySourcingAgentRagDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.rag.query({
      organizationId,
      message: body.message,
      topK: body.topK,
      days: body.days,
    });
  }
}
