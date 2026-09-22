import { Inject, Injectable, NotImplementedException } from '@nestjs/common';
import type {
  CreateProductPreparationInput,
  UpdateProductPreparationInput,
} from '@kiditem/shared/sourcing';
import {
  CANDIDATE_REGISTRATION_PORT,
  type CandidateRegistrationPort,
} from '../../../channels/application/port/in/candidate-registration.port';
import {
  REGISTRATION_CONTENT_WORKSPACE_PORT,
  type RegistrationContentWorkspacePort,
} from '../port/in/registration-content-workspace.port';

/**
 * 수집후보의 등록 초안.
 *
 * 여기서 끝난다 — 계정에 제출하는 것은 Channels 의 등록 실행 울타리다
 * ([ADR-0014](../../../../../../docs/adr/0014-channels-owns-the-registration-execution-fence.md)).
 * 후보의 등록 상태도 초안이 아니라 그 울타리를 읽어서 비춘다.
 */
@Injectable()
export class ProductPreparationService {
  constructor(
    @Inject(CANDIDATE_REGISTRATION_PORT)
    private readonly preparations: CandidateRegistrationPort,
    @Inject(REGISTRATION_CONTENT_WORKSPACE_PORT)
    private readonly contentWorkspaces: RegistrationContentWorkspacePort,
  ) {}

  async createDraft(
    organizationId: string,
    candidateId: string,
    userId: string | null,
    input: CreateProductPreparationInput,
  ): Promise<{ preparationId: string; status: 'draft' }> {
    const result = await this.preparations.createOrGetActiveDraft(
      {
        organizationId,
        sourceCandidateId: candidateId,
        createdByUserId: userId,
        input,
      },
      (tx) => this.contentWorkspaces.ensureCandidateWorkspace(tx, {
        organizationId,
        sourceCandidateId: candidateId,
        displayName: input.displayName,
        createdByUserId: userId,
      }),
      (tx, selections) => this.contentWorkspaces.resolveSourceSelections(tx, selections),
    );
    return { preparationId: result.preparationId, status: 'draft' };
  }

  async updateDraft(
    organizationId: string,
    preparationId: string,
    userId: string | null,
    input: UpdateProductPreparationInput,
  ): Promise<{ preparationId: string; status: 'draft' }> {
    const result = await this.preparations.replaceDraftInput(
      {
        organizationId,
        preparationId,
        userId,
        command: { kind: 'replace', input },
      },
      (tx, selections) => this.contentWorkspaces.resolveSourceSelections(tx, selections),
    );
    if (result.status !== 'draft') throw new Error('Draft replacement did not return a draft.');
    return result;
  }

  submit(
    _organizationId: string,
    _preparationId: string,
    _userId: string | null,
  ): never {
    throw new NotImplementedException(
      'Coupang Open API product submission is not supported. Use the WING browser confirmation flow.',
    );
  }

  async cancel(
    organizationId: string,
    preparationId: string,
    userId: string | null,
  ): Promise<{ preparationId: string; status: 'cancelled' }> {
    const result = await this.preparations.replaceDraftInput(
      {
        organizationId,
        preparationId,
        userId,
        command: { kind: 'cancel' },
      },
      (tx, selections) => this.contentWorkspaces.resolveSourceSelections(tx, selections),
    );
    if (result.status !== 'cancelled') throw new Error('Preparation cancellation did not complete.');
    return result;
  }
}
