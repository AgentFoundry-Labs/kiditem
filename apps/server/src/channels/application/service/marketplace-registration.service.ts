import { ConflictException, Inject, Injectable, Optional } from '@nestjs/common';
import {
  MARKETPLACE_REGISTRATION_REPOSITORY_PORT,
  type MarketplaceRegistrationRepositoryPort,
} from '../port/out/repository/channel-listing.repository.port';
import {
  COUPANG_PROVIDER_PORT,
  type CoupangCreateSellerProductResponse,
  CoupangProviderRequestError,
  type CoupangProviderPort,
  type CoupangSellerProductPayload,
} from '../port/out/provider/coupang-provider.port';
import type {
  MarketplaceSubmissionResult,
  ChannelListingRegistrationResult,
} from '@kiditem/shared/channel-listing';
import type {
  ProductRegistrationSubmissionCapabilityInput,
  ResolveProductRegistrationCapabilityInput,
} from '../port/in/capability/marketplace-registration.port';
import { DefinitiveMarketplaceRegistrationError } from '../port/in/capability/marketplace-registration.port';
import { parseKidItemFirstRegistrationLinks } from '../../domain/kiditem-first-registration-links';

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function extractNestedSellerProductId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (!value || typeof value !== 'object') return null;
  return extractNestedSellerProductId((value as Record<string, unknown>).data);
}

function sellerProductIdFromResponse(
  response: CoupangCreateSellerProductResponse,
): string {
  const sellerProductId = extractNestedSellerProductId(response.data);
  if (sellerProductId) return sellerProductId;
  const message = stringField(response.message) ?? stringField(response.details);
  const messageText =
    message
      ? `Coupang seller product creation did not return sellerProductId: ${message}`
      : 'Coupang seller product creation did not return sellerProductId.';
  if (isExplicitProviderRejection(response)) {
    throw new DefinitiveMarketplaceRegistrationError(messageText);
  }
  throw new Error(messageText);
}

@Injectable()
export class MarketplaceRegistrationService {
  constructor(
    @Inject(MARKETPLACE_REGISTRATION_REPOSITORY_PORT)
    private readonly repository: MarketplaceRegistrationRepositoryPort,
    @Optional()
    @Inject(COUPANG_PROVIDER_PORT)
    private readonly coupang?: CoupangProviderPort,
  ) {}

  async assertExternalProductRegistrationAccount(input: {
    organizationId: string;
    channelAccountId: string;
  }): Promise<{ channel: 'coupang' }> {
    const account = await this.repository.assertActiveRegistrationAccount(input);
    if (account.channel !== 'coupang') {
      throw new ConflictException(
        'External registration confirmation requires an active Coupang Wing account.',
      );
    }
    return { channel: 'coupang' };
  }

  async reconcileProductRegistration(
    input: ProductRegistrationSubmissionCapabilityInput,
  ): Promise<MarketplaceSubmissionResult | null> {
    const account = await this.repository.assertActiveRegistrationAccount(input);
    if (account.channel !== 'coupang') return null;

    const recorded = recordedMarketplaceResult(input.registrationResult);
    if (recorded) return recorded;
    if (!this.coupang) {
      throw new Error('COUPANG_PROVIDER_PORT is required to reconcile Coupang listings.');
    }
    if (!input.providerSubmissionId) {
      if (!input.isRetry) return null;
      const response = await this.coupang.getSellerProductsByExternalVendorSku(
        input.organizationId,
        input.submissionKey,
        input.channelAccountId,
      );
      const [summary] = response.data ?? [];
      if (!summary) return null;
      return {
        providerSubmissionId: String(summary.sellerProductId),
        externalListingId: String(summary.sellerProductId),
        channel: account.channel,
        rawResult: response,
      };
    }
    const response = await this.coupang.getSellerProduct(
      input.organizationId,
      input.providerSubmissionId,
      input.channelAccountId,
    );
    const externalListingId = response.data?.sellerProductId;
    if (externalListingId === undefined || externalListingId === null) return null;
    return {
      providerSubmissionId: input.providerSubmissionId,
      externalListingId: String(externalListingId),
      channel: account.channel,
      rawResult: response,
    };
  }

  async submitProductRegistration(
    input: ProductRegistrationSubmissionCapabilityInput,
    beforeProviderCreate: () => Promise<void> = async () => undefined,
  ): Promise<MarketplaceSubmissionResult> {
    const account = await this.repository.assertActiveRegistrationAccount(input);
    if (account.channel !== 'coupang') {
      throw new Error(`Marketplace provider '${account.channel}' is not installed.`);
    }
    if (!this.coupang) {
      throw new Error('COUPANG_PROVIDER_PORT is required to submit Coupang listings.');
    }
    if (input.providerCreateAllowed !== true) {
      throw new ConflictException(
        'Provider outcome is still uncertain; automatic retry will not create a duplicate listing.',
      );
    }
    const listingPayload = listingPayloadFromFrozenSubmission(
      input.submissionPayloadJson,
      input.submissionKey,
    );
    const exactLinks = parseKidItemFirstRegistrationLinks(
      input.submissionPayloadJson,
      input.submissionKey,
    );
    if (exactLinks.masterProductId || exactLinks.optionLinks.length > 0) {
      await this.repository.preflightExactProductLinks({
        organizationId: input.organizationId,
        ...exactLinks,
      });
    }
    let response: CoupangCreateSellerProductResponse;
    try {
      response = await this.coupang.createSellerProduct(
        input.organizationId,
        listingPayload,
        input.channelAccountId,
        beforeProviderCreate,
      );
    } catch (error) {
      if (
        error instanceof CoupangProviderRequestError
        && error.providerOutcome === 'definitive_failure'
      ) {
        throw new DefinitiveMarketplaceRegistrationError(error.message);
      }
      throw error;
    }
    const externalListingId = sellerProductIdFromResponse(response);
    return {
      providerSubmissionId: externalListingId,
      externalListingId,
      channel: account.channel,
      rawResult: response,
    };
  }

  resolveProductRegistration(
    transaction: object,
    input: ResolveProductRegistrationCapabilityInput,
  ): Promise<ChannelListingRegistrationResult> {
    return this.repository.resolveProductRegistration(transaction, input);
  }

}

function isExplicitProviderRejection(
  response: CoupangCreateSellerProductResponse,
): boolean {
  const rawTopLevelCode = stringField(response.code);
  const topLevelCode = rawTopLevelCode ? rawTopLevelCode.toUpperCase() : null;
  const nested = response.data && typeof response.data === 'object'
    ? response.data
    : null;
  const rawNestedCode = stringField(nested?.code);
  const nestedCode = rawNestedCode ? rawNestedCode.toUpperCase() : null;
  return (topLevelCode !== null && !['200', 'SUCCESS'].includes(topLevelCode))
    || (nestedCode !== null && !['200', 'SUCCESS'].includes(nestedCode));
}

function listingPayloadFromFrozenSubmission(
  value: unknown,
  submissionKey: string,
): CoupangSellerProductPayload {
  const payload = asRecord(value);
  const registrationInput = asRecord(payload.registrationInput);
  const listingPayload = asRecord(registrationInput.listingPayload);
  const selected = Object.keys(listingPayload).length > 0 ? listingPayload : registrationInput;
  if (Object.keys(selected).length === 0) {
    throw new Error('Frozen preparation does not contain a marketplace listing payload.');
  }
  const items = Array.isArray(selected.items) ? selected.items : [];
  if (items.length === 0) {
    throw new Error('Frozen preparation marketplace payload must contain at least one item.');
  }
  return {
    ...selected,
    items: items.map((item, index) => ({
      ...asRecord(item),
      externalVendorSku: index === 0 ? submissionKey : `${submissionKey}:${index}`,
    })),
  };
}

function recordedMarketplaceResult(value: unknown): MarketplaceSubmissionResult | null {
  const result = asRecord(value);
  const externalListingId = stringField(result.externalListingId);
  const channel = stringField(result.channel);
  if (!externalListingId || !channel) return null;
  return {
    providerSubmissionId: stringField(result.providerSubmissionId),
    externalListingId,
    channel,
    rawResult: result.rawResult,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
