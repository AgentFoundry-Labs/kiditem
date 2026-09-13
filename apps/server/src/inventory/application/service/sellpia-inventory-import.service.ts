import { createHash } from 'node:crypto';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  type ImportSellpiaInventoryInput,
  type SellpiaInventoryImportPort,
  type SellpiaInventorySourceAttempt,
} from '../port/in/stock/sellpia-inventory-import.port';
import {
  CONFIRMED_CHANNEL_COMPONENT_REFERENCE_PORT,
  type ConfirmedChannelComponentReferencePort,
} from '../port/out/cross-domain/confirmed-channel-component-reference.port';
import {
  SELLPIA_IMPORT_RUN_REPOSITORY_PORT,
  type SellpiaFileRunClaim,
  type SellpiaImportRunRepositoryPort,
  type SellpiaPublicationExecution,
} from '../port/out/repository/sellpia-import-run.repository.port';
import {
  SELLPIA_SNAPSHOT_PUBLICATION_REPOSITORY_PORT,
  type SellpiaSnapshotPublicationRepositoryPort,
} from '../port/out/repository/sellpia-snapshot-publication.repository.port';
import { SellpiaInventoryFileValidator } from './sellpia-inventory-file.validator';
import { parseSellpiaInventoryArtifact } from './sellpia-inventory-workbook.parser';
import type { SellpiaInventoryImportResponse } from '@kiditem/shared/source-import';

@Injectable()
export class SellpiaInventoryImportService implements SellpiaInventoryImportPort {
  constructor(
    @Inject(SELLPIA_IMPORT_RUN_REPOSITORY_PORT)
    private readonly repository: SellpiaImportRunRepositoryPort,
    @Inject(SELLPIA_SNAPSHOT_PUBLICATION_REPOSITORY_PORT)
    private readonly publication: SellpiaSnapshotPublicationRepositoryPort,
    @Inject(CONFIRMED_CHANNEL_COMPONENT_REFERENCE_PORT)
    private readonly references: ConfirmedChannelComponentReferencePort,
    private readonly fileValidator: SellpiaInventoryFileValidator,
  ) {}

  async importInventory(
    input: ImportSellpiaInventoryInput,
  ): Promise<SellpiaInventoryImportResponse> {
    const fileHash = createHash('sha256').update(input.file.buffer).digest('hex');
    const claim = await this.repository.claimFileRun({
      organizationId: input.organizationId,
      userId: input.userId,
      fileName: input.file.fileName,
      fileHash,
      execution: input.execution,
    });
    if (claim.kind === 'running') {
      throw new ConflictException(
        'This Sellpia inventory file is already being imported',
      );
    }

    const execution = publicationExecution(input, claim);
    let parsed: ReturnType<typeof parseSellpiaInventoryArtifact>;
    try {
      this.fileValidator.validate({
        buffer: input.file.buffer,
        mimeType: input.file.mimeType,
      });
      parsed = parseSellpiaInventoryArtifact(input.file.buffer);
    } catch (error) {
      if (claim.kind === 'started') {
        try {
          await this.repository.markRunFailed({
            organizationId: input.organizationId,
            userId: input.userId,
            runId: claim.runId,
            attemptToken: claim.attemptToken,
            execution,
            errorCode: 'sellpia_invalid_workbook',
            errorMessage: 'Sellpia inventory artifact validation failed',
          });
        } catch {
          // Publication or a newer fenced worker may already own the terminal state.
        }
      }
      throw error;
    }

    if (claim.kind === 'completed') {
      const result = await this.publication.verifySameHash({
        organizationId: input.organizationId,
        userId: input.userId,
        runId: claim.runId,
        fileHash,
        execution,
      });
      return toHttpResponse(result);
    }

    // Confirmed references affect warning evidence only. Publication integrity
    // and hard quality thresholds do not depend on this pre-transaction read.
    const confirmedReferencedProductCodes =
      await this.references.listReferencedSellpiaProductCodes(
        input.organizationId,
      );
    const result = await this.publication.publishSnapshot({
      organizationId: input.organizationId,
      userId: input.userId,
      runId: claim.runId,
      attemptToken: claim.attemptToken,
      fileHash,
      execution,
      rows: parsed.rows,
      qualityFacts: parsed.qualityFacts,
      confirmedReferencedProductCodes,
    });
    return toHttpResponse(result);
  }

  beginAttempt(input: Parameters<SellpiaInventoryImportPort['beginAttempt']>[0]) {
    return this.repository.beginAttempt(input);
  }

  readAttempt(input: Parameters<SellpiaInventoryImportPort['readAttempt']>[0]) {
    return this.repository.readAttempt(input);
  }

  async completeAttempt(
    input: Parameters<SellpiaInventoryImportPort['completeAttempt']>[0],
  ): Promise<SellpiaInventorySourceAttempt> {
    const fileHash = createHash('sha256').update(input.file.buffer).digest('hex');
    const attempt = await this.repository.readAttempt({
      organizationId: input.organizationId,
      attemptId: input.attemptId,
    });
    assertAttemptToken(attempt, input.attemptToken);
    if (attempt.state !== 'RUNNING') {
      if (attempt.errorCode === 'ATTEMPT_EXPIRED') {
        throw new ConflictException('ATTEMPT_EXPIRED');
      }
      // Owner generations keep the persisted fileHash column null. Their
      // exact-artifact replay fence is contentChecksum; retain the legacy
      // fileHash fallback for pre-owner file-import runs.
      if (
        attempt.contentChecksum === fileHash
        || (attempt.contentChecksum === null && attempt.fileHash === fileHash)
      ) return attempt;
      throw new ConflictException('SOURCE_ATTEMPT_TERMINAL');
    }
    if (new Date(attempt.expiresAt).getTime() <= Date.now()) {
      await this.repository.failAttempt({
        organizationId: input.organizationId,
        userId: input.userId,
        attemptId: input.attemptId,
        attemptToken: input.attemptToken,
        errorCode: 'ATTEMPT_EXPIRED',
        errorMessage: 'Sellpia inventory collection expired.',
      });
      throw new ConflictException('ATTEMPT_EXPIRED');
    }

    let parsed: ReturnType<typeof parseSellpiaInventoryArtifact>;
    try {
      this.fileValidator.validate({
        buffer: input.file.buffer,
        mimeType: input.file.mimeType,
      });
      parsed = parseSellpiaInventoryArtifact(input.file.buffer);
    } catch (error) {
      try {
        await this.repository.failAttempt({
          organizationId: input.organizationId,
          userId: input.userId,
          attemptId: input.attemptId,
          attemptToken: input.attemptToken,
          errorCode: 'sellpia_invalid_workbook',
          errorMessage: 'Sellpia inventory artifact validation failed',
          fileName: input.file.fileName,
          contentChecksum: fileHash,
        });
      } catch {
        // A newer fenced owner may already have settled this attempt.
      }
      throw error;
    }

    const execution = input.manualFreshExportConfirmed === true
      ? {
          kind: 'manual' as const,
          manualFreshExportConfirmed: true as const,
          claimToken: attempt.attemptToken,
          activeGeneration: attempt.generation,
          trigger: attempt.plan.trigger,
          ownerAttempt: true as const,
        }
      : {
          kind: 'browser' as const,
          claimToken: attempt.attemptToken,
          activeGeneration: attempt.generation,
          trigger: attempt.plan.trigger,
          sourceOrigin: attempt.plan.sourceOrigin,
          sourceAccountKey: attempt.plan.sourceAccountKey,
          ownerAttempt: true as const,
        };
    const confirmedReferencedProductCodes =
      await this.references.listReferencedSellpiaProductCodes(input.organizationId);
    await this.publication.publishSnapshot({
      organizationId: input.organizationId,
      userId: input.userId,
      runId: input.attemptId,
      attemptToken: input.attemptToken,
      fileHash,
      fileName: input.file.fileName,
      contentChecksum: fileHash,
      contentByteCount: input.file.buffer.length,
      execution,
      rows: parsed.rows,
      qualityFacts: parsed.qualityFacts,
      confirmedReferencedProductCodes,
    });
    return this.repository.readAttempt({
      organizationId: input.organizationId,
      attemptId: input.attemptId,
    });
  }

  failAttempt(input: Parameters<SellpiaInventoryImportPort['failAttempt']>[0]) {
    return this.repository.failAttempt(input);
  }
}

function assertAttemptToken(
  attempt: SellpiaInventorySourceAttempt,
  attemptToken: string,
): void {
  if (attempt.attemptToken !== attemptToken) {
    throw new ConflictException('ATTEMPT_FENCE_LOST');
  }
}

function toHttpResponse(
  result: Awaited<ReturnType<SellpiaSnapshotPublicationRepositoryPort['publishSnapshot']>>,
): SellpiaInventoryImportResponse {
  return {
    ...result,
    changes: {
      createdMasterProductCount: result.changes.createdSkuCount,
      updatedMasterProductCount: result.changes.updatedSkuCount,
      inactivatedMasterProductCount: result.changes.inactivatedSkuCount,
    },
  };
}

function publicationExecution(
  input: ImportSellpiaInventoryInput,
  claim: Exclude<SellpiaFileRunClaim, { kind: 'running' }>,
): SellpiaPublicationExecution {
  if (!claim.claimedExecution) {
    throw new ConflictException('Manual Sellpia import did not acquire a generation');
  }
  return { ...input.execution, ...claim.claimedExecution };
}
