import { createHash } from 'node:crypto';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import type { AgentCapabilityHandler } from '../../../../agent-os/application/port/out/capability/agent-capability-handler.port';
import { AgentCapabilityRegistry } from '../../../../agent-os/application/service/agent-capability-registry.service';
import {
  type ChannelsMarketplaceRegistrationCapabilityPort,
  type RegisterConfirmedMarketplaceListingCapabilityInput,
  type RegisterConfirmedMarketplaceListingCapabilityResult,
  type SubmitCoupangMarketplaceListingCapabilityInput,
  type SubmitCoupangMarketplaceListingCapabilityResult,
} from '../../../application/port/in/capability/marketplace-registration.port';
import { MarketplaceRegistrationService } from '../../../application/service/marketplace-registration.service';

const CHANNEL_CONFIRMED_LISTING_REGISTRATION_KEY =
  'channels.register_confirmed_listing';
const CHANNEL_COUPANG_LISTING_SUBMISSION_KEY =
  'channels.submit_coupang_listing';

const ConfirmedListingRegistrationInputSchema = z.object({
  masterId: z.string().uuid(),
  channelAccountId: z.string().uuid(),
  externalId: z.string().trim().min(1).max(100),
  productBarcode: z.string().trim().min(1).max(100).nullable().optional(),
  channelName: z.string().trim().min(1).max(500).nullable().optional(),
  channelPrice: z.number().int().min(0).nullable().optional(),
});

const ConfirmedListingRegistrationOutputSchema = z.object({
  listingId: z.string().min(1),
  masterId: z.string().min(1),
  channel: z.string().min(1),
  channelAccountId: z.string().min(1),
  externalId: z.string().min(1),
  channelName: z.string().nullable(),
  channelPrice: z.number().nullable(),
  status: z.string().nullable(),
});

const NonEmptyRecordSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Expected at least one listing payload field',
  });

const CoupangListingSubmissionInputSchema = z.object({
  masterId: z.string().uuid(),
  channelAccountId: z.string().uuid(),
  productBarcode: z.string().trim().min(1).max(100).nullable().optional(),
  listingPayload: NonEmptyRecordSchema,
});

const CoupangListingSubmissionOutputSchema = z.object({
  listingId: z.string().min(1),
  sellerProductId: z.string().min(1),
  masterId: z.string().min(1),
  channel: z.string().min(1),
  channelAccountId: z.string().min(1),
  externalId: z.string().min(1),
  status: z.string().nullable(),
});

type ConfirmedListingRegistrationInput = z.infer<
  typeof ConfirmedListingRegistrationInputSchema
>;

type ConfirmedListingRegistrationOutput = z.infer<
  typeof ConfirmedListingRegistrationOutputSchema
>;

type CoupangListingSubmissionInput = z.infer<
  typeof CoupangListingSubmissionInputSchema
>;

type CoupangListingSubmissionOutput = z.infer<
  typeof CoupangListingSubmissionOutputSchema
>;

function normalizeForHash(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => normalizeForHash(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalizeForHash(entry)]),
    );
  }
  return value;
}

function stableHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(normalizeForHash(value)))
    .digest('hex')
    .slice(0, 24);
}

@Injectable()
export class ChannelRegistrationCapabilityAdapter
  implements OnModuleInit, ChannelsMarketplaceRegistrationCapabilityPort
{
  constructor(
    private readonly registry: AgentCapabilityRegistry,
    private readonly marketplaceRegistration: MarketplaceRegistrationService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.confirmedListingHandler());
    this.registry.register(this.coupangListingSubmissionHandler());
  }

  async registerConfirmedListing(
    organizationId: string,
    input: RegisterConfirmedMarketplaceListingCapabilityInput,
  ): Promise<RegisterConfirmedMarketplaceListingCapabilityResult> {
    return this.marketplaceRegistration.registerConfirmedListing(
      organizationId,
      input,
    );
  }

  async submitCoupangListing(
    organizationId: string,
    input: SubmitCoupangMarketplaceListingCapabilityInput,
  ): Promise<SubmitCoupangMarketplaceListingCapabilityResult> {
    return this.marketplaceRegistration.submitCoupangListing(
      organizationId,
      input,
    );
  }

  private confirmedListingHandler(): AgentCapabilityHandler<
    ConfirmedListingRegistrationInput,
    ConfirmedListingRegistrationOutput
  > {
    return {
      key: CHANNEL_CONFIRMED_LISTING_REGISTRATION_KEY,
      ownerDomain: 'channels',
      executionKind: 'workflow',
      inputSchema: ConfirmedListingRegistrationInputSchema,
      outputSchema: ConfirmedListingRegistrationOutputSchema,
      sideEffects: ['db_write'],
      approvalRisk: 'high',
      idempotencyKey: ({ organizationId, input }) =>
        [
          organizationId,
          CHANNEL_CONFIRMED_LISTING_REGISTRATION_KEY,
          input.channelAccountId,
          input.externalId,
        ].join(':'),
      execute: async ({ organizationId, input }) => {
        const normalized = ConfirmedListingRegistrationInputSchema.parse(input);
        const listing = await this.registerConfirmedListing(organizationId, {
          masterId: normalized.masterId,
          channelAccountId: normalized.channelAccountId,
          externalId: normalized.externalId,
          productBarcode: normalized.productBarcode,
          channelName: normalized.channelName,
          channelPrice: normalized.channelPrice,
        });
        const outputSummary: ConfirmedListingRegistrationOutput = {
          listingId: listing.id,
          masterId: listing.masterId,
          channel: listing.channel,
          channelAccountId: listing.channelAccountId ?? normalized.channelAccountId,
          externalId: listing.externalId,
          channelName: listing.channelName,
          channelPrice: listing.channelPrice,
          status: listing.status,
        };

        return {
          resourceType: 'channel_listing',
          resourceId: listing.id,
          outputSummary,
          artifacts: [
            {
              artifactType: 'channel_listing_registration',
              targetDomain: 'channels',
              targetModel: 'ChannelListing',
              targetId: listing.id,
              title: '등록상품 연결 완료',
              href: '/product-pipeline/registered-products',
              summary: {
                listingId: listing.id,
                masterId: listing.masterId,
                channel: listing.channel,
                channelAccountId:
                  listing.channelAccountId ?? normalized.channelAccountId,
                externalId: listing.externalId,
                status: listing.status,
              },
            },
          ],
        };
      },
    };
  }

  private coupangListingSubmissionHandler(): AgentCapabilityHandler<
    CoupangListingSubmissionInput,
    CoupangListingSubmissionOutput
  > {
    return {
      key: CHANNEL_COUPANG_LISTING_SUBMISSION_KEY,
      ownerDomain: 'channels',
      executionKind: 'workflow',
      inputSchema: CoupangListingSubmissionInputSchema,
      outputSchema: CoupangListingSubmissionOutputSchema,
      sideEffects: ['external_write', 'db_write'],
      approvalRisk: 'high',
      idempotencyKey: ({ organizationId, input }) =>
        [
          organizationId,
          CHANNEL_COUPANG_LISTING_SUBMISSION_KEY,
          input.channelAccountId,
          input.masterId,
          stableHash(input.listingPayload),
        ].join(':'),
      execute: async ({ organizationId, input }) => {
        const normalized = CoupangListingSubmissionInputSchema.parse(input);
        const submission = await this.submitCoupangListing(organizationId, {
          masterId: normalized.masterId,
          channelAccountId: normalized.channelAccountId,
          productBarcode: normalized.productBarcode,
          listingPayload: normalized.listingPayload,
        });
        const outputSummary: CoupangListingSubmissionOutput = {
          listingId: submission.listingId,
          sellerProductId: submission.sellerProductId,
          masterId: submission.masterId,
          channel: submission.channel,
          channelAccountId:
            submission.channelAccountId ?? normalized.channelAccountId,
          externalId: submission.externalId,
          status: submission.status,
        };

        return {
          resourceType: 'channel_listing',
          resourceId: submission.listingId,
          outputSummary,
          artifacts: [
            {
              artifactType: 'coupang_listing_submission',
              targetDomain: 'channels',
              targetModel: 'ChannelListing',
              targetId: submission.listingId,
              title: '쿠팡 상품 등록 제출 완료',
              href: '/product-pipeline/registered-products',
              summary: outputSummary,
            },
          ],
        };
      },
    };
  }
}
