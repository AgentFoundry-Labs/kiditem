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
  RegistrationTargetCreateInput,
  RegistrationTargetResolveInput,
  RegistrationTargetUpdateInput,
} from '@kiditem/shared/sales-product';
import type {
  RegistrationTargetRecord,
  RegistrationTargetRepositoryPort,
} from '../../../application/port/out/persistence/registration-target.repository.port';

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

const TARGET_INCLUDE = {
  selectedOptions: {
    orderBy: { sortOrder: 'asc' as const },
    select: {
      salesProductOptionId: true,
      salePrice: true,
      normalPrice: true,
      supplyPrice: true,
    },
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
          displayName: null,
          registrationInput: {},
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
  async create(organizationId: string, input: RegistrationTargetCreateInput): Promise<string> {
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

  private async createTarget(organizationId: string, input: RegistrationTargetCreateInput): Promise<string> {
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
          displayName: input.displayName,
          registrationInput: input.registrationInput as Prisma.InputJsonValue,
          selectedOptions: input.selectedOptions.length === 0
            ? undefined
            : {
              createMany: {
                data: input.selectedOptions.map((option, sortOrder) => ({
                  salesProductOptionId: option.salesProductOptionId,
                  sortOrder,
                  salePrice: option.salePrice,
                  normalPrice: option.normalPrice,
                  supplyPrice: option.supplyPrice,
                })),
              },
            },
        },
        select: { id: true },
      });
      return created.id;
    }, TRANSACTION_OPTIONS);
  }

  async update(
    organizationId: string,
    targetId: string,
    input: RegistrationTargetUpdateInput,
  ): Promise<void> {
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

      await validateReferences(tx, organizationId, current.salesProductId, current.channelAccountId, {
        allowArchivedProduct: true,
      });
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
          displayName: input.displayName,
          registrationInput: input.registrationInput as Prisma.InputJsonValue,
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
            salePrice: option.salePrice,
            normalPrice: option.normalPrice,
            supplyPrice: option.supplyPrice,
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
): Promise<{ status: string; sourceCandidateId: string | null }> {
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
    select: { id: true, status: true, sourceCandidateId: true },
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
  return { status: product.status, sourceCandidateId: product.sourceCandidateId };
}

async function validateSelectedOptions(
  tx: Tx,
  input: {
    organizationId: string;
    salesProductId: string;
    selectedOptions: RegistrationTargetCreateInput['selectedOptions'];
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
    displayName: row.displayName,
    registrationInput: asRecord(row.registrationInput),
    selectedOptions: row.selectedOptions.map((option) => ({
      salesProductOptionId: option.salesProductOptionId,
      salePrice: option.salePrice,
      normalPrice: option.normalPrice,
      supplyPrice: option.supplyPrice,
    })),
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

function asRecord(value: Prisma.JsonValue): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
