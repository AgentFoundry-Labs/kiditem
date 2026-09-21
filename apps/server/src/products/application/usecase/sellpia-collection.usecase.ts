import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ProductSourceConflictError } from '../exception/product-source.error';
import type {
  SellpiaCollectionAttempt,
  SellpiaCollectionPort,
} from '../port/in/sellpia-collection.port';
import {
  PRODUCT_SOURCE_COLLECTION_REPOSITORY_PORT,
  type ProductSourceCollectionRepositoryPort,
} from '../port/out/persistence/product-source-collection.repository.port';
import {
  PRODUCT_SOURCE_PUBLICATION_REPOSITORY_PORT,
  type ProductSourcePublicationRepositoryPort,
} from '../port/out/persistence/product-source-publication.repository.port';
import {
  SELLPIA_PAYLOAD_DECODER_PORT,
  type SellpiaPayloadDecoderPort,
} from '../port/out/source/sellpia-payload-decoder.port';

@Injectable()
export class SellpiaCollectionUseCase implements SellpiaCollectionPort {
  constructor(
    @Inject(PRODUCT_SOURCE_COLLECTION_REPOSITORY_PORT)
    private readonly repository: ProductSourceCollectionRepositoryPort,
    @Inject(PRODUCT_SOURCE_PUBLICATION_REPOSITORY_PORT)
    private readonly publication: ProductSourcePublicationRepositoryPort,
    @Inject(SELLPIA_PAYLOAD_DECODER_PORT)
    private readonly decoder: SellpiaPayloadDecoderPort,
  ) {}

  beginAttempt(input: Parameters<SellpiaCollectionPort['beginAttempt']>[0]) {
    return this.repository.beginAttempt(input);
  }

  readAttempt(input: Parameters<SellpiaCollectionPort['readAttempt']>[0]) {
    return this.repository.readAttempt(input);
  }

  async completeAttempt(
    input: Parameters<SellpiaCollectionPort['completeAttempt']>[0],
  ): Promise<SellpiaCollectionAttempt> {
    const fileHash = createHash('sha256').update(input.file.buffer).digest('hex');
    const attempt = await this.repository.readAttempt({
      organizationId: input.organizationId,
      attemptId: input.attemptId,
    });
    assertAttemptToken(attempt, input.attemptToken);
    if (attempt.state !== 'RUNNING') {
      if (attempt.errorCode === 'ATTEMPT_EXPIRED') {
        throw new ProductSourceConflictError('ATTEMPT_EXPIRED');
      }
      if (
        attempt.contentChecksum === fileHash
        || (attempt.contentChecksum === null && attempt.fileHash === fileHash)
      ) return attempt;
      throw new ProductSourceConflictError('SOURCE_ATTEMPT_TERMINAL');
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
      throw new ProductSourceConflictError('ATTEMPT_EXPIRED');
    }

    let parsed: ReturnType<SellpiaPayloadDecoderPort['decode']>;
    try {
      this.decoder.validate({ buffer: input.file.buffer, mimeType: input.file.mimeType });
      parsed = this.decoder.decode({ buffer: input.file.buffer, mimeType: input.file.mimeType });
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

    const execution = {
      kind: 'browser' as const,
      claimToken: attempt.attemptToken,
      activeGeneration: attempt.generation,
      trigger: attempt.plan.trigger,
      sourceOrigin: attempt.plan.sourceOrigin,
      sourceAccountKey: attempt.plan.sourceAccountKey,
      ownerAttempt: true as const,
    };
    try {
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
      });
    } catch (error) {
      const terminal = await this.repository.readAttempt({
        organizationId: input.organizationId,
        attemptId: input.attemptId,
      });
      if (
        terminal.state === 'COMPLETE'
        && (terminal.contentChecksum === fileHash
          || (terminal.contentChecksum === null && terminal.fileHash === fileHash))
      ) return terminal;
      throw error;
    }
    return this.repository.readAttempt({
      organizationId: input.organizationId,
      attemptId: input.attemptId,
    });
  }

  failAttempt(input: Parameters<SellpiaCollectionPort['failAttempt']>[0]) {
    return this.repository.failAttempt(input);
  }

  cancelAttempt(input: Parameters<SellpiaCollectionPort['cancelAttempt']>[0]) {
    return this.repository.cancelAttempt(input);
  }
}

function assertAttemptToken(
  attempt: SellpiaCollectionAttempt,
  attemptToken: string,
): void {
  if (attempt.attemptToken !== attemptToken) {
    throw new ProductSourceConflictError('ATTEMPT_FENCE_LOST');
  }
}
