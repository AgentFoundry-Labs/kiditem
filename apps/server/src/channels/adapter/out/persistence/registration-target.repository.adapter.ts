import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  PRODUCT_TRANSACTIONAL_READ_PORT,
  type ProductTransactionalReadPort,
} from '../../../../products/application/port/in/product-transactional-read.port';
import { ensureSalesProductCodesInTransaction } from './sales-product-code-rows';
import { RegistrationTargetException } from '../../../application/exception/registration-target.exception';
import type {
  RegistrationMallInput,
  RegistrationTargetResolveInput,
  RegistrationTargetUpdateInput,
} from '@kiditem/shared/sales-product';
import {
  RegistrationMallInputError,
  emptyRegistrationMallInput,
  normalizeRegistrationMallInput,
} from '../../../domain/registration/registration-mall-input';
import {
  REGISTRATION_CONTENT_WORKSPACE_PORT,
  type RegistrationContentWorkspacePort,
} from '../../../../content/application/port/in/workspace/registration-content-workspace.port';
import { ownerTransaction } from '../../../../prisma/owner-transaction';
import type {
  RegistrationTargetCreateRecord,
  RegistrationTargetRecord,
  RegistrationTargetRepositoryPort,
} from '../../../application/port/out/persistence/registration-target.repository.port';

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

const TARGET_INCLUDE = {
  selectedOptions: {
    orderBy: { sortOrder: 'asc' as const },
    select: { salesProductOptionId: true },
  },
  salesProduct: {
    select: {
      name: true,
      options: {
        orderBy: [{ sortOrder: 'asc' as const }, { optionCode: 'asc' as const }],
        select: {
          id: true,
          optionCode: true,
          values: true,
          salePrice: true,
          normalPrice: true,
        },
      },
    },
  },
} satisfies Prisma.RegistrationTargetInclude;

type TargetRow = Prisma.RegistrationTargetGetPayload<{ include: typeof TARGET_INCLUDE }>;
type Tx = Prisma.TransactionClient;

@Injectable()
export class RegistrationTargetRepositoryAdapter implements RegistrationTargetRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRODUCT_TRANSACTIONAL_READ_PORT)
    private readonly productTransactionalRead: ProductTransactionalReadPort,
    /** 고른 대표이미지 자산 · 상세 revision 이 이 상품 작업공간의 것인지 Content 가 본다. */
    @Inject(REGISTRATION_CONTENT_WORKSPACE_PORT)
    private readonly contentWorkspaces: RegistrationContentWorkspacePort,
  ) {}

  /** 셀피아 단품 id → 코드. KID 발급이 단품 하나짜리 구성의 원천 코드를 다시 쓸 때만 읽는다. */
  private async readMasterProductCodes(
    tx: Tx,
    organizationId: string,
    masterProductIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>> {
    if (masterProductIds.length === 0) return new Map();
    const identities = await this.productTransactionalRead.readSourceIdentities(
      { client: tx },
      { organizationId, selector: { kind: 'ids', values: [...masterProductIds] } },
    );
    return new Map(identities.map((identity) => [identity.masterProductId, identity.code]));
  }

  async resolve(organizationId: string, input: RegistrationTargetResolveInput): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const product = await validateReferences(tx, organizationId, input.salesProductId, input.channelAccountId, {
        allowArchivedProduct: true,
      });
      // 상품 × 몰 계정당 활성 설정은 하나다(부분 유일키). 고를 것이 없으니 찾거나 만든다.
      const existing = await tx.registrationTarget.findFirst({
        where: {
          organizationId,
          salesProductId: input.salesProductId,
          channelAccountId: input.channelAccountId,
          archivedAt: null,
        },
        select: { id: true },
      });
      if (existing) return existing.id;
      if (product.status === 'archived') {
        throw new RegistrationTargetException('invalid', '보관된 판매상품에는 새 등록 설정을 만들 수 없습니다.');
      }
      // 첫 등록 설정을 만드는 순간이 곧 판매 결정이다 — 여기서 KID 를 발급한다(KID-310).
      // 발급은 트랜잭션 밖 시퀀스라 되돌아오지 않는다: 거절할 이유는 모두 이 앞에서 본다.
      await ensureSalesProductCodesInTransaction(tx, organizationId, input.salesProductId,
        (ids) => this.readMasterProductCodes(tx, organizationId, ids));
      const options = await tx.salesProductOption.findMany({
        where: { organizationId, salesProductId: input.salesProductId, supplyStatus: { not: 'unused' } },
        orderBy: [{ sortOrder: 'asc' }, { optionCode: 'asc' }],
        select: { id: true },
      });
      const created = await tx.registrationTarget.create({
        data: {
          organizationId,
          salesProductId: input.salesProductId,
          channelAccountId: input.channelAccountId,
          registrationInput: emptyRegistrationMallInput() as Prisma.InputJsonValue,
          selectedOptions: options.length === 0 ? undefined : {
            createMany: { data: options.map((option, sortOrder) => ({
              salesProductOptionId: option.id,
              sortOrder,
            })) },
          },
        },
        select: { id: true },
      });
      return created.id;
    }, TRANSACTION_OPTIONS);
  }

  async list(organizationId: string, salesProductId: string): Promise<RegistrationTargetRecord[]> {
    const rows = await this.prisma.registrationTarget.findMany({
      where: {
        organizationId,
        salesProductId,
        archivedAt: null,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: TARGET_INCLUDE,
    });
    return rows.map(toRecord);
  }

  async get(organizationId: string, targetId: string): Promise<RegistrationTargetRecord | null> {
    const row = await this.prisma.registrationTarget.findFirst({
      where: {
        id: targetId,
        organizationId,
        archivedAt: null,
      },
      include: TARGET_INCLUDE,
    });
    return row ? toRecord(row) : null;
  }

  /**
   * 상품 × 몰 계정당 등록 설정은 하나다(ADR-0022). 이미 있으면 부분 유일키가 막는데, 그것을
   * 데이터베이스 오류로 흘려보내면 화면이 왜 막혔는지 말하지 못한다.
   */
  async create(organizationId: string, input: RegistrationTargetCreateRecord): Promise<string> {
    try {
      return await this.createTarget(organizationId, input);
    } catch (error) {
      if (error && typeof error === 'object' && (error as { code?: unknown }).code === 'P2002') {
        throw new RegistrationTargetException(
          'conflict',
          '이 판매상품과 몰 계정에는 이미 등록 설정이 있습니다. 기존 설정을 고쳐주세요.',
        );
      }
      throw error;
    }
  }

  private async createTarget(organizationId: string, input: RegistrationTargetCreateRecord): Promise<string> {
    const registrationInput = mallInputOrInvalid(input.registrationInput);
    return this.prisma.$transaction(async (tx) => {
      await validateReferences(tx, organizationId, input.salesProductId, input.channelAccountId);
      await validateSelectedOptions(tx, {
        organizationId,
        salesProductId: input.salesProductId,
        selectedOptions: input.selectedOptions,
      });

      const created = await tx.registrationTarget.create({
        data: {
          organizationId,
          salesProductId: input.salesProductId,
          channelAccountId: input.channelAccountId,
          registrationInput: registrationInput as Prisma.InputJsonValue,
          selectedOptions: input.selectedOptions.length === 0
            ? undefined
            : {
              createMany: {
                data: input.selectedOptions.map((option, sortOrder) => ({
                  salesProductOptionId: option.salesProductOptionId,
                  sortOrder,
                })),
              },
            },
        },
        select: { id: true },
      });
      return created.id;
    }, TRANSACTION_OPTIONS);
  }

  /**
   * 이 몰에 더 보내지 않기로 한다.
   *
   * 준비 · 실행 중인 제출이 있으면 거절한다 — 나간 제출의 근거가 되는 설정을 치우면 그 결과를
   * 어디에 이어 붙일지 알 수 없다. 지난 실행 이력은 보관해도 그대로 남는다.
   */
  async archive(organizationId: string, targetId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM registration_targets
        WHERE id = ${targetId}::uuid AND organization_id = ${organizationId}::uuid
        FOR UPDATE
      `);
      const current = await tx.registrationTarget.findFirst({
        where: { id: targetId, organizationId, archivedAt: null },
        select: { id: true },
      });
      if (!current) throw new RegistrationTargetException('not_found', '등록 설정을 찾지 못했습니다.');
      const live = await tx.productRegistrationExecution.count({
        where: {
          organizationId,
          registrationTargetId: targetId,
          status: { in: ['prepared', 'executing', 'reconciling'] },
        },
      });
      if (live > 0) {
        throw new RegistrationTargetException(
          'conflict',
          'An active execution must be resolved before archiving its target.',
        );
      }
      await tx.registrationTarget.updateMany({
        where: { id: targetId, organizationId, archivedAt: null },
        data: { archivedAt: new Date() },
      });
    });
  }

  async update(
    organizationId: string,
    targetId: string,
    input: RegistrationTargetUpdateInput,
  ): Promise<void> {
    const registrationInput = mallInputOrInvalid(input.registrationInput);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM registration_targets
        WHERE id = ${targetId}::uuid AND organization_id = ${organizationId}::uuid
        FOR UPDATE
      `);
      const current = await tx.registrationTarget.findFirst({
        where: {
          id: targetId,
          organizationId,
          archivedAt: null,
        },
        select: {
          id: true,
          salesProductId: true,
          channelAccountId: true,
          version: true,
          selectedOptions: {
            select: { salesProductOptionId: true },
          },
        },
      });
      if (!current) {
        throw new RegistrationTargetException('not_found', '등록 설정을 찾지 못했습니다.');
      }
      if (current.version !== input.expectedVersion) {
        throw new RegistrationTargetException('conflict', '등록 설정이 다른 곳에서 변경되었습니다.');
      }

      const product = await validateReferences(tx, organizationId, current.salesProductId, current.channelAccountId, {
        allowArchivedProduct: true,
      });
      if (input.selectedThumbnailAssetId || input.selectedDetailPageRevisionId) {
        const handle = ownerTransaction(tx);
        const { workspaceId } = await this.contentWorkspaces.ensureSalesProductWorkspace(handle, {
          organizationId,
          salesProductId: current.salesProductId,
          displayName: product.name,
          createdByUserId: null,
        });
        await this.contentWorkspaces.validateSourceSelections(handle, {
          organizationId,
          sourceWorkspaceId: workspaceId,
          selectedThumbnailAssetId: input.selectedThumbnailAssetId,
          selectedDetailPageRevisionId: input.selectedDetailPageRevisionId,
        });
      }
      const existingOptionIds = new Set(
        current.selectedOptions.map((option) => option.salesProductOptionId),
      );
      await validateSelectedOptions(tx, {
        organizationId,
        salesProductId: current.salesProductId,
        selectedOptions: input.selectedOptions,
        existingOptionIds,
      });

      const updated = await tx.registrationTarget.updateMany({
        where: {
          id: current.id,
          organizationId,
          archivedAt: null,
          version: input.expectedVersion,
        },
        data: {
          registrationInput: registrationInput as Prisma.InputJsonValue,
          selectedThumbnailAssetId: input.selectedThumbnailAssetId,
          selectedDetailPageRevisionId: input.selectedDetailPageRevisionId,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new RegistrationTargetException('conflict', '등록 설정이 다른 곳에서 변경되었습니다.');
      }

      await tx.registrationTargetOption.deleteMany({
        where: {
          organizationId,
          registrationTargetId: current.id,
        },
      });
      if (input.selectedOptions.length > 0) {
        await tx.registrationTargetOption.createMany({
          data: input.selectedOptions.map((option, sortOrder) => ({
            organizationId,
            registrationTargetId: current.id,
            salesProductOptionId: option.salesProductOptionId,
            sortOrder,
          })),
        });
      }
    }, TRANSACTION_OPTIONS);
  }
}

async function validateReferences(
  tx: Tx,
  organizationId: string,
  salesProductId: string,
  channelAccountId: string,
  options: { allowArchivedProduct?: boolean } = {},
): Promise<{ name: string; status: string; sourceRecordId: string | null }> {
  // Serialize new references with option archive/delete/composition planning.
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM sales_products
    WHERE id = ${salesProductId}::uuid AND organization_id = ${organizationId}::uuid
    FOR UPDATE
  `);
  const organization = await tx.organization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  });
  if (!organization) {
    throw new RegistrationTargetException('invalid', '조직에 속하지 않은 등록 설정입니다.');
  }

  const product = await tx.salesProduct.findFirst({
    where: { id: salesProductId, organizationId },
    select: { id: true, name: true, status: true, sourceRecordId: true },
  });
  if (!product) {
    throw new RegistrationTargetException('invalid', '판매상품이 이 조직에 속하지 않습니다.');
  }
  if (product.status === 'archived' && !options.allowArchivedProduct) {
    throw new RegistrationTargetException('invalid', '보관된 판매상품에는 새 등록 설정을 만들 수 없습니다.');
  }

  const account = await tx.channelAccount.findFirst({
    where: { id: channelAccountId, organizationId, status: 'active' },
    select: { id: true },
  });
  if (!account) {
    throw new RegistrationTargetException('invalid', '활성 채널 계정이 이 조직에 속하지 않습니다.');
  }
  return { name: product.name, status: product.status, sourceRecordId: product.sourceRecordId };
}

async function validateSelectedOptions(
  tx: Tx,
  input: {
    organizationId: string;
    salesProductId: string;
    selectedOptions: RegistrationTargetCreateRecord['selectedOptions'];
    existingOptionIds?: ReadonlySet<string>;
  },
): Promise<void> {
  const ids = input.selectedOptions.map((option) => option.salesProductOptionId);
  if (new Set(ids).size !== ids.length) {
    throw new RegistrationTargetException('invalid', '같은 옵션을 두 번 선택할 수 없습니다.');
  }
  if (ids.length === 0) return;

  const options = await tx.salesProductOption.findMany({
    where: {
      organizationId: input.organizationId,
      salesProductId: input.salesProductId,
      id: { in: ids },
    },
    select: { id: true, supplyStatus: true },
  });
  if (options.length !== ids.length) {
    throw new RegistrationTargetException('invalid', '선택한 옵션이 해당 판매상품에 없습니다.');
  }

  const existing = input.existingOptionIds ?? new Set<string>();
  if (options.some((option) => option.supplyStatus === 'unused' && !existing.has(option.id))) {
    throw new RegistrationTargetException('invalid', '미사용 처리된 옵션은 새 등록 설정에 선택할 수 없습니다.');
  }
}

function toRecord(row: TargetRow): RegistrationTargetRecord {
  return {
    id: row.id,
    salesProductId: row.salesProductId,
    channelAccountId: row.channelAccountId,
    version: row.version,
    registrationInput: normalizeRegistrationMallInput(row.registrationInput),
    selectedThumbnailAssetId: row.selectedThumbnailAssetId,
    selectedDetailPageRevisionId: row.selectedDetailPageRevisionId,
    selectedOptions: row.selectedOptions.map((option) => ({ salesProductOptionId: option.salesProductOptionId })),
    product: {
      name: row.salesProduct.name,
      options: row.salesProduct.options.map((option) => ({
        id: option.id,
        code: option.optionCode,
        values: option.values,
        salePrice: option.salePrice,
        normalPrice: option.normalPrice,
      })),
    },
  };
}

/** 몰 값 규칙을 등록 설정의 400 으로 바꾼다. 거절한 키 이름이 메시지에 있다. */
function mallInputOrInvalid(raw: unknown): RegistrationMallInput {
  try {
    return normalizeRegistrationMallInput(raw);
  } catch (error) {
    if (error instanceof RegistrationMallInputError) throw new RegistrationTargetException('invalid', error.message);
    throw error;
  }
}
