import { Inject, Injectable } from '@nestjs/common';
import {
  AGENT_OS_REPOSITORY_PORT,
  type AgentOsRepositoryPort,
  type FindAuthorizationEventsQuery,
  type FindCostEventsQuery,
  type FindRequestsQuery,
  type FindRunEventsQuery,
  type FindRunsQuery,
} from '../port/out/agent-os-repository.port';

@Injectable()
export class AgentObservabilityService {
  constructor(
    @Inject(AGENT_OS_REPOSITORY_PORT)
    private readonly repository: AgentOsRepositoryPort,
  ) {}

  listRequests(query: FindRequestsQuery) {
    return this.repository.listRunRequests(query);
  }

  findRequest(input: { organizationId: string; requestId: string }) {
    return this.repository.findRunRequestById(input);
  }

  listRuns(query: FindRunsQuery) {
    return this.repository.listRuns(query);
  }

  findRun(input: { organizationId: string; runId: string }) {
    return this.repository.findRunById(input);
  }

  listRunEvents(query: FindRunEventsQuery) {
    return this.repository.listRunEvents(query);
  }

  listCostEvents(query: FindCostEventsQuery) {
    return this.repository.listCostEvents(query);
  }

  listAuthorizationEvents(query: FindAuthorizationEventsQuery) {
    return this.repository.listAuthorizationEvents(query);
  }
}
