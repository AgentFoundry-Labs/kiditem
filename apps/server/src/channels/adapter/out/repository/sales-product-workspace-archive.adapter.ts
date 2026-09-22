import { Inject, Injectable } from '@nestjs/common';
import {
  AI_WORKSPACE_ARCHIVE_PORT,
  type AiWorkspaceArchivePort,
  type AiWorkspaceArchiveScope,
} from '../../../../ai/application/port/in/workspace/sales-product-workspace-archive.port';
import { ownerTransactionClient } from '../../../../prisma/owner-transaction';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import type { SalesProductWorkspaceArchivePort } from '../../../application/port/out/ai/sales-product-workspace-archive.port';

/**
 * 초안을 더 쓰지 않기로 하면 그 콘텐츠 작업공간도 보관한다(KID-310).
 *
 * 행을 쓰는 것은 AI 다 — Channels 는 초안을 내리는 트랜잭션을 그대로 넘긴다.
 */
@Injectable()
export class SalesProductWorkspaceArchiveAdapter implements SalesProductWorkspaceArchivePort {
  constructor(
    @Inject(AI_WORKSPACE_ARCHIVE_PORT)
    private readonly aiArchive: AiWorkspaceArchivePort,
  ) {}

  async archiveSalesProductWorkspace(
    transaction: OwnerTransaction,
    input: {
      organizationId: string;
      salesProductId: string;
      archivedAt: Date;
    },
  ): Promise<void> {
    await this.aiArchive.archiveSalesProductWorkspace(
      ownerTransactionClient(transaction) as unknown as AiWorkspaceArchiveScope,
      input,
    );
  }
}
