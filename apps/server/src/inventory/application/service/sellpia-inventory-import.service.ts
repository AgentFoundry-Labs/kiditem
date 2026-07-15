import { createHash } from 'node:crypto';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { SellpiaInventoryImportResponse } from '@kiditem/shared/source-import';
import {
  type ImportSellpiaInventoryInput,
  type SellpiaInventoryImportPort,
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
import { parseSellpiaInventoryWorkbook } from './sellpia-inventory-workbook.parser';

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
    try {
      this.fileValidator.validate({
        buffer: input.file.buffer,
        mimeType: input.file.mimeType,
      });
      const parsed = parseSellpiaInventoryWorkbook(input.file.buffer);

      if (claim.kind === 'completed') {
        return await this.publication.verifySameHash({
          organizationId: input.organizationId,
          userId: input.userId,
          runId: claim.runId,
          fileHash,
          execution,
        });
      }

      const confirmedReferencedProductCodes =
        await this.references.listReferencedSellpiaProductCodes(
          input.organizationId,
        );
      return await this.publication.publishSnapshot({
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
            errorMessage: 'Sellpia inventory workbook validation failed',
          });
        } catch {
          // Publication or a newer fenced worker may already own the terminal state.
        }
      }
      throw error;
    }
  }
}

function publicationExecution(
  input: ImportSellpiaInventoryInput,
  claim: Exclude<SellpiaFileRunClaim, { kind: 'running' }>,
): SellpiaPublicationExecution {
  if (input.execution.kind === 'browser') return input.execution;
  if (!claim.claimedExecution) {
    throw new ConflictException('Manual Sellpia import did not acquire a generation');
  }
  return { ...input.execution, ...claim.claimedExecution };
}
