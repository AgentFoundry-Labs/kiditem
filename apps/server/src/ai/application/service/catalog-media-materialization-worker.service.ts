import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  IMAGE_FETCH_PORT,
  type ImageFetchPort,
} from '../port/out/provider/image-fetch.port';
import {
  IMAGE_STORAGE_PORT,
  type ImageStoragePort,
} from '../port/out/storage/image-storage.port';

const INTERVAL_MS = 5_000;
const LEASE_MS = 2 * 60_000;
const BATCH_SIZE = 10;

type LeasedProviderAsset = {
  id: string;
  organizationId: string;
  sourceUrl: string;
  leaseToken: string;
  attemptCount: number;
};

@Injectable()
export class CatalogMediaMaterializationWorker
implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CatalogMediaMaterializationWorker.name);
  private interval: ReturnType<typeof setInterval> | null = null;
  private busy = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(IMAGE_FETCH_PORT)
    private readonly imageFetch: ImageFetchPort,
    @Inject(IMAGE_STORAGE_PORT)
    private readonly storage: ImageStoragePort,
  ) {}

  onModuleInit(): void {
    this.interval = setInterval(() => void this.tick(), INTERVAL_MS);
    this.interval.unref?.();
    void this.tick();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const assets = await this.leaseBatch();
      await Promise.all(assets.map((asset) => this.materialize(asset)));
    } catch (error) {
      this.logger.warn(
        `Catalog media materialization tick failed: ${errorMessage(error)}`,
      );
    } finally {
      this.busy = false;
    }
  }

  private async leaseBatch(): Promise<LeasedProviderAsset[]> {
    const nowMs = Date.now();
    const leaseExpiresAtMs = nowMs + LEASE_MS;
    const leasePrefix = randomUUID();
    return this.prisma.$queryRaw<LeasedProviderAsset[]>`
      WITH candidates AS (
        SELECT id
        FROM content_assets
        WHERE is_deleted = FALSE
          AND storage_key IS NULL
          AND metadata->>'sourceType' = 'coupang_catalog'
          AND COALESCE(metadata->>'active', 'true') = 'true'
          AND (
            metadata->>'materializationStatus' = 'pending'
            OR (
              metadata->>'materializationStatus' = 'failed'
              AND CASE
                WHEN metadata->>'nextMaterializationAttemptAtMs' ~ '^[0-9]+$'
                  THEN (metadata->>'nextMaterializationAttemptAtMs')::bigint
                ELSE 0
              END <= ${nowMs}
            )
            OR (
              metadata->>'materializationStatus' = 'processing'
              AND CASE
                WHEN metadata->>'materializationLeaseExpiresAtMs' ~ '^[0-9]+$'
                  THEN (metadata->>'materializationLeaseExpiresAtMs')::bigint
                ELSE 0
              END <= ${nowMs}
            )
          )
        ORDER BY updated_at ASC, id ASC
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE content_assets AS asset
      SET metadata =
        (asset.metadata - 'materializationError' - 'nextMaterializationAttemptAtMs') ||
        jsonb_build_object(
          'materializationStatus', 'processing',
          'materializationLeaseToken', ${leasePrefix}::text || ':' || asset.id::text,
          'materializationLeaseExpiresAtMs', ${leaseExpiresAtMs}::bigint,
          'materializationAttemptCount',
            CASE
              WHEN asset.metadata->>'materializationAttemptCount' ~ '^[0-9]+$'
                THEN (asset.metadata->>'materializationAttemptCount')::int + 1
              ELSE 1
            END
        ),
        updated_at = NOW()
      FROM candidates
      WHERE asset.id = candidates.id
      RETURNING
        asset.id,
        asset.organization_id AS "organizationId",
        asset.metadata->>'sourceUrl' AS "sourceUrl",
        asset.metadata->>'materializationLeaseToken' AS "leaseToken",
        (asset.metadata->>'materializationAttemptCount')::int AS "attemptCount"
    `;
  }

  private async materialize(asset: LeasedProviderAsset): Promise<void> {
    try {
      const fetched = await this.imageFetch.fetchImage(asset.sourceUrl);
      this.imageFetch.assertSupportedMime(fetched.mimeType);
      const extension = this.imageFetch.extForMime(fetched.mimeType);
      const storageKey =
        `content-assets/coupang/${asset.organizationId}/${asset.id}.${extension}`;
      const managedUrl = await this.storage.save(
        storageKey,
        fetched.buffer,
        fetched.mimeType,
      );
      const materializedAtMs = Date.now();
      await this.prisma.$executeRaw`
        UPDATE content_assets
        SET
          url = ${managedUrl},
          storage_key = ${storageKey},
          mime_type = ${fetched.mimeType},
          file_size = ${fetched.buffer.length},
          metadata =
            (metadata
              - 'materializationLeaseToken'
              - 'materializationLeaseExpiresAtMs'
              - 'materializationError'
              - 'nextMaterializationAttemptAtMs') ||
            jsonb_build_object(
              'materializationStatus', 'ready',
              'materializedAtMs', ${materializedAtMs}::bigint
            ),
          updated_at = NOW()
        WHERE id = ${asset.id}::uuid
          AND organization_id = ${asset.organizationId}::uuid
          AND metadata->>'materializationLeaseToken' = ${asset.leaseToken}
      `;
    } catch (error) {
      await this.markFailed(asset, error);
    }
  }

  private async markFailed(
    asset: LeasedProviderAsset,
    error: unknown,
  ): Promise<void> {
    const retryDelayMs = Math.min(
      60 * 60_000,
      30_000 * 2 ** Math.min(asset.attemptCount - 1, 7),
    );
    const nextAttemptAtMs = Date.now() + retryDelayMs;
    const diagnostic = errorMessage(error).slice(0, 500);
    await this.prisma.$executeRaw`
      UPDATE content_assets
      SET
        metadata =
          (metadata
            - 'materializationLeaseToken'
            - 'materializationLeaseExpiresAtMs') ||
          jsonb_build_object(
            'materializationStatus', 'failed',
            'materializationError', ${diagnostic}::text,
            'nextMaterializationAttemptAtMs', ${nextAttemptAtMs}::bigint
          ),
        updated_at = NOW()
      WHERE id = ${asset.id}::uuid
        AND organization_id = ${asset.organizationId}::uuid
        AND metadata->>'materializationLeaseToken' = ${asset.leaseToken}
    `;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
