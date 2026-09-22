import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  SOURCING_CANDIDATE_REPOSITORY_PORT,
  type SourcingCandidateRepositoryPort,
} from '../port/out/repository/sourcing-candidate.repository.port';
import {
  CANDIDATE_REGISTRATION_PORT,
  type CandidateRegistrationPort,
} from '../../../channels/application/port/in/candidate-registration.port';
import type { RejectCandidateCommand } from '../port/in/sourcing.commands';

/** Candidate terminal-state service retained for rejection only. */
@Injectable()
export class SourcingPromotionService {
  constructor(
    @Inject(SOURCING_CANDIDATE_REPOSITORY_PORT)
    private readonly candidates: SourcingCandidateRepositoryPort,
    @Inject(CANDIDATE_REGISTRATION_PORT)
    private readonly preparations: CandidateRegistrationPort,
  ) {}

  async reject(
    candidateId: string,
    organizationId: string,
    body: RejectCandidateCommand,
    userId: string | null,
  ): Promise<{ status: 'rejected' }> {
    return this.candidates.runInTransaction(async (tx, ownerTx) => {
      await this.candidates.lockCandidate(tx, { id: candidateId, organizationId });
      const candidate = await this.candidates.findCandidateState(tx, {
        id: candidateId,
        organizationId,
      });
      if (!candidate) throw new NotFoundException('Sourcing candidate not found');
      if (candidate.status !== 'sourced') {
        throw new UnprocessableEntityException(
          `Candidate cannot be rejected from status '${candidate.status}'`,
        );
      }
      await this.preparations.assertCandidateTerminalTransitionAllowed(ownerTx, {
        organizationId,
        sourceCandidateId: candidateId,
      });
      const { count } = await this.candidates.rejectCandidate(tx, {
        id: candidateId,
        organizationId,
        reason: body.reason ?? null,
        rejectedByUserId: userId,
        rejectedAt: new Date(),
      });
      if (count === 0) {
        throw new ConflictException('Sourcing candidate state changed concurrently');
      }
      return { status: 'rejected' };
    });
  }
}
