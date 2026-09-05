import {
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  SOURCING_EVIDENCE_LEDGER_REPOSITORY_PORT,
  type SourcingEvidenceLedgerRepositoryPort,
} from '../port/out/repository/sourcing-evidence-ledger.repository.port';
@Injectable()
export class SourcingEvidenceLedgerService {
  constructor(
    @Inject(SOURCING_EVIDENCE_LEDGER_REPOSITORY_PORT)
    private readonly repository: SourcingEvidenceLedgerRepositoryPort,
  ) {}

  async getRun(organizationId: string, runId: string) {
    const run = await this.repository.getRun({ organizationId, runId });
    if (!run) throw new NotFoundException('Evidence ingestion run not found');
    return run;
  }
}
