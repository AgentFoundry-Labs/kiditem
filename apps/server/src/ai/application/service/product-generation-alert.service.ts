import { Inject, Injectable } from '@nestjs/common';
import {
  OPERATION_ALERT_PORT,
  type OperationAlertPort,
} from '../../../automation/application/port/in/operation-alert.port';
import type { AlertRecord } from '../../../automation/application/port/persistence-records';
import { PrismaService } from '../../../prisma/prisma.service';
import type { ProductGenerationChildKind } from './product-generation-alert-link';
import { productGenerationOperationKey } from './product-generation-alert-link';

type ChildStatus = 'queued' | 'succeeded' | 'failed';

interface ProductGenerationChildIds {
  detailPageGenerationId: string | null;
  thumbnailGenerationId: string | null;
}

interface ProductGenerationChildren {
  detail_page: ChildStatus;
  thumbnail: ChildStatus;
}

type ProductGenerationChildStartResult =
  | { status: 'started'; alert: AlertRecord }
  | { status: 'parent_terminal'; alert: AlertRecord }
  | { status: 'parent_not_found'; alert: null };

const PARENT_TERMINAL_STATUSES = new Set([
  'succeeded',
  'failed',
  'cancelled',
  'resolved',
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function childIdsFrom(metadata: unknown): ProductGenerationChildIds {
  const raw = asRecord(asRecord(metadata).childIds);
  return {
    detailPageGenerationId:
      typeof raw.detailPageGenerationId === 'string'
        ? raw.detailPageGenerationId
        : null,
    thumbnailGenerationId:
      typeof raw.thumbnailGenerationId === 'string'
        ? raw.thumbnailGenerationId
        : null,
  };
}

function childrenSnapshotFrom(metadata: unknown): ProductGenerationChildren {
  const raw = asRecord(asRecord(metadata).children);
  const detail = raw.detail_page;
  const thumbnail = raw.thumbnail;
  return {
    detail_page:
      detail === 'succeeded' || detail === 'failed' ? detail : 'queued',
    thumbnail:
      thumbnail === 'succeeded' || thumbnail === 'failed' ? thumbnail : 'queued',
  };
}

function mergeChildId(
  childIds: ProductGenerationChildIds,
  childKind: ProductGenerationChildKind,
  childId: string,
): ProductGenerationChildIds {
  const isSyntheticEnqueueId = childId.endsWith('-enqueue');
  if (
    isSyntheticEnqueueId &&
    childKind === 'detail_page' &&
    childIds.detailPageGenerationId
  ) {
    return childIds;
  }
  if (
    isSyntheticEnqueueId &&
    childKind === 'thumbnail' &&
    childIds.thumbnailGenerationId
  ) {
    return childIds;
  }
  return childKind === 'detail_page'
    ? { ...childIds, detailPageGenerationId: childId }
    : { ...childIds, thumbnailGenerationId: childId };
}

function normalizeDetailStatus(status: string | null | undefined): ChildStatus {
  if (status === 'READY' || status === 'ready' || status === 'succeeded') {
    return 'succeeded';
  }
  if (
    status === 'FAILED' ||
    status === 'failed' ||
    status === 'CANCELLED' ||
    status === 'cancelled'
  ) {
    return 'failed';
  }
  return 'queued';
}

function normalizeThumbnailStatus(status: string | null | undefined): ChildStatus {
  if (status === 'succeeded') return 'succeeded';
  if (status === 'failed' || status === 'cancelled') return 'failed';
  return 'queued';
}

function progressFor(children: ProductGenerationChildren): number {
  const completed = [children.detail_page, children.thumbnail].filter(
    (status) => status === 'succeeded' || status === 'failed',
  ).length;
  if (completed === 0) return 0.25;
  if (completed === 1) return 0.6;
  return 1;
}

function allTerminal(children: ProductGenerationChildren): boolean {
  return [children.detail_page, children.thumbnail].every(
    (status) => status === 'succeeded' || status === 'failed',
  );
}

function failureMessage(children: ProductGenerationChildren): string {
  const failed: string[] = [];
  if (children.detail_page === 'failed') failed.push('상세페이지 생성 실패');
  if (children.thumbnail === 'failed') failed.push('썸네일 생성 실패');
  if (failed.length === 2) {
    return '상품 생성 실패: 상세페이지와 썸네일 생성 실패';
  }
  return `상품 생성 일부 실패: ${failed.join(', ')}`;
}

@Injectable()
export class ProductGenerationAlertService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OPERATION_ALERT_PORT)
    private readonly operationAlerts: OperationAlertPort,
  ) {}

  async start(input: {
    organizationId: string;
    actorUserId: string | null;
    batchId: string;
    candidateId: string;
    productName: string;
    href: string;
  }) {
    const operationKey = productGenerationOperationKey(input.batchId);
    return this.operationAlerts.start({
      organizationId: input.organizationId,
      operationKey,
      type: 'product_generation',
      title: `상품 생성 중: ${input.productName.slice(0, 40)}`,
      message: '상품 작업공간을 만들고 상세페이지와 썸네일 생성을 시작했습니다.',
      sourceType: 'sourcing_candidate',
      sourceId: input.candidateId,
      targetType: 'sourcing_candidate',
      targetId: input.candidateId,
      actorUserId: input.actorUserId,
      href: input.href,
      progress: 0.15,
      metadata: {
        productGenerationBatchId: input.batchId,
        productName: input.productName,
        children: {
          detail_page: 'queued',
          thumbnail: 'queued',
        } satisfies ProductGenerationChildren,
        childIds: {
          detailPageGenerationId: null,
          thumbnailGenerationId: null,
        } satisfies ProductGenerationChildIds,
      },
    });
  }

  async recordChildStarted(input: {
    organizationId: string;
    parentOperationKey: string;
    childKind: ProductGenerationChildKind;
    childId: string;
  }): Promise<ProductGenerationChildStartResult> {
    const alert = await this.operationAlerts.findByOperationKey(
      input.organizationId,
      input.parentOperationKey,
    );
    if (!alert) return { status: 'parent_not_found', alert: null };
    if (PARENT_TERMINAL_STATUSES.has(alert.status)) {
      return { status: 'parent_terminal', alert };
    }

    const metadata = asRecord(alert.metadata);
    const childIds = mergeChildId(
      childIdsFrom(metadata),
      input.childKind,
      input.childId,
    );

    const updated = await this.operationAlerts.progress(input.organizationId, input.parentOperationKey, {
      progress: Math.max(alert.progress ?? 0, 0.25),
      metadata: {
        childIds,
        children: childrenSnapshotFrom(metadata),
        lastStartedChild: input.childKind,
      },
    });
    if (!updated) return { status: 'parent_not_found', alert: null };
    if (PARENT_TERMINAL_STATUSES.has(updated.status)) {
      return { status: 'parent_terminal', alert: updated };
    }
    return { status: 'started', alert: updated };
  }

  async canStartChild(input: {
    organizationId: string;
    parentOperationKey: string;
  }): Promise<boolean> {
    const alert = await this.operationAlerts.findByOperationKey(
      input.organizationId,
      input.parentOperationKey,
    );
    return Boolean(alert && !PARENT_TERMINAL_STATUSES.has(alert.status));
  }

  async markChildFinished(input: {
    organizationId: string;
    parentOperationKey: string;
    childKind: ProductGenerationChildKind;
    status: 'succeeded' | 'failed';
    childId: string;
    errorMessage?: string | null;
  }) {
    const alert = await this.operationAlerts.findByOperationKey(
      input.organizationId,
      input.parentOperationKey,
    );
    if (!alert) return null;
    if (alert.status === 'cancelled') return alert;

    const metadata = asRecord(alert.metadata);
    const childIds = mergeChildId(
      childIdsFrom(metadata),
      input.childKind,
      input.childId,
    );
    const children = await this.readChildrenFromLedgers(input.organizationId, childIds);
    if (input.childId.endsWith('-enqueue')) {
      children[input.childKind] = input.status;
    }

    const nextMetadata = {
      children,
      childIds,
      lastFinishedChild: input.childKind,
      lastFinishedChildStatus: input.status,
      ...(input.errorMessage ? { lastChildError: input.errorMessage } : {}),
    };
    const progress = progressFor(children);

    if (!allTerminal(children)) {
      return this.operationAlerts.progress(input.organizationId, input.parentOperationKey, {
        progress,
        metadata: nextMetadata,
      });
    }

    if (children.detail_page === 'failed' || children.thumbnail === 'failed') {
      return this.operationAlerts.fail(input.organizationId, input.parentOperationKey, {
        message: failureMessage(children),
        progress,
        metadata: nextMetadata,
      });
    }

    return this.operationAlerts.succeed(input.organizationId, input.parentOperationKey, {
      message: '상세페이지와 썸네일 생성이 완료되었습니다.',
      progress,
      metadata: nextMetadata,
    });
  }

  private async readChildrenFromLedgers(
    organizationId: string,
    childIds: ProductGenerationChildIds,
  ): Promise<ProductGenerationChildren> {
    const [detail, thumbnail] = await Promise.all([
      childIds.detailPageGenerationId
        ? this.prisma.contentGeneration.findFirst({
            where: { id: childIds.detailPageGenerationId, organizationId },
            select: { status: true },
          })
        : null,
      childIds.thumbnailGenerationId
        ? this.prisma.thumbnailGeneration.findFirst({
            where: {
              id: childIds.thumbnailGenerationId,
              organizationId,
              isDeleted: false,
            },
            select: { status: true },
          })
        : null,
    ]);

    return {
      detail_page: normalizeDetailStatus(detail?.status),
      thumbnail: normalizeThumbnailStatus(thumbnail?.status),
    };
  }
}
