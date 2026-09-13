import {
  BadRequestException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  PROFITABILITY_AD_IMPORT_REPOSITORY_PORT,
  type ProfitabilityAdImportRepositoryPort,
} from '../port/out/repository/profitability-ad-import.repository.port';
import type {
  AdvertisingProfitabilityPlan,
  AdvertisingProfitabilitySliceUpload,
  AdvertisingProfitabilitySourceView,
  AttemptFence,
  ProfitabilityAdImportPort,
} from '../port/in/profitability-ad-import.port';
import { parseBusinessDate } from '../../../common/kst';

const MAX_CHECKSUM_LENGTH = 128;
const MAX_PROVIDER_ROWS = 100_000;
const MAX_REPORT_ID_LENGTH = 128;
const MAX_REPORT_COUNT = 100_000;
const MAX_RESPONSE_BYTES = 50_000_000;
const INTEGER_MAX = 2_147_483_647;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class ProfitabilityAdImportService implements ProfitabilityAdImportPort {
  constructor(
    @Inject(PROFITABILITY_AD_IMPORT_REPOSITORY_PORT)
    private readonly repository: ProfitabilityAdImportRepositoryPort,
  ) {}

  async beginAttempt(input: {
    organizationId: string;
    idempotencyKey: string;
  }): Promise<AdvertisingProfitabilityPlan> {
    const organizationId = requiredText(input.organizationId, 'INVALID_ORGANIZATION');
    const idempotencyKey = requiredText(input.idempotencyKey, 'INVALID_IDEMPOTENCY_KEY');
    if (idempotencyKey.length > 128) {
      throw new BadRequestException('INVALID_IDEMPOTENCY_KEY');
    }
    return this.repository.beginAttempt({ organizationId, idempotencyKey });
  }

  async readSourceStatus(input: {
    organizationId: string;
  }): Promise<AdvertisingProfitabilitySourceView> {
    const organizationId = requiredText(input.organizationId, 'INVALID_ORGANIZATION');
    return this.repository.readSourceStatus({ organizationId });
  }

  async readAttemptControl(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<AdvertisingProfitabilityPlan | null> {
    return this.repository.readAttemptControl({
      organizationId: requiredText(input.organizationId, 'INVALID_ORGANIZATION'),
      attemptId: requiredText(input.attemptId, 'INVALID_ATTEMPT_ID'),
    });
  }

  async uploadSlice(input: AdvertisingProfitabilitySliceUpload): Promise<{ replayed: boolean }> {
    const normalized = normalizeUpload(input);
    return this.repository.uploadSlice(normalized);
  }

  async finalizeAttempt(input: AttemptFence): Promise<AdvertisingProfitabilitySourceView> {
    return this.repository.finalizeAttempt(normalizeFence(input));
  }

  async failAttempt(input: AttemptFence & {
    code: string;
    message: string;
  }): Promise<AdvertisingProfitabilitySourceView> {
    const fence = normalizeFence(input);
    const code = requiredText(input.code, 'INVALID_FAILURE_CODE');
    const message = requiredText(input.message, 'INVALID_FAILURE_MESSAGE');
    if (code.length > 100 || message.length > 300) {
      throw new BadRequestException('INVALID_FAILURE');
    }
    return this.repository.failAttempt({
      ...fence,
      code,
      message,
    });
  }
}

function normalizeUpload(input: AdvertisingProfitabilitySliceUpload): AdvertisingProfitabilitySliceUpload {
  const organizationId = requiredText(input.organizationId, 'INVALID_ORGANIZATION');
  const attemptId = requiredText(input.attemptId, 'INVALID_ATTEMPT_ID');
  const attemptToken = requiredText(input.attemptToken, 'INVALID_ATTEMPT_TOKEN');
  const sliceId = requiredText(input.sliceId, 'INVALID_SLICE_ID');
  if (!Number.isInteger(input.sequence) || input.sequence < 0 || input.sequence > INTEGER_MAX) {
    throw new BadRequestException('INVALID_RECEIPT_SEQUENCE');
  }
  const checksum = requiredText(input.checksum, 'INVALID_RECEIPT_CHECKSUM');
  if (checksum.length > MAX_CHECKSUM_LENGTH || !/^[a-f0-9]{64}$/i.test(checksum)) {
    throw new BadRequestException('INVALID_RECEIPT_CHECKSUM');
  }
  const providerAdvertiserId = requiredText(
    input.providerAdvertiserId,
    'INVALID_PROVIDER_ADVERTISER_ID',
  );
  if (providerAdvertiserId.length > 100) {
    throw new BadRequestException('INVALID_PROVIDER_ADVERTISER_ID');
  }
  const reportId = requiredText(input.reportId, 'INVALID_REPORT_ID');
  if (reportId.length > MAX_REPORT_ID_LENGTH) {
    throw new BadRequestException('INVALID_REPORT_ID');
  }
  if (!boundedReportCount(input.campaignCount)
    || !boundedReportCount(input.expectedRowCount)
    || !boundedReportCount(input.collectedRowCount)
    || !Number.isSafeInteger(input.responseBytes)
    || input.responseBytes < 0
    || input.responseBytes > MAX_RESPONSE_BYTES) {
    throw new BadRequestException('INVALID_PROFITABILITY_REPORT_PROOF');
  }
  if (!Array.isArray(input.rows) || input.rows.length > MAX_PROVIDER_ROWS) {
    throw new BadRequestException('INVALID_PROVIDER_ROWS');
  }
  const rows = input.rows.map((row) => {
    const businessDate = requiredText(row.businessDate, 'INVALID_PROVIDER_DATE');
    if (!DATE_PATTERN.test(businessDate) || !validCalendarDate(businessDate)) {
      throw new UnprocessableEntityException('INVALID_PROVIDER_DATE');
    }
    const externalOptionId = requiredText(row.externalOptionId, 'INVALID_PROVIDER_OPTION_ID');
    if (externalOptionId.length > 100) {
      throw new UnprocessableEntityException('INVALID_PROVIDER_OPTION_ID');
    }
    for (const value of [
      row.adSpend,
      row.impressions,
      row.clicks,
      row.orders,
      row.conversions,
      row.adRevenue,
    ]) {
      if (!Number.isSafeInteger(value) || value < 0 || value > INTEGER_MAX) {
        throw new UnprocessableEntityException('INVALID_PROVIDER_METRIC');
      }
    }
    return {
      businessDate,
      externalOptionId,
      adSpend: row.adSpend,
      impressions: row.impressions,
      clicks: row.clicks,
      orders: row.orders,
      conversions: row.conversions,
      adRevenue: row.adRevenue,
    };
  });
  if (input.expectedRowCount !== input.collectedRowCount
    || input.collectedRowCount !== rows.length) {
    throw new UnprocessableEntityException('INVALID_PROFITABILITY_REPORT_PROOF');
  }
  return {
    organizationId,
    attemptId,
    attemptToken,
    sliceId,
    sequence: input.sequence,
    checksum,
    providerAdvertiserId,
    reportId,
    campaignCount: input.campaignCount,
    expectedRowCount: input.expectedRowCount,
    collectedRowCount: input.collectedRowCount,
    responseBytes: input.responseBytes,
    rows,
  };
}

function boundedReportCount(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= MAX_REPORT_COUNT;
}

function normalizeFence(input: AttemptFence): AttemptFence {
  return {
    organizationId: requiredText(input.organizationId, 'INVALID_ORGANIZATION'),
    attemptId: requiredText(input.attemptId, 'INVALID_ATTEMPT_ID'),
    attemptToken: requiredText(input.attemptToken, 'INVALID_ATTEMPT_TOKEN'),
  };
}

function requiredText(value: unknown, code: string): string {
  if (typeof value !== 'string') throw new BadRequestException(code);
  const normalized = value.trim();
  if (normalized.length === 0) throw new BadRequestException(code);
  return normalized;
}

function validCalendarDate(value: string): boolean {
  return parseBusinessDate(value) !== null;
}
