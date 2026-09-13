import {
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT,
  type SourcingBrowserSourceAttemptRepositoryPort,
} from '../port/out/repository/sourcing-browser-source-attempt.repository.port';
@Injectable()
export class SourcingEvidenceLedgerService {
  constructor(
    @Inject(SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT)
    private readonly attempts: SourcingBrowserSourceAttemptRepositoryPort,
  ) {}

  async getRun(organizationId: string, runId: string) {
    const run = await this.attempts.readAttempt({ organizationId, attemptId: runId });
    if (!run) throw new NotFoundException('Evidence ingestion run not found');
    return run;
  }
}
