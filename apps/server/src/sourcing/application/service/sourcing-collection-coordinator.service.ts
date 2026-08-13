import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
} from '@nestjs/common';
import {
  SOURCING_COLLECTION_REPOSITORY_PORT,
  type AuthorizedCollectionOutput,
  type ClaimAuthorizedRunInput,
  type CommitAuthorizedCollectionResult,
  type SourcingCollectionPermit,
  type SourcingCollectionRepositoryPort,
} from '../port/out/repository/sourcing-collection.repository.port';

export type ExecuteSourcingCollectionInput = ClaimAuthorizedRunInput & {
  /** v2 extension posts may commit only a permit issued before browser IO. */
  requireExistingPermit?: boolean;
};

export type SourcingAuthorizedCollector = (context: {
  permit: SourcingCollectionPermit;
  checkpoint: () => Promise<void>;
}) => Promise<AuthorizedCollectionOutput>;

export type SourcingCollectionExecutionResult =
  | { kind: 'existing'; runId: string }
  | {
      kind: 'committed';
      runId: string;
      acceptedCount: number;
      duplicateCount: number;
      staleDiscardedCount: number;
    };

@Injectable()
export class SourcingCollectionCoordinator {
  constructor(
    @Inject(SOURCING_COLLECTION_REPOSITORY_PORT)
    private readonly repository: SourcingCollectionRepositoryPort,
  ) {}

  async execute(
    input: ExecuteSourcingCollectionInput,
    collector: SourcingAuthorizedCollector,
  ): Promise<SourcingCollectionExecutionResult> {
    const claim = input.requireExistingPermit
      ? await this.repository.resumeAuthorizedRun(input)
      : await this.repository.claimAuthorizedRun(input);
    if (claim.kind === 'denied') throw sourceDenied(claim.reasonCode);
    if (claim.kind === 'idempotency_conflict') throw idempotencyConflict();
    if (claim.kind === 'existing' && !input.requireExistingPermit) {
      return { kind: 'existing', runId: claim.permit.runId };
    }

    const checkpoint = async (): Promise<void> => {
      const state = await this.repository.checkpoint(claim.permit);
      if (state !== 'continue') throw collectionStopped(state);
    };

    let output: AuthorizedCollectionOutput;
    try {
      await checkpoint();
      output = await collector({ permit: claim.permit, checkpoint });
      await checkpoint();
    } catch (error: unknown) {
      await this.repository.fail({
        permit: claim.permit,
        error: normalizeCollectionError(error),
      });
      throw error;
    }

    return mapCommit(await this.repository.commit({ permit: claim.permit, output }));
  }

  async issuePermit(input: ClaimAuthorizedRunInput): Promise<SourcingCollectionPermit> {
    const claim = await this.repository.claimAuthorizedRun(input);
    if (claim.kind === 'denied') throw sourceDenied(claim.reasonCode);
    if (claim.kind === 'idempotency_conflict') throw idempotencyConflict();
    return claim.permit;
  }
}

function sourceDenied(reasonCode: string): ForbiddenException {
  return new ForbiddenException({ code: reasonCode });
}

function idempotencyConflict(): ConflictException {
  return new ConflictException({ code: 'IDEMPOTENCY_CONFLICT' });
}

function collectionStopped(state: 'cancel' | 'superseded'): GoneException {
  return new GoneException({
    code: state === 'cancel' ? 'COLLECTION_CANCELLED' : 'COLLECTION_SUPERSEDED',
  });
}

function normalizeCollectionError(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
} {
  if (error instanceof GoneException) {
    const response = error.getResponse();
    const code =
      typeof response === 'object' && response !== null && 'code' in response
        ? String(response.code)
        : 'COLLECTION_STOPPED';
    return { code, message: error.message, retryable: false };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { code: 'COLLECTION_FAILED', message, retryable: false };
}

function mapCommit(
  result: CommitAuthorizedCollectionResult,
): SourcingCollectionExecutionResult {
  if (result.kind === 'committed') return result;
  if (result.kind === 'source_denied') {
    throw sourceDenied(result.reasonCode);
  }
  if (result.kind === 'cancelled') throw collectionStopped('cancel');
  if (result.kind === 'superseded' || result.kind === 'lease_lost') {
    throw collectionStopped('superseded');
  }
  throw new TypeError('Unhandled collection commit result');
}
