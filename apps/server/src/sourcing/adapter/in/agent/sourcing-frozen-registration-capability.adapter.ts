import { Inject, Injectable } from '@nestjs/common';
import {
  PRODUCT_PREPARATION_REPOSITORY_PORT,
  type FrozenProductPreparationSubmission,
  type ProductPreparationRepositoryPort,
} from '../../../application/port/out/repository/product-preparation.repository.port';
import type {
  FrozenRegistrationConfirmationInput,
  FrozenRegistrationSubmissionInput,
  SourcingFrozenRegistrationReadCapabilityPort,
} from '../../../application/port/in/capability/sourcing-frozen-registration-capability.port';

/**
 * Read-only Sourcing provenance guard. It never submits a provider request,
 * finalizes a listing, or changes ProductPreparation state.
 */
@Injectable()
export class SourcingFrozenRegistrationReadCapabilityAdapter
  implements SourcingFrozenRegistrationReadCapabilityPort
{
  constructor(
    @Inject(PRODUCT_PREPARATION_REPOSITORY_PORT)
    private readonly preparations: ProductPreparationRepositoryPort,
  ) {}

  async validateSubmission(input: FrozenRegistrationSubmissionInput) {
    const frozen = await this.assertFrozen(input);
    return { displayName: frozen.displayName, expectedProviderAccountId: null };
  }

  async validateExternalConfirmation(input: FrozenRegistrationConfirmationInput) {
    const frozen = await this.assertFrozen(input);
    if (frozen.displayName !== input.displayName) {
      throw new Error('frozen_submission_mismatch:display_name');
    }
    const execution = await this.preparations.getExternalExecution({
      organizationId: input.organizationId,
      sourceCandidateId: input.sourceCandidateId,
      executionId: input.executionId,
      requestedByUserId: input.initiatingUserId,
    });
    if (execution.preparationId !== input.preparationId
      || !['executing', 'reconciling', 'succeeded'].includes(execution.status)) {
      throw new Error('frozen_submission_mismatch:execution');
    }
    return {
      displayName: frozen.displayName,
      expectedProviderAccountId: execution.expectedProviderAccountId,
    };
  }

  private async assertFrozen(input: FrozenRegistrationSubmissionInput) {
    const frozen = await this.preparations.loadFrozenSubmission(
      input.organizationId,
      input.preparationId,
    );
    const fields: Array<
      keyof Pick<
        FrozenProductPreparationSubmission,
        'executionId' | 'preparationId' | 'sourceCandidateId' | 'channelAccountId'
        | 'submissionKey' | 'submissionPayloadHash' | 'providerSubmissionId'
        | 'isRetry' | 'providerOutcome'
      >
    > = [
      'executionId', 'preparationId', 'sourceCandidateId', 'channelAccountId',
      'submissionKey', 'submissionPayloadHash', 'providerSubmissionId',
      'isRetry', 'providerOutcome',
    ];
    for (const field of fields) {
      if (input[field] !== frozen[field]) {
        throw new Error(`frozen_submission_mismatch:${field}`);
      }
    }
    if (!sameCanonicalJson(input.submissionPayloadJson, frozen.submissionPayloadJson)
      || !sameCanonicalJson(input.registrationResult, frozen.registrationResult)
      || !sameCanonicalJson({
        ...(input.masterProductId ? { masterProductId: input.masterProductId } : {}),
        optionLinks: input.optionLinks,
      }, frozenLinks(frozen.submissionPayloadJson))) {
      throw new Error('frozen_submission_mismatch');
    }
    return frozen;
  }
}

function frozenLinks(payload: unknown) {
  const root = record(payload);
  const registrationInput = record(root.registrationInput);
  return {
    ...(typeof registrationInput.masterProductId === 'string'
      ? { masterProductId: registrationInput.masterProductId }
      : {}),
    optionLinks: Array.isArray(registrationInput.optionLinks)
      ? registrationInput.optionLinks.map((link) => {
        const item = record(link);
        return {
          externalOptionId: item.externalOptionId,
          sellpiaInventorySkuId: item.sellpiaInventorySkuId,
          quantity: item.quantity,
        };
      })
      : [],
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function sameCanonicalJson(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
