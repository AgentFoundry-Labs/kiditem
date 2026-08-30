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
import type { ActiveOperationAttemptTransaction } from '../../../operations/application/port/active-browser-attempt-transaction';

export type ActiveOperationAttemptCommitFence = <T>(
  commit: (transaction: ActiveOperationAttemptTransaction) => Promise<T>,
) => Promise<T>;

export type ExecuteSourcingCollectionInput = ClaimAuthorizedRunInput & {
  /** v2 extension posts may commit only a permit issued before browser IO. */
  requireExistingPermit?: boolean;
  /** Operation-owned cancellation/fence checked before provider work and commit. */
  signal?: AbortSignal;
  operationCheckpoint?: () => Promise<void>;
  /** Atomically fences the final canonical write to an active OperationRun attempt. */
  commitWithinActiveOperationAttempt?: ActiveOperationAttemptCommitFence;
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
    await checkpointOperation(input);
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
      await checkpointOperation(input);
      await checkpoint();
      output = await collector({ permit: claim.permit, checkpoint });
      await checkpointOperation(input);
      await checkpoint();
    } catch (error: unknown) {
      await this.repository.fail({
        permit: claim.permit,
        error: normalizeCollectionError(error),
      });
      throw error;
    }

    // This is intentionally adjacent to the canonical write: collection
    // permit state alone cannot observe a cancelled OperationRun attempt.
    await checkpointOperation(input);
    await checkpoint();
    await checkpointOperation(input);
    if (!input.commitWithinActiveOperationAttempt) {
      return mapCommit(await this.repository.commit({ permit: claim.permit, output }));
    }

    let committed: CommitAuthorizedCollectionResult;
    try {
      committed = await input.commitWithinActiveOperationAttempt((transaction) =>
        this.repository.commitInAttempt(transaction, {
          permit: claim.permit,
          output,
        }));
    } catch (error: unknown) {
      await this.repository.fail({
        permit: claim.permit,
        error: normalizeCollectionError(error),
      }).catch(() => undefined);
      throw error;
    }
    return mapCommit(committed);
  }

  async issuePermit(input: ClaimAuthorizedRunInput): Promise<SourcingCollectionPermit> {
    const claim = await this.repository.claimAuthorizedRun(input);
    if (claim.kind === 'denied') throw sourceDenied(claim.reasonCode);
    if (claim.kind === 'idempotency_conflict') throw idempotencyConflict();
    return claim.permit;
  }
}

async function checkpointOperation(input: ExecuteSourcingCollectionInput): Promise<void> {
  input.signal?.throwIfAborted();
  await input.operationCheckpoint?.();
  input.signal?.throwIfAborted();
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
