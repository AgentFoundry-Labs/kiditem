import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  ReconciliationItemStatus,
  ReconciliationMatchReason,
  ReconciliationResolutionSource,
} from '@kiditem/shared/channel-reconciliation';
import { PrismaService } from '../../../prisma/prisma.service';

export interface ReconciliationRowInput {
  externalId: string;
  externalOptionId?: string | null;
  legacyCode?: string | null;
  channelProductName?: string | null;
  channelOptionName?: string | null;
  channelImageUrl?: string | null;
  channelUrl?: string | null;
  channelStatus?: string | null;
}

export interface MatchOutcome {
  status: ReconciliationItemStatus;
  matchReason: ReconciliationMatchReason;
  resolutionSource: ReconciliationResolutionSource | null;
  confidence: number | null;
  linkedListingId: string | null;
  linkedListingOptionId: string | null;
  linkedMasterProductId: string | null;
  linkedProductOptionId: string | null;
  conflictJson: Prisma.InputJsonValue | null;
}

export interface ProductOptionCandidate {
  id: string;
  masterId: string;
}

export interface ChannelListingHandle {
  id: string;
  masterId: string;
}

export interface ChannelListingOptionHandle {
  id: string;
  optionId: string | null;
}

export interface OptionLinkBackfillResult {
  optionLinkedCount: number;
  optionLinkAmbiguousCount: number;
  optionLinkNoCandidateCount: number;
}

export type Tx = Prisma.TransactionClient;

export type PrismaLike = PrismaClient | PrismaService;

export const RECONCILIATION_CHANNEL = 'coupang';
export const DEFAULT_LIMIT = 50;
export const MAX_PAGE = 200;
export const LINKED_RESOLUTION_SOURCES = [
  'existing_external_id',
  'auto_legacy_code',
  'manual',
  'ignored',
] as const satisfies ReconciliationResolutionSource[];
