import type {
  CreateProductPreparationInput,
  UpdateProductPreparationInput,
} from '@kiditem/shared/sourcing';
import type { SourcingRepositoryTransaction } from '../transaction/repository-transaction';
import type {
  ResolvedRegistrationContentSelections,
  ValidateRegistrationContentSelectionsInput,
} from '../cross-domain/registration-content-workspace.port';

export const PRODUCT_PREPARATION_REPOSITORY_PORT = Symbol(
  'PRODUCT_PREPARATION_REPOSITORY_PORT',
);

export interface ProductPreparationDraftResult {
  preparationId: string;
  status: 'draft';
  sourceContentWorkspaceId?: string;
}

export interface ProductPreparationCancelledResult {
  preparationId: string;
  status: 'cancelled';
}

export type ReplaceDraftInputCommand =
  | { kind: 'replace'; input: UpdateProductPreparationInput }
  | { kind: 'cancel' };

export interface ReplaceDraftInputRequest {
  organizationId: string;
  preparationId: string;
  userId: string | null;
  command: ReplaceDraftInputCommand;
}

export interface CreateOrGetActiveDraftInput {
  organizationId: string;
  sourceCandidateId: string;
  createdByUserId: string | null;
  input: CreateProductPreparationInput;
}

export type ResolveProductPreparationSelections = (
  tx: SourcingRepositoryTransaction,
  input: ValidateRegistrationContentSelectionsInput,
) => Promise<ResolvedRegistrationContentSelections>;

/**
 * 초안(`ProductPreparation`) 저장소. 제출 울타리는 Channels 것이므로
 * ([ADR-0014](../../../../../../../../docs/adr/0014-channels-owns-the-registration-execution-fence.md))
 * 여기에는 실행 행을 읽고 쓰는 방법이 없다 — 초안을 만들고 고치고 버리는 것까지다.
 */
export interface ProductPreparationRepositoryPort {
  /**
   * 후보를 종료(거절·삭제)해도 되는지 초안 쪽에서 본다. 살아 있는 초안이나 남아
   * 있는 공급자 식별자가 있으면 던진다. 실행 쪽 근거는 Channels 리더가 본다.
   */
  assertCandidateTerminalTransitionAllowed(
    tx: SourcingRepositoryTransaction,
    input: { organizationId: string; sourceCandidateId: string },
  ): Promise<void>;

  createOrGetActiveDraft(
    input: CreateOrGetActiveDraftInput,
    resolveSourceWorkspace: (tx: SourcingRepositoryTransaction) => Promise<string>,
    resolveSelections: ResolveProductPreparationSelections,
  ): Promise<ProductPreparationDraftResult>;

  replaceDraftInput(
    input: ReplaceDraftInputRequest,
    resolveSelections: ResolveProductPreparationSelections,
  ): Promise<ProductPreparationDraftResult | ProductPreparationCancelledResult>;
}
